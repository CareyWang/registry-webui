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

func TestTagsDecodesRepositoryNameAndCallsRegistryTagsWithQuery(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Link": []string{`</v2/app/backend/tags/list?n=2&last=v1.0.0>; rel="next"`},
			},
			Body: []byte(`{"name":"app/backend","tags":["latest","v1.0.0"]}`),
		},
	}
	handler := newTagsTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/tags?n=2&last=latest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodGet || fakeRegistry.path != "/v2/app/backend/tags/list?last=latest&n=2" {
		t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
	}

	var body tagsResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Repository != "app/backend" || len(body.Tags) != 2 || body.Tags[0] != "latest" {
		t.Fatalf("body = %+v", body)
	}
	if !body.Pagination.HasNext || body.Pagination.Next != "v1.0.0" {
		t.Fatalf("pagination = %+v", body.Pagination)
	}
}

func TestTagsUsesDefaultPageSizeAndHandlesMissingLink(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: make(http.Header),
			Body:   []byte(`{"name":"library/alpine","tags":["latest"]}`),
		},
	}
	handler := newTagsTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/library%2Falpine/tags")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.path != "/v2/library/alpine/tags/list?n=100" {
		t.Fatalf("registry path = %q", fakeRegistry.path)
	}

	var body tagsResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Pagination.HasNext || body.Pagination.Next != "" {
		t.Fatalf("pagination = %+v", body.Pagination)
	}
}

func TestTagsPropagatesUpstreamErrorResponse(t *testing.T) {
	registryStatus := http.StatusNotFound
	fakeRegistry := &fakeRegistryClient{
		err: &api.Error{
			Code:           "REGISTRY_NOT_FOUND",
			Message:        "Registry resource was not found.",
			Status:         http.StatusNotFound,
			RegistryStatus: &registryStatus,
		},
	}
	handler := newTagsTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fmissing/tags")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.Code)
	}
	var body struct {
		Error api.Error `json:"error"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Error.Code != "REGISTRY_NOT_FOUND" {
		t.Fatalf("error = %+v", body.Error)
	}
}

func newTagsTestHandler(registryClient registryClient) http.Handler {
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
