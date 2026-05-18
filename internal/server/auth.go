package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/careywong/registry-webui/internal/api"
)

const sessionCookieName = "registry_webui_session"

type AuthConfig struct {
	Username string
	Password string
}

func (a AuthConfig) validate(username, password string) bool {
	return constantTimeEqual(username, a.Username) && constantTimeEqual(password, a.Password)
}

func (a AuthConfig) newSessionValue() string {
	mac := hmac.New(sha256.New, []byte(a.Password))
	_, _ = mac.Write([]byte(a.Username))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a AuthConfig) validSession(r *http.Request) bool {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return false
	}
	return constantTimeEqual(cookie.Value, a.newSessionValue())
}

func (a AuthConfig) sessionHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": a.validSession(r)})
	case http.MethodPost:
		a.login(w, r)
	case http.MethodDelete:
		clearSessionCookie(w)
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	}
}

func (a AuthConfig) login(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "request body must be valid JSON")
		return
	}

	if !a.validate(request.Username, request.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid username or password")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    a.newSessionValue(),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func constantTimeEqual(left, right string) bool {
	return hmac.Equal([]byte(left), []byte(right))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	api.WriteError(w, api.NewError(status, code, message))
}
