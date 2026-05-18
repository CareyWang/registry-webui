package server

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestRouterReservesAPIRoutesForBackendHandlers(t *testing.T) {
	auth := AuthConfig{Username: "admin", Password: "secret"}
	handler := New(Routes{
		StaticFiles: testStaticFiles(),
		Auth:        auth,
	})

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/unimplemented", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: auth.newSessionValue()})
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for unimplemented reserved API route", resp.Code)
	}
	if strings.Contains(resp.Body.String(), "<!doctype html>") {
		t.Fatal("/api/* route returned frontend HTML")
	}
}

func TestRouterServesFrontendForBrowserRoutes(t *testing.T) {
	handler := New(Routes{
		StaticFiles: testStaticFiles(),
	})

	for _, path := range []string{"/", "/overview", "/repositories/app%2Fbackend"} {
		t.Run(path, func(t *testing.T) {
			resp := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, path, nil)
			handler.ServeHTTP(resp, req)

			if resp.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", resp.Code)
			}
			if !strings.Contains(resp.Body.String(), "Registry API Wrapper") {
				t.Fatalf("body = %q", resp.Body.String())
			}
		})
	}
}

func TestRouterServesStaticAssetsDirectly(t *testing.T) {
	handler := New(Routes{
		StaticFiles: testStaticFiles(),
	})

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.Code)
	}
	if strings.TrimSpace(resp.Body.String()) != "console.log('ok');" {
		t.Fatalf("body = %q", resp.Body.String())
	}
}

func testStaticFiles() fs.FS {
	return fstest.MapFS{
		"index.html": {
			Data: []byte("<!doctype html><title>Registry API Wrapper</title>"),
		},
		"assets/app.js": {
			Data: []byte("console.log('ok');"),
		},
	}
}
