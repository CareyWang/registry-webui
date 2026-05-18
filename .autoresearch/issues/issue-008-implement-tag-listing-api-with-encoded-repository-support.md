# Implement tag listing API with encoded repository support

## Description

Implement the backend tag listing API for repositories whose names may contain `/`, using Registry tag pagination.

## Acceptance Criteria

- [x] `GET /api/repositories/{encodedName}/tags?n=&last=` decodes the repository name safely.
- [x] The route calls upstream `GET /v2/<name>/tags/list?n=&last=`.
- [x] The backend forwards valid `n` and `last` query parameters.
- [x] The backend parses the upstream `Link` header.
- [x] The backend returns only `pagination.next` and `pagination.hasNext`, not the upstream raw URL.
- [x] Tests cover repository names containing `/`.
- [x] Tests cover first page, next page, missing `Link`, and upstream error response.

## Dependencies

Issue #4

## Type

backend

## Priority

high
