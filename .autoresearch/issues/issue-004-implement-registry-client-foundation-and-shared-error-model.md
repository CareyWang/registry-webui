# Implement Registry client foundation and shared error model

## Description

Implement the backend Registry HTTP client and shared error model used by all Registry-facing API routes.

## Acceptance Criteria

- [x] Registry client uses configured `REGISTRY_URL`.
- [x] Registry client applies request timeout from `REGISTRY_REQUEST_TIMEOUT`.
- [x] Registry client uses Basic Auth when `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` are configured.
- [x] Registry client supports insecure TLS only when `REGISTRY_INSECURE_TLS=true`.
- [x] Backend errors use the documented `{ "error": { ... } }` shape.
- [x] Error responses include wrapper `code`, readable `message`, wrapper `status`, upstream `registryStatus`, and upstream `registryErrors` when available.
- [x] Tests cover upstream `401`, `404`, `405`, `UNSUPPORTED`, and `5xx` mapping.

## Dependencies

Issue #1

## Type

backend

## Priority

high
