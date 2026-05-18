package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/registry"
)

const (
	dockerManifestV2MediaType   = "application/vnd.docker.distribution.manifest.v2+json"
	dockerManifestListMediaType = "application/vnd.docker.distribution.manifest.list.v2+json"
	ociImageManifestMediaType   = "application/vnd.oci.image.manifest.v1+json"
	ociImageIndexMediaType      = "application/vnd.oci.image.index.v1+json"
)

var manifestAcceptMediaTypes = []string{
	dockerManifestV2MediaType,
	dockerManifestListMediaType,
	ociImageManifestMediaType,
	ociImageIndexMediaType,
}

type headerRegistryClient interface {
	DoWithHeaders(ctx context.Context, method, path string, body io.Reader, headers http.Header) (*registry.Response, error)
}

type digestResponse struct {
	Repository  string `json:"repository"`
	Reference   string `json:"reference"`
	Digest      string `json:"digest"`
	ContentType string `json:"contentType"`
}

type manifestResponse struct {
	Repository    string               `json:"repository"`
	Reference     string               `json:"reference"`
	Digest        string               `json:"digest"`
	MediaType     string               `json:"mediaType"`
	SchemaVersion int                  `json:"schemaVersion"`
	Size          int64                `json:"size"`
	Layers        []manifestDescriptor `json:"layers,omitempty"`
	Manifests     []manifestDescriptor `json:"manifests,omitempty"`
	Raw           json.RawMessage      `json:"raw"`
}

type deleteManifestResponse struct {
	Repository string `json:"repository"`
	Digest     string `json:"digest"`
	Status     int    `json:"status"`
}

type manifestDescriptor struct {
	MediaType string           `json:"mediaType"`
	Size      int64            `json:"size"`
	Digest    string           `json:"digest"`
	Platform  manifestPlatform `json:"platform,omitempty"`
}

type manifestPlatform struct {
	Architecture string `json:"architecture,omitempty"`
	OS           string `json:"os,omitempty"`
	Variant      string `json:"variant,omitempty"`
}

type parsedManifest struct {
	SchemaVersion int                  `json:"schemaVersion"`
	MediaType     string               `json:"mediaType"`
	Layers        []manifestDescriptor `json:"layers"`
	Manifests     []manifestDescriptor `json:"manifests"`
}

func manifestAcceptHeader() http.Header {
	headers := make(http.Header)
	headers.Set("Accept", strings.Join(manifestAcceptMediaTypes, ", "))
	return headers
}

func (s *Server) digestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}

	repository, reference, ok := encodedRepositoryReference(r.URL.EscapedPath(), "/references/", "/digest")
	if !ok {
		apiNotFound(w, r)
		return
	}

	resp, err := s.doRegistryWithHeaders(r.Context(), http.MethodHead, "/v2/"+repository+"/manifests/"+reference, nil, manifestAcceptHeader())
	if err != nil {
		writeRegistryError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, digestResponse{
		Repository:  repository,
		Reference:   reference,
		Digest:      resp.Header.Get("Docker-Content-Digest"),
		ContentType: resp.Header.Get("Content-Type"),
	})
}

func (s *Server) manifestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodDelete {
		w.Header().Set("Allow", "GET, DELETE")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}

	repository, reference, ok := encodedRepositoryReference(r.URL.EscapedPath(), "/manifests/", "")
	if !ok {
		apiNotFound(w, r)
		return
	}

	if r.Method == http.MethodDelete {
		s.deleteManifest(w, r, repository, reference)
		return
	}

	resp, err := s.doRegistryWithHeaders(r.Context(), http.MethodGet, "/v2/"+repository+"/manifests/"+reference, nil, manifestAcceptHeader())
	if err != nil {
		writeRegistryError(w, err)
		return
	}

	var parsed parsedManifest
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		api.WriteError(w, api.NewError(http.StatusBadGateway, "REGISTRY_INVALID_RESPONSE", "Registry manifest response was invalid."))
		return
	}

	mediaType := parsed.MediaType
	if mediaType == "" {
		mediaType = resp.Header.Get("Content-Type")
	}

	response := manifestResponse{
		Repository:    repository,
		Reference:     reference,
		Digest:        resp.Header.Get("Docker-Content-Digest"),
		MediaType:     mediaType,
		SchemaVersion: parsed.SchemaVersion,
		Raw:           json.RawMessage(resp.Body),
	}

	if len(parsed.Layers) > 0 {
		response.Layers = parsed.Layers
		response.Size = sumDescriptorSizes(parsed.Layers)
	} else if len(parsed.Manifests) > 0 {
		response.Manifests = parsed.Manifests
		response.Size = sumDescriptorSizes(parsed.Manifests)
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *Server) deleteManifest(w http.ResponseWriter, r *http.Request, repository, digest string) {
	if !isDigestReference(digest) {
		writeError(w, http.StatusBadRequest, "invalid_digest", "manifest deletion requires a digest reference")
		return
	}
	if s.registry == nil {
		writeError(w, http.StatusInternalServerError, "registry_client_missing", "Registry client is not configured")
		return
	}

	resp, err := s.registry.Do(r.Context(), http.MethodDelete, "/v2/"+repository+"/manifests/"+digest, nil)
	if err != nil {
		writeRegistryError(w, err)
		return
	}

	status := resp.Status
	if status == 0 {
		status = http.StatusAccepted
	}
	writeJSON(w, status, deleteManifestResponse{
		Repository: repository,
		Digest:     digest,
		Status:     status,
	})
}

func (s *Server) doRegistryWithHeaders(ctx context.Context, method, path string, body io.Reader, headers http.Header) (*registry.Response, error) {
	if s.registry == nil {
		return nil, api.NewError(http.StatusInternalServerError, "registry_client_missing", "Registry client is not configured")
	}
	if client, ok := s.registry.(headerRegistryClient); ok {
		return client.DoWithHeaders(ctx, method, path, body, headers)
	}
	return s.registry.Do(ctx, method, path, body)
}

func writeRegistryError(w http.ResponseWriter, err error) {
	var apiErr *api.Error
	if errors.As(err, &apiErr) {
		api.WriteError(w, apiErr)
		return
	}
	api.WriteError(w, api.NewError(http.StatusBadGateway, "REGISTRY_REQUEST_FAILED", "Registry request failed."))
}

func sumDescriptorSizes(descriptors []manifestDescriptor) int64 {
	var total int64
	for _, descriptor := range descriptors {
		total += descriptor.Size
	}
	return total
}

func isDigestReference(reference string) bool {
	algorithm, encoded, ok := strings.Cut(reference, ":")
	return ok && algorithm != "" && encoded != "" && !strings.Contains(reference, "/")
}

func encodedRepositoryReference(escapedPath, marker, suffix string) (string, string, bool) {
	const prefix = "/api/repositories/"
	if !strings.HasPrefix(escapedPath, prefix) || (suffix != "" && !strings.HasSuffix(escapedPath, suffix)) {
		return "", "", false
	}

	body := strings.TrimPrefix(escapedPath, prefix)
	if suffix != "" {
		body = strings.TrimSuffix(body, suffix)
	}

	parts := strings.SplitN(body, marker, 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}

	repository, err := url.PathUnescape(strings.TrimSuffix(parts[0], "/"))
	if err != nil || repository == "" || strings.Contains(repository, "..") {
		return "", "", false
	}
	reference, err := url.PathUnescape(strings.Trim(parts[1], "/"))
	if err != nil || reference == "" || strings.Contains(reference, "..") {
		return "", "", false
	}
	return repository, reference, true
}
