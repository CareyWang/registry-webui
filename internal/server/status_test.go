package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/config"
	"github.com/careywong/registry-webui/internal/registry"
)

func TestStatusCallsRegistryV2AndReturnsOverviewFields(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusOK},
	}
	handler := newStatusTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/status")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodGet || fakeRegistry.path != "/v2/" {
		t.Fatalf("registry call = %s %s, want GET /v2/", fakeRegistry.method, fakeRegistry.path)
	}

	var body statusResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.RegistryURL != "https://registry.example.com" ||
		!body.Available ||
		!body.Authenticated ||
		body.PageSize != 100 ||
		body.RequestTimeout != "30s" ||
		body.InsecureTLS ||
		body.DeleteCapability != deleteCapabilityUnknown {
		t.Fatalf("body = %+v", body)
	}
}

func TestStatusReturnsReadOnlySettingsWithoutSecrets(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusOK},
	}
	handler := New(Routes{
		StaticFiles: testStaticFiles(),
		Auth: AuthConfig{
			Username: "admin",
			Password: "admin-password",
		},
		Config: config.Config{
			RegistryURL:            "https://registry.example.com",
			RegistryUsername:       "registry-user",
			RegistryPassword:       "registry-password",
			RegistryPageSize:       250,
			RegistryRequestTimeout: 45 * time.Second,
			RegistryInsecureTLS:    true,
		},
		Registry: fakeRegistry,
	})

	resp := httptest.NewRecorder()
	auth := AuthConfig{Username: "admin", Password: "admin-password"}
	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: auth.newSessionValue()})
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}

	var body statusResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.RegistryURL != "https://registry.example.com" ||
		body.PageSize != 250 ||
		body.RequestTimeout != "45s" ||
		!body.InsecureTLS {
		t.Fatalf("body = %+v", body)
	}
	raw := resp.Body.String()
	if strings.Contains(raw, "registry-password") || strings.Contains(raw, "admin-password") {
		t.Fatalf("status response leaked a password: %s", raw)
	}
}

func TestStatusShowsRegistryUnauthorizedAsReadableState(t *testing.T) {
	registryStatus := http.StatusUnauthorized
	fakeRegistry := &fakeRegistryClient{
		err: &api.Error{
			Code:           "REGISTRY_UNAUTHORIZED",
			Message:        "Registry authentication failed.",
			Status:         http.StatusUnauthorized,
			RegistryStatus: &registryStatus,
			RegistryErrors: []api.RegistryError{
				{Code: "UNAUTHORIZED", Message: "authentication required"},
			},
		},
	}
	handler := newStatusTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/status")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.Code)
	}
	var body statusResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if !body.Available || body.Authenticated {
		t.Fatalf("available/authenticated = %v/%v, want true/false", body.Available, body.Authenticated)
	}
	if body.Error == nil || body.Error.Code != "REGISTRY_UNAUTHORIZED" {
		t.Fatalf("error = %+v", body.Error)
	}
}

func TestStatusShowsRegistryServerErrorAsUnavailableState(t *testing.T) {
	registryStatus := http.StatusInternalServerError
	fakeRegistry := &fakeRegistryClient{
		err: &api.Error{
			Code:           "REGISTRY_SERVER_ERROR",
			Message:        "Registry returned a server error.",
			Status:         http.StatusInternalServerError,
			RegistryStatus: &registryStatus,
		},
	}
	handler := newStatusTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/status")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.Code)
	}
	var body statusResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Available || body.Authenticated {
		t.Fatalf("available/authenticated = %v/%v, want false/false", body.Available, body.Authenticated)
	}
	if body.Error == nil || body.Error.Code != "REGISTRY_SERVER_ERROR" {
		t.Fatalf("error = %+v", body.Error)
	}
}

func newStatusTestHandler(registryClient registryClient) http.Handler {
	return New(Routes{
		StaticFiles: testStaticFiles(),
		Auth: AuthConfig{
			Username: "admin",
			Password: "secret",
		},
		Config: config.Config{
			RegistryURL:            "https://registry.example.com",
			RegistryPageSize:       100,
			RegistryRequestTimeout: 30 * time.Second,
		},
		Registry: registryClient,
	})
}

func authenticatedRequest(method, path string) *http.Request {
	auth := AuthConfig{Username: "admin", Password: "secret"}
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: auth.newSessionValue()})
	return req
}

type fakeRegistryClient struct {
	method   string
	path     string
	headers  http.Header
	calls    int
	response *registry.Response
	err      error
}

func (f *fakeRegistryClient) Do(ctx context.Context, method, path string, body io.Reader) (*registry.Response, error) {
	f.method = method
	f.path = path
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.response, nil
}

func (f *fakeRegistryClient) DoWithHeaders(ctx context.Context, method, path string, body io.Reader, headers http.Header) (*registry.Response, error) {
	f.headers = headers.Clone()
	return f.Do(ctx, method, path, body)
}
