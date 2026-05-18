# Implement repository catalog API with pagination

## Description

Implement the backend repository listing API using the Registry catalog endpoint and upstream pagination headers.

## Acceptance Criteria

- [x] `GET /api/repositories?n=&last=` calls upstream `GET /v2/_catalog?n=&last=`.
- [x] The backend forwards valid `n` and `last` query parameters.
- [x] The backend parses the upstream `Link` header.
- [x] The backend returns only `pagination.next` and `pagination.hasNext`, not the upstream raw URL.
- [x] Tests cover first page, next page, missing `Link`, and upstream error response.

## Dependencies

Issue #4

## Type

backend

## Priority

high
