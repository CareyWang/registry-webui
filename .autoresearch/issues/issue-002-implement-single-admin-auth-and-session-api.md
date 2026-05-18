# Implement single-admin auth and session API

## Description

Implement the configured single-admin authentication flow so only authorized users can access Registry management APIs and pages.

## Acceptance Criteria

- [x] `POST /api/session` returns `{ "authenticated": true }` for valid admin credentials.
- [x] `POST /api/session` returns a non-2xx response for invalid credentials.
- [x] `DELETE /api/session` clears the current session.
- [x] Session cookies use `HttpOnly` and `SameSite=Lax`.
- [x] `/api/*` routes that require authentication reject unauthenticated requests.
- [x] Tests cover valid login, invalid login, logout, and protected API access.

## Dependencies

Issue #1

## Type

backend

## Priority

high
