package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/config"
	"github.com/careywong/registry-webui/internal/registry"
)

func TestCatalogCallsRegistryCatalogWithQueryAndParsesNextLink(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Link": []string{`</v2/_catalog?n=2&last=app%2Ffrontend>; rel="next"`},
			},
			Body: []byte(`{"repositories":["app/backend","app/frontend"]}`),
		},
	}
	handler := newCatalogTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories?n=2&last=app/backend")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodGet || fakeRegistry.path != "/v2/_catalog?last=app%2Fbackend&n=2" {
		t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
	}

	var body catalogResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if len(body.Repositories) != 2 || body.Repositories[0] != "app/backend" || body.Repositories[1] != "app/frontend" {
		t.Fatalf("repositories = %#v", body.Repositories)
	}
	if !body.Pagination.HasNext || body.Pagination.Next != "app/frontend" {
		t.Fatalf("pagination = %+v", body.Pagination)
	}
}

func TestCatalogUsesDefaultPageSizeAndHandlesMissingLink(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: make(http.Header),
			Body:   []byte(`{"repositories":["app/backend"]}`),
		},
	}
	handler := newCatalogTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.path != "/v2/_catalog?n=100" {
		t.Fatalf("registry path = %q, want /v2/_catalog?n=100", fakeRegistry.path)
	}

	var body catalogResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Pagination.HasNext || body.Pagination.Next != "" {
		t.Fatalf("pagination = %+v", body.Pagination)
	}
}

func TestCatalogHandlesNextPageWithoutRawRegistryURL(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Link": []string{`<https://registry.example.com/v2/_catalog?last=repo2&n=2>; rel="next"`},
			},
			Body: []byte(`{"repositories":["repo1","repo2"]}`),
		},
	}
	handler := newCatalogTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories?n=2")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if contains := json.Valid(resp.Body.Bytes()); !contains {
		t.Fatalf("response is not JSON: %s", resp.Body.String())
	}
	if body := resp.Body.String(); body == "" || body == "https://registry.example.com" {
		t.Fatalf("unexpected body = %q", body)
	}

	var decoded catalogResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if decoded.Pagination.Next != "repo2" || !decoded.Pagination.HasNext {
		t.Fatalf("pagination = %+v", decoded.Pagination)
	}
}

func TestCatalogPropagatesUpstreamErrorResponse(t *testing.T) {
	registryStatus := http.StatusUnauthorized
	fakeRegistry := &fakeRegistryClient{
		err: &api.Error{
			Code:           "REGISTRY_UNAUTHORIZED",
			Message:        "Registry authentication failed.",
			Status:         http.StatusUnauthorized,
			RegistryStatus: &registryStatus,
		},
	}
	handler := newCatalogTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.Code)
	}
	var body struct {
		Error api.Error `json:"error"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Error.Code != "REGISTRY_UNAUTHORIZED" {
		t.Fatalf("error = %+v", body.Error)
	}
}

func newCatalogTestHandler(registryClient registryClient) http.Handler {
	return New(Routes{
		StaticFiles: testStaticFiles(),
		Auth: AuthConfig{
			Username: "admin",
			Password: "secret",
		},
		Config: config.Config{
			RegistryURL:      "https://registry.example.com",
			RegistryPageSize: 100,
		},
		Registry: registryClient,
	})
}
