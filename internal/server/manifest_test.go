package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/config"
	"github.com/careywong/registry-webui/internal/registry"
)

func TestDigestResolvesReferenceWithManifestAcceptHeaders(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Docker-Content-Digest": []string{"sha256:manifest"},
				"Content-Type":          []string{dockerManifestV2MediaType},
			},
		},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/references/latest/digest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodHead || fakeRegistry.path != "/v2/app/backend/manifests/latest" {
		t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
	}
	assertManifestAcceptHeader(t, fakeRegistry.headers.Get("Accept"))

	var body digestResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Repository != "app/backend" || body.Reference != "latest" || body.Digest != "sha256:manifest" || body.ContentType != dockerManifestV2MediaType {
		t.Fatalf("body = %+v", body)
	}
}

func TestManifestEscapesReferenceBeforeCallingRegistry(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Docker-Content-Digest": []string{"sha256:manifest"},
				"Content-Type":          []string{dockerManifestV2MediaType},
			},
			Body: []byte(`{"schemaVersion":2,"mediaType":"application/vnd.docker.distribution.manifest.v2+json","layers":[]}`),
		},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/manifests/release%3Fchannel%3Dprod")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.path != "/v2/app/backend/manifests/release%3Fchannel=prod" {
		t.Fatalf("registry path = %q, want escaped reference path", fakeRegistry.path)
	}
}

func TestManifestReturnsDockerManifestV2WithComputedLayerSize(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Docker-Content-Digest": []string{"sha256:manifest"},
				"Content-Type":          []string{dockerManifestV2MediaType},
			},
			Body: []byte(`{"schemaVersion":2,"mediaType":"application/vnd.docker.distribution.manifest.v2+json","config":{"mediaType":"application/vnd.docker.container.image.v1+json","size":7023,"digest":"sha256:config"},"layers":[{"mediaType":"application/vnd.docker.image.rootfs.diff.tar.gzip","size":10,"digest":"sha256:layer1"},{"mediaType":"application/vnd.docker.image.rootfs.diff.tar.gzip","size":15,"digest":"sha256:layer2"}]}`),
		},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/manifests/latest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodGet || fakeRegistry.path != "/v2/app/backend/manifests/latest" {
		t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
	}
	assertManifestAcceptHeader(t, fakeRegistry.headers.Get("Accept"))

	var body manifestResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Digest != "sha256:manifest" || body.MediaType != dockerManifestV2MediaType || body.SchemaVersion != 2 || body.Size != 25 {
		t.Fatalf("body = %+v", body)
	}
	if len(body.Layers) != 2 || body.Layers[0].Digest != "sha256:layer1" {
		t.Fatalf("layers = %+v", body.Layers)
	}
	if len(body.Manifests) != 0 {
		t.Fatalf("manifests = %+v, want none", body.Manifests)
	}
	if !strings.Contains(string(body.Raw), `"schemaVersion":2`) {
		t.Fatalf("raw = %s", string(body.Raw))
	}
}

func TestManifestReturnsDockerManifestListWithoutChildFetch(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{
			Status: http.StatusOK,
			Header: http.Header{
				"Docker-Content-Digest": []string{"sha256:list"},
				"Content-Type":          []string{dockerManifestListMediaType},
			},
			Body: []byte(`{"schemaVersion":2,"mediaType":"application/vnd.docker.distribution.manifest.list.v2+json","manifests":[{"mediaType":"application/vnd.docker.distribution.manifest.v2+json","size":528,"digest":"sha256:amd64","platform":{"architecture":"amd64","os":"linux"}},{"mediaType":"application/vnd.docker.distribution.manifest.v2+json","size":529,"digest":"sha256:arm64","platform":{"architecture":"arm64","os":"linux","variant":"v8"}}]}`),
		},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/manifests/latest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.calls != 1 {
		t.Fatalf("registry calls = %d, want 1", fakeRegistry.calls)
	}
	var body manifestResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.MediaType != dockerManifestListMediaType || body.Size != 1057 || len(body.Manifests) != 2 || body.Manifests[1].Platform.Architecture != "arm64" {
		t.Fatalf("body = %+v", body)
	}
	if len(body.Layers) != 0 {
		t.Fatalf("layers = %+v, want none", body.Layers)
	}
}

