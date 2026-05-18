package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorUsesDocumentedEnvelope(t *testing.T) {
	registryStatus := http.StatusMethodNotAllowed
	resp := httptest.NewRecorder()

	WriteError(resp, &Error{
		Code:           "REGISTRY_UNSUPPORTED",
		Message:        "Registry reports this operation is unsupported.",
		Status:         http.StatusMethodNotAllowed,
		RegistryStatus: &registryStatus,
		RegistryErrors: []RegistryError{
			{Code: "UNSUPPORTED", Message: "The operation is unsupported."},
		},
	})

	if resp.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", resp.Code)
	}

	var body struct {
		Error Error `json:"error"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON error = %v", err)
	}

	if body.Error.Code != "REGISTRY_UNSUPPORTED" ||
		body.Error.Message != "Registry reports this operation is unsupported." ||
		body.Error.Status != http.StatusMethodNotAllowed ||
		body.Error.RegistryStatus == nil ||
		*body.Error.RegistryStatus != http.StatusMethodNotAllowed ||
		len(body.Error.RegistryErrors) != 1 ||
		body.Error.RegistryErrors[0].Code != "UNSUPPORTED" {
		t.Fatalf("response body = %+v", body.Error)
	}
}
