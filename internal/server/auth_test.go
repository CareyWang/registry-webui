package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSessionLoginAcceptsValidAdminCredentials(t *testing.T) {
	handler := newAuthTestHandler()
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"username":"admin","password":"secret"}`))

	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	var body struct {
		Authenticated bool `json:"authenticated"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error: %v", err)
	}
	if !body.Authenticated {
		t.Fatalf("authenticated = false, want true")
	}

	cookie := findCookie(resp.Result().Cookies(), sessionCookieName)
	if cookie == nil {
		t.Fatal("session cookie was not set")
	}
	if !cookie.HttpOnly {
		t.Fatal("session cookie HttpOnly = false, want true")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("session cookie SameSite = %v, want Lax", cookie.SameSite)
	}
}

func TestSessionLoginRejectsInvalidCredentials(t *testing.T) {
	handler := newAuthTestHandler()
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"username":"admin","password":"wrong"}`))

	handler.ServeHTTP(resp, req)

	if resp.Code < 400 {
		t.Fatalf("status = %d, want non-2xx", resp.Code)
	}
	if findCookie(resp.Result().Cookies(), sessionCookieName) != nil {
		t.Fatal("session cookie was set for invalid credentials")
	}
}

func TestSessionLogoutClearsCurrentSession(t *testing.T) {
	handler := newAuthTestHandler()
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/session", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "existing-session"})

	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.Code)
	}
	cookie := findCookie(resp.Result().Cookies(), sessionCookieName)
	if cookie == nil {
		t.Fatal("session clear cookie was not set")
	}
	if cookie.MaxAge >= 0 {
		t.Fatalf("session cookie MaxAge = %d, want negative", cookie.MaxAge)
	}
}

func TestSessionStatusReportsCurrentAuthenticationState(t *testing.T) {
	handler := newAuthTestHandler()

	anonymousResp := httptest.NewRecorder()
	anonymousReq := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	handler.ServeHTTP(anonymousResp, anonymousReq)

	if anonymousResp.Code != http.StatusOK {
		t.Fatalf("anonymous status = %d, want 200", anonymousResp.Code)
	}
	var anonymousBody struct {
		Authenticated bool `json:"authenticated"`
	}
	if err := json.Unmarshal(anonymousResp.Body.Bytes(), &anonymousBody); err != nil {
		t.Fatalf("anonymous response JSON error: %v", err)
	}
	if anonymousBody.Authenticated {
		t.Fatal("anonymous authenticated = true, want false")
	}

	loginResp := httptest.NewRecorder()
	loginReq := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"username":"admin","password":"secret"}`))
	handler.ServeHTTP(loginResp, loginReq)

	authenticatedResp := httptest.NewRecorder()
	authenticatedReq := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	authenticatedReq.AddCookie(findCookie(loginResp.Result().Cookies(), sessionCookieName))
	handler.ServeHTTP(authenticatedResp, authenticatedReq)

	if authenticatedResp.Code != http.StatusOK {
		t.Fatalf("authenticated status = %d, want 200", authenticatedResp.Code)
	}
	var authenticatedBody struct {
		Authenticated bool `json:"authenticated"`
	}
	if err := json.Unmarshal(authenticatedResp.Body.Bytes(), &authenticatedBody); err != nil {
		t.Fatalf("authenticated response JSON error: %v", err)
	}
	if !authenticatedBody.Authenticated {
		t.Fatal("authenticated = false, want true")
	}
}

func TestProtectedAPIRoutesRejectUnauthenticatedRequests(t *testing.T) {
	handler := newAuthTestHandler()
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/unimplemented", nil)

	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body = %s", resp.Code, resp.Body.String())
	}
}

func TestProtectedAPIRoutesAllowAuthenticatedRequests(t *testing.T) {
	handler := newAuthTestHandler()
	loginResp := httptest.NewRecorder()
	loginReq := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"username":"admin","password":"secret"}`))
	handler.ServeHTTP(loginResp, loginReq)

	sessionCookie := findCookie(loginResp.Result().Cookies(), sessionCookieName)
	if sessionCookie == nil {
		t.Fatal("login did not set a session cookie")
	}

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/unimplemented", nil)
	req.AddCookie(sessionCookie)

	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for authenticated unimplemented API route", resp.Code)
	}
}

func newAuthTestHandler() http.Handler {
	return New(Routes{
		StaticFiles: testStaticFiles(),
		Auth: AuthConfig{
			Username: "admin",
			Password: "secret",
		},
	})
}

func findCookie(cookies []*http.Cookie, name string) *http.Cookie {
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}
