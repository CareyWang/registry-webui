package server

import (
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/registry"
)

const (
	deleteCapabilityUnknown     = "unknown"
	deleteCapabilityAvailable   = "available"
	deleteCapabilityUnavailable = "unavailable"
)

type registryClient interface {
	Do(ctx context.Context, method, path string, body io.Reader) (*registry.Response, error)
}

type statusResponse struct {
	RegistryURL      string     `json:"registryUrl"`
	Available        bool       `json:"available"`
	Authenticated    bool       `json:"authenticated"`
	PageSize         int        `json:"pageSize"`
	RequestTimeout   string     `json:"requestTimeout"`
	InsecureTLS      bool       `json:"insecureTLS"`
	DeleteCapability string     `json:"deleteCapability"`
	Error            *api.Error `json:"error,omitempty"`
}

func (s *Server) statusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	if s.registry == nil {
		writeError(w, http.StatusInternalServerError, "registry_client_missing", "Registry client is not configured")
		return
	}

	response := statusResponse{
		RegistryURL:      s.config.RegistryURL,
		PageSize:         s.config.RegistryPageSize,
		RequestTimeout:   s.config.RegistryRequestTimeout.String(),
		InsecureTLS:      s.config.RegistryInsecureTLS,
		DeleteCapability: deleteCapabilityUnknown,
	}

	_, err := s.registry.Do(r.Context(), http.MethodGet, "/v2/", nil)
	if err == nil {
		response.Available = true
		response.Authenticated = true
		writeJSON(w, http.StatusOK, response)
		return
	}

	var apiErr *api.Error
	if !errors.As(err, &apiErr) {
		apiErr = api.NewError(http.StatusBadGateway, "REGISTRY_REQUEST_FAILED", "Registry request failed.")
	}

	response.Error = apiErr
	switch apiErr.Status {
	case http.StatusUnauthorized:
		response.Available = true
		response.Authenticated = false
	default:
		response.Available = false
		response.Authenticated = false
	}

	writeJSON(w, http.StatusOK, response)
}
