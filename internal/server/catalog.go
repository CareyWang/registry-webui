package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/careywong/registry-webui/internal/api"
)

type catalogResponse struct {
	Repositories []string           `json:"repositories"`
	Pagination   paginationResponse `json:"pagination"`
}

type paginationResponse struct {
	Next    string `json:"next,omitempty"`
	HasNext bool   `json:"hasNext"`
}

func (s *Server) repositoriesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	if s.registry == nil {
		writeError(w, http.StatusInternalServerError, "registry_client_missing", "Registry client is not configured")
		return
	}

	registryPath := "/v2/_catalog?" + catalogQuery(r, s.config.RegistryPageSize).Encode()
	resp, err := s.registry.Do(r.Context(), http.MethodGet, registryPath, nil)
	if err != nil {
		var apiErr *api.Error
		if errors.As(err, &apiErr) {
			api.WriteError(w, apiErr)
			return
		}
		api.WriteError(w, api.NewError(http.StatusBadGateway, "REGISTRY_REQUEST_FAILED", "Registry request failed."))
		return
	}

	var catalog struct {
		Repositories []string `json:"repositories"`
	}
	if err := json.Unmarshal(resp.Body, &catalog); err != nil {
		api.WriteError(w, api.NewError(http.StatusBadGateway, "REGISTRY_INVALID_RESPONSE", "Registry catalog response was invalid."))
		return
	}

	writeJSON(w, http.StatusOK, catalogResponse{
		Repositories: catalog.Repositories,
		Pagination:   parseNextPagination(resp.Header.Get("Link")),
	})
}

func catalogQuery(r *http.Request, defaultPageSize int) url.Values {
	values := make(url.Values)
	pageSize := defaultPageSize
	if requested := strings.TrimSpace(r.URL.Query().Get("n")); requested != "" {
		parsed, err := strconv.Atoi(requested)
		if err == nil && parsed > 0 && parsed <= 1000 {
			pageSize = parsed
		}
	}
	if pageSize <= 0 {
		pageSize = 100
	}
	values.Set("n", strconv.Itoa(pageSize))

	if last := strings.TrimSpace(r.URL.Query().Get("last")); last != "" {
		values.Set("last", last)
	}
	return values
}

func parseNextPagination(linkHeader string) paginationResponse {
	for _, part := range strings.Split(linkHeader, ",") {
		part = strings.TrimSpace(part)
		if !strings.Contains(part, `rel="next"`) {
			continue
		}
		start := strings.Index(part, "<")
		end := strings.Index(part, ">")
		if start == -1 || end == -1 || end <= start+1 {
			continue
		}
		linkURL, err := url.Parse(part[start+1 : end])
		if err != nil {
			continue
		}
		next := linkURL.Query().Get("last")
		if next == "" {
			continue
		}
		return paginationResponse{Next: next, HasNext: true}
	}
	return paginationResponse{HasNext: false}
}
