# Add Registry status API and Overview page

## Description

Expose Registry connectivity through `GET /api/status` and show the status in the Overview page.

## Acceptance Criteria

- [x] `GET /api/status` calls upstream `GET /v2/`.
- [x] The API response includes `registryUrl`, `available`, `authenticated`, `pageSize`, and `deleteCapability`.
- [x] `deleteCapability` is one of `unknown`, `available`, or `unavailable`.
- [x] Overview displays Registry URL, API status, authentication status, repository count placeholder or value, page size, and delete capability.
- [x] Registry `401` and `5xx` responses are shown as readable UI states.
- [x] Verify in browser using dev-browser skill.

## Dependencies

Issue #3, Issue #4

## Type

fullstack

## Priority

high
