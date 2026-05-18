package registry

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/config"
)

func TestNewFromConfigUsesRuntimeConfig(t *testing.T) {
	client, err := NewFromConfig(config.Config{
		RegistryURL:            "https://registry.example.com",
		RegistryUsername:       "configured-user",
		RegistryPassword:       "configured-secret",
		RegistryInsecureTLS:    true,
		RegistryRequestTimeout: 7 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewFromConfig() error = %v", err)
	}

	if client.baseURL.String() != "https://registry.example.com" {
		t.Fatalf("baseURL = %q", client.baseURL.String())
	}
	if client.username != "configured-user" || client.password != "configured-secret" {
		t.Fatalf("credentials = %q/%q", client.username, client.password)
	}
	if client.httpClient.Timeout != 7*time.Second {
		t.Fatalf("timeout = %s, want 7s", client.httpClient.Timeout)
	}
	tlsConfig := client.httpClient.Transport.(*http.Transport).TLSClientConfig
	if !tlsConfig.InsecureSkipVerify {
		t.Fatal("InsecureSkipVerify = false, want true")
	}
}

func TestClientUsesConfiguredRegistryURLAndBasicAuth(t *testing.T) {
	var sawBasicAuth bool
	client, err := New(Config{
		URL:      "https://registry.example.com",
		Username: "registry-user",
		Password: "registry-secret",
		Timeout:  2 * time.Second,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://registry.example.com/v2/" {
			t.Fatalf("url = %q, want https://registry.example.com/v2/", r.URL.String())
		}
		if r.URL.Path != "/v2/" {
			t.Fatalf("path = %q, want /v2/", r.URL.Path)
		}
		username, password, ok := r.BasicAuth()
		sawBasicAuth = ok && username == "registry-user" && password == "registry-secret"
		return registryResponse(http.StatusOK, `{}`), nil
	})

	resp, err := client.Do(context.Background(), http.MethodGet, "/v2/", nil)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	if resp.Status != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.Status)
	}
	if !sawBasicAuth {
		t.Fatal("request did not include configured Basic Auth credentials")
	}
}

func TestClientPreservesRegistryPathQueryString(t *testing.T) {
	client, err := New(Config{
		URL:     "https://registry.example.com",
		Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://registry.example.com/v2/_catalog?last=app%2Fbackend&n=2" {
			t.Fatalf("url = %q", r.URL.String())
		}
		return registryResponse(http.StatusOK, `{}`), nil
	})

	_, err = client.Do(context.Background(), http.MethodGet, "/v2/_catalog?last=app%2Fbackend&n=2", nil)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
}

func TestClientSendsCustomHeaders(t *testing.T) {
	client, err := New(Config{
		URL:     "https://registry.example.com",
		Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Accept") != "application/vnd.test+json" {
			t.Fatalf("Accept = %q", r.Header.Get("Accept"))
		}
		return registryResponse(http.StatusOK, `{}`), nil
	})

	headers := make(http.Header)
	headers.Set("Accept", "application/vnd.test+json")
	_, err = client.DoWithHeaders(context.Background(), http.MethodGet, "/v2/test", nil, headers)
	if err != nil {
		t.Fatalf("DoWithHeaders() error = %v", err)
	}
}

func TestClientAppliesRequestTimeout(t *testing.T) {
	client, err := New(Config{
		URL:     "https://registry.example.com",
		Timeout: 1 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		select {
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-time.After(50 * time.Millisecond):
			return registryResponse(http.StatusOK, `{}`), nil
		}
	})

	_, err = client.Do(context.Background(), http.MethodGet, "/v2/", nil)
	if err == nil {
		t.Fatal("Do() error = nil, want timeout error")
	}
}

