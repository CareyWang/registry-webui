package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/careywong/registry-webui/internal/api"
)

type tagsResponse struct {
	Repository string             `json:"repository"`
	Tags       []string           `json:"tags"`
	Pagination paginationResponse `json:"pagination"`
}

func (s *Server) repositorySubresourceHandler(w http.ResponseWriter, r *http.Request) {
	escapedPath := r.URL.EscapedPath()
	if strings.HasSuffix(escapedPath, "/tags") {
		s.tagsHandler(w, r)
		return
	}
	if strings.Contains(escapedPath, "/references/") && strings.HasSuffix(escapedPath, "/digest") {
		s.digestHandler(w, r)
		return
	}
	if strings.Contains(escapedPath, "/manifests/") {
		s.manifestHandler(w, r)
		return
	}
	apiNotFound(w, r)
}

func (s *Server) tagsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	if s.registry == nil {
		writeError(w, http.StatusInternalServerError, "registry_client_missing", "Registry client is not configured")
		return
	}

	repository, ok := encodedRepositoryName(r.URL.EscapedPath(), "/tags")
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "API route is not implemented")
		return
	}

	registryPath := "/v2/" + repository + "/tags/list?" + catalogQuery(r, s.config.RegistryPageSize).Encode()
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

	var tags struct {
		Name string   `json:"name"`
		Tags []string `json:"tags"`
	}
	if err := json.Unmarshal(resp.Body, &tags); err != nil {
		api.WriteError(w, api.NewError(http.StatusBadGateway, "REGISTRY_INVALID_RESPONSE", "Registry tags response was invalid."))
		return
	}
	if tags.Tags == nil {
		tags.Tags = []string{}
	}

	writeJSON(w, http.StatusOK, tagsResponse{
		Repository: repository,
		Tags:       tags.Tags,
		Pagination: parseNextPagination(resp.Header.Get("Link")),
	})
}

func encodedRepositoryName(escapedPath, suffix string) (string, bool) {
	const prefix = "/api/repositories/"
	if !strings.HasPrefix(escapedPath, prefix) || !strings.HasSuffix(escapedPath, suffix) {
		return "", false
	}

	encodedName := strings.TrimSuffix(strings.TrimPrefix(escapedPath, prefix), suffix)
	encodedName = strings.TrimSuffix(encodedName, "/")
	if encodedName == "" {
		return "", false
	}

	name, err := url.PathUnescape(encodedName)
	if err != nil || name == "" || strings.Contains(name, "..") {
		return "", false
	}
	return name, true
}
