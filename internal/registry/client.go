package registry

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/careywong/registry-webui/internal/api"
	"github.com/careywong/registry-webui/internal/config"
)

type Config struct {
	URL         string
	Username    string
	Password    string
	InsecureTLS bool
	Timeout     time.Duration
}

type Client struct {
	baseURL    *url.URL
	username   string
	password   string
	httpClient *http.Client
}

type Response struct {
	Status int
	Header http.Header
	Body   []byte
}

func NewFromConfig(cfg config.Config) (*Client, error) {
	return New(Config{
		URL:         cfg.RegistryURL,
		Username:    cfg.RegistryUsername,
		Password:    cfg.RegistryPassword,
		InsecureTLS: cfg.RegistryInsecureTLS,
		Timeout:     cfg.RegistryRequestTimeout,
	})
}

func New(cfg Config) (*Client, error) {
	baseURL, err := url.Parse(strings.TrimSpace(cfg.URL))
	if err != nil {
		return nil, fmt.Errorf("parse registry url: %w", err)
	}
	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("registry url must include scheme and host")
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Second
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{
		InsecureSkipVerify: cfg.InsecureTLS,
		MinVersion:         tls.VersionTLS12,
	}

	return &Client{
		baseURL:  baseURL,
		username: cfg.Username,
		password: cfg.Password,
		httpClient: &http.Client{
			Timeout:   cfg.Timeout,
			Transport: transport,
		},
	}, nil
}

func (c *Client) Do(ctx context.Context, method, registryPath string, body io.Reader) (*Response, error) {
	return c.DoWithHeaders(ctx, method, registryPath, body, nil)
}

func (c *Client) DoWithHeaders(ctx context.Context, method, registryPath string, body io.Reader, headers http.Header) (*Response, error) {
	requestURL := c.resolve(registryPath)
	req, err := http.NewRequestWithContext(ctx, method, requestURL.String(), body)
	if err != nil {
		return nil, fmt.Errorf("create registry request: %w", err)
	}
	for key, values := range headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	if c.username != "" && c.password != "" {
		req.SetBasicAuth(c.username, c.password)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read registry response: %w", err)
	}

	result := &Response{
		Status: resp.StatusCode,
		Header: resp.Header.Clone(),
		Body:   responseBody,
	}
	if resp.StatusCode >= 400 {
		return nil, mapRegistryError(resp.StatusCode, responseBody)
	}

	return result, nil
}

func (c *Client) resolve(registryPath string) *url.URL {
	cleanPath := cleanRegistryPath(registryPath)
	parsed, err := url.Parse(cleanPath)
	if err != nil {
		return c.baseURL.ResolveReference(&url.URL{Path: cleanPath})
	}
	if parsed.IsAbs() {
		return parsed
	}
	return c.baseURL.ResolveReference(parsed)
}

func cleanRegistryPath(registryPath string) string {
	if registryPath == "" {
		return "/"
	}
	if strings.HasPrefix(registryPath, "/") {
		return registryPath
	}
	return "/" + registryPath
}

func mapRegistryError(status int, body []byte) *api.Error {
	registryErrors := parseRegistryErrors(body)
	code, message := registryErrorCodeAndMessage(status, registryErrors)
	registryStatus := status

	return &api.Error{
		Code:           code,
		Message:        message,
		Status:         status,
		RegistryStatus: &registryStatus,
		RegistryErrors: registryErrors,
	}
}

func parseRegistryErrors(body []byte) []api.RegistryError {
	var decoded struct {
		Errors []api.RegistryError `json:"errors"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&decoded); err != nil {
		return nil
	}
	return decoded.Errors
}

func registryErrorCodeAndMessage(status int, registryErrors []api.RegistryError) (string, string) {
	if containsRegistryCode(registryErrors, "UNSUPPORTED") {
		return "REGISTRY_UNSUPPORTED", "Registry reports this operation is unsupported."
	}

	switch status {
	case http.StatusUnauthorized:
		return "REGISTRY_UNAUTHORIZED", "Registry authentication failed."
	case http.StatusNotFound:
		return "REGISTRY_NOT_FOUND", "Registry resource was not found."
	case http.StatusMethodNotAllowed:
		return "REGISTRY_METHOD_NOT_ALLOWED", "Registry does not allow this operation."
	default:
		if status >= 500 {
			return "REGISTRY_SERVER_ERROR", "Registry returned a server error."
		}
		return "REGISTRY_ERROR", "Registry request failed."
	}
}

func containsRegistryCode(registryErrors []api.RegistryError, code string) bool {
	for _, registryError := range registryErrors {
		if strings.EqualFold(registryError.Code, code) {
			return true
		}
	}
	return false
}