func TestClientSupportsInsecureTLSOnlyWhenEnabled(t *testing.T) {
	secureClient, err := New(Config{
		URL:     "https://registry.example.com",
		Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("secure New() error = %v", err)
	}
	secureTLSConfig := secureClient.httpClient.Transport.(*http.Transport).TLSClientConfig
	if secureTLSConfig.InsecureSkipVerify {
		t.Fatal("secure client InsecureSkipVerify = true, want false")
	}

	insecureClient, err := New(Config{
		URL:         "https://registry.example.com",
		InsecureTLS: true,
		Timeout:     2 * time.Second,
	})
	if err != nil {
		t.Fatalf("insecure New() error = %v", err)
	}
	insecureTLSConfig := insecureClient.httpClient.Transport.(*http.Transport).TLSClientConfig
	if !insecureTLSConfig.InsecureSkipVerify {
		t.Fatal("insecure client InsecureSkipVerify = false, want true")
	}
	if insecureTLSConfig.MinVersion < tls.VersionTLS12 {
		t.Fatal("TLS client config should keep a modern minimum TLS version")
	}
}

func TestClientMapsRegistryErrorResponses(t *testing.T) {
	cases := []struct {
		name           string
		registryStatus int
		body           string
		wantCode       string
		wantMessage    string
	}{
		{
			name:           "401",
			registryStatus: http.StatusUnauthorized,
			body:           `{"errors":[{"code":"UNAUTHORIZED","message":"authentication required"}]}`,
			wantCode:       "REGISTRY_UNAUTHORIZED",
			wantMessage:    "Registry authentication failed.",
		},
		{
			name:           "404",
			registryStatus: http.StatusNotFound,
			body:           `{"errors":[{"code":"MANIFEST_UNKNOWN","message":"manifest unknown"}]}`,
			wantCode:       "REGISTRY_NOT_FOUND",
			wantMessage:    "Registry resource was not found.",
		},
		{
			name:           "405",
			registryStatus: http.StatusMethodNotAllowed,
			body:           `{"errors":[{"code":"DENIED","message":"requested access to the resource is denied"}]}`,
			wantCode:       "REGISTRY_METHOD_NOT_ALLOWED",
			wantMessage:    "Registry does not allow this operation.",
		},
		{
			name:           "unsupported",
			registryStatus: http.StatusMethodNotAllowed,
			body:           `{"errors":[{"code":"UNSUPPORTED","message":"The operation is unsupported."}]}`,
			wantCode:       "REGISTRY_UNSUPPORTED",
			wantMessage:    "Registry reports this operation is unsupported.",
		},
		{
			name:           "5xx",
			registryStatus: http.StatusInternalServerError,
			body:           `{"errors":[{"code":"UNKNOWN","message":"internal error"}]}`,
			wantCode:       "REGISTRY_SERVER_ERROR",
			wantMessage:    "Registry returned a server error.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client, err := New(Config{URL: "https://registry.example.com", Timeout: 2 * time.Second})
			if err != nil {
				t.Fatalf("New() error = %v", err)
			}
			client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
				return registryResponse(tc.registryStatus, tc.body), nil
			})

			_, err = client.Do(context.Background(), http.MethodGet, "/v2/", nil)
			if err == nil {
				t.Fatal("Do() error = nil, want registry error")
			}

			apiErr, ok := err.(*api.Error)
			if !ok {
				t.Fatalf("error type = %T, want *api.Error", err)
			}
			if apiErr.Code != tc.wantCode {
				t.Fatalf("code = %q, want %q", apiErr.Code, tc.wantCode)
			}
			if apiErr.Message != tc.wantMessage {
				t.Fatalf("message = %q, want %q", apiErr.Message, tc.wantMessage)
			}
			if apiErr.Status != tc.registryStatus {
				t.Fatalf("status = %d, want %d", apiErr.Status, tc.registryStatus)
			}
			if apiErr.RegistryStatus == nil || *apiErr.RegistryStatus != tc.registryStatus {
				t.Fatalf("registryStatus = %v, want %d", apiErr.RegistryStatus, tc.registryStatus)
			}
			if len(apiErr.RegistryErrors) != 1 {
				t.Fatalf("registryErrors length = %d, want 1", len(apiErr.RegistryErrors))
			}

			encoded, err := json.Marshal(map[string]api.Error{"error": *apiErr})
			if err != nil {
				t.Fatalf("marshal error = %v", err)
			}
			if !json.Valid(encoded) {
				t.Fatalf("encoded error is invalid JSON: %s", encoded)
			}
		})
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func registryResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
