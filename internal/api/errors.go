package api

import (
	"encoding/json"
	"net/http"
)

type RegistryError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  any    `json:"detail,omitempty"`
}

type Error struct {
	Code           string          `json:"code"`
	Message        string          `json:"message"`
	Status         int             `json:"status"`
	RegistryStatus *int            `json:"registryStatus,omitempty"`
	RegistryErrors []RegistryError `json:"registryErrors,omitempty"`
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func WriteError(w http.ResponseWriter, err *Error) {
	if err == nil {
		err = &Error{
			Code:    "INTERNAL_ERROR",
			Message: "Internal server error.",
			Status:  http.StatusInternalServerError,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Status)
	_ = json.NewEncoder(w).Encode(map[string]*Error{"error": err})
}

func NewError(status int, code, message string) *Error {
	return &Error{
		Code:    code,
		Message: message,
		Status:  status,
	}
}