func TestManifestReturnsOCIManifestAndIndex(t *testing.T) {
	cases := []struct {
		name      string
		mediaType string
		body      string
		wantSize  int64
		wantLayer bool
	}{
		{
			name:      "oci manifest",
			mediaType: ociImageManifestMediaType,
			body:      `{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","layers":[{"mediaType":"application/vnd.oci.image.layer.v1.tar+gzip","size":33,"digest":"sha256:layer"}]}`,
			wantSize:  33,
			wantLayer: true,
		},
		{
			name:      "oci index",
			mediaType: ociImageIndexMediaType,
			body:      `{"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json","manifests":[{"mediaType":"application/vnd.oci.image.manifest.v1+json","size":44,"digest":"sha256:linux","platform":{"architecture":"amd64","os":"linux"}}]}`,
			wantSize:  44,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fakeRegistry := &fakeRegistryClient{
				response: &registry.Response{
					Status: http.StatusOK,
					Header: http.Header{
						"Docker-Content-Digest": []string{"sha256:oci"},
						"Content-Type":          []string{tc.mediaType},
					},
					Body: []byte(tc.body),
				},
			}
			handler := newManifestTestHandler(fakeRegistry)

			resp := httptest.NewRecorder()
			req := authenticatedRequest(http.MethodGet, "/api/repositories/app%2Fbackend/manifests/latest")
			handler.ServeHTTP(resp, req)

			if resp.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body = %s", resp.Code, resp.Body.String())
			}
			var body manifestResponse
			if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
				t.Fatalf("response JSON error = %v", err)
			}
			if body.MediaType != tc.mediaType || body.Size != tc.wantSize {
				t.Fatalf("body = %+v", body)
			}
			if tc.wantLayer && len(body.Layers) != 1 {
				t.Fatalf("layers = %+v", body.Layers)
			}
			if !tc.wantLayer && len(body.Manifests) != 1 {
				t.Fatalf("manifests = %+v", body.Manifests)
			}
		})
	}
}

func TestManifestDeleteCallsRegistryWithDigest(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusAccepted},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedJSONRequest(http.MethodDelete, "/api/repositories/app%2Fbackend/manifests/sha256%3Amanifest", `{"confirmedReference":"latest"}`)
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.method != http.MethodDelete || fakeRegistry.path != "/v2/app/backend/manifests/sha256:manifest" {
		t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
	}

	var body deleteManifestResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}
	if body.Repository != "app/backend" || body.Digest != "sha256:manifest" || body.Status != http.StatusAccepted || !body.Deleted {
		t.Fatalf("body = %+v", body)
	}
}

func TestManifestDeleteRequiresConfirmedReference(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusAccepted},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodDelete, "/api/repositories/app%2Fbackend/manifests/sha256%3Amanifest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.calls != 0 {
		t.Fatalf("registry calls = %d, want 0", fakeRegistry.calls)
	}
}

func TestManifestDeleteSurfacesDeleteDisabledRegistryResponses(t *testing.T) {
	cases := []struct {
		name       string
		err        *api.Error
		wantStatus int
		wantCode   string
	}{
		{
			name: "method not allowed",
			err: &api.Error{
				Code:    "REGISTRY_METHOD_NOT_ALLOWED",
				Message: "Registry does not allow this operation.",
				Status:  http.StatusMethodNotAllowed,
			},
			wantStatus: http.StatusMethodNotAllowed,
			wantCode:   "REGISTRY_METHOD_NOT_ALLOWED",
		},
		{
			name: "unsupported",
			err: &api.Error{
				Code:    "REGISTRY_UNSUPPORTED",
				Message: "Registry reports this operation is unsupported.",
				Status:  http.StatusBadRequest,
				RegistryErrors: []api.RegistryError{
					{Code: "UNSUPPORTED", Message: "The operation is unsupported."},
				},
			},
			wantStatus: http.StatusBadRequest,
			wantCode:   "REGISTRY_UNSUPPORTED",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fakeRegistry := &fakeRegistryClient{err: tc.err}
			handler := newManifestTestHandler(fakeRegistry)

			resp := httptest.NewRecorder()
			req := authenticatedJSONRequest(http.MethodDelete, "/api/repositories/app%2Fbackend/manifests/sha256%3Amanifest", `{"confirmedReference":"latest"}`)
			handler.ServeHTTP(resp, req)

			if resp.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", resp.Code, tc.wantStatus, resp.Body.String())
			}
			if fakeRegistry.method != http.MethodDelete || fakeRegistry.path != "/v2/app/backend/manifests/sha256:manifest" {
				t.Fatalf("registry call = %s %s", fakeRegistry.method, fakeRegistry.path)
			}

			var body struct {
				Error api.Error `json:"error"`
			}
			if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
				t.Fatalf("response JSON error = %v", err)
			}
			if body.Error.Code != tc.wantCode {
				t.Fatalf("error code = %q, want %q", body.Error.Code, tc.wantCode)
			}
		})
	}
}

func TestManifestDeleteRejectsTagReference(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusAccepted},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodDelete, "/api/repositories/app%2Fbackend/manifests/latest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.calls != 0 {
		t.Fatalf("registry calls = %d, want 0", fakeRegistry.calls)
	}
}

func TestTagStringDeleteRouteIsNotExposed(t *testing.T) {
	fakeRegistry := &fakeRegistryClient{
		response: &registry.Response{Status: http.StatusAccepted},
	}
	handler := newManifestTestHandler(fakeRegistry)

	resp := httptest.NewRecorder()
	req := authenticatedRequest(http.MethodDelete, "/api/repositories/app%2Fbackend/tags/latest")
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", resp.Code, resp.Body.String())
	}
	if fakeRegistry.calls != 0 {
		t.Fatalf("registry calls = %d, want 0", fakeRegistry.calls)
	}
}

func newManifestTestHandler(registryClient registryClient) http.Handler {
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

func assertManifestAcceptHeader(t *testing.T, accept string) {
	t.Helper()
	for _, mediaType := range manifestAcceptMediaTypes {
		if !strings.Contains(accept, mediaType) {
			t.Fatalf("Accept header %q missing %q", accept, mediaType)
		}
	}
}
