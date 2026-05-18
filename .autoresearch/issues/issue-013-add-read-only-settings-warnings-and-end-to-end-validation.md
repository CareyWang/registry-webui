# Add read-only Settings page, warnings, and end-to-end validation

## Description

Add the read-only Settings page, insecure TLS warning surfaces, and the final local Registry acceptance flow for v0.1.

## Acceptance Criteria

- [x] Settings displays Registry URL, page size, request timeout, and whether insecure TLS is enabled.
- [x] Settings never displays `REGISTRY_PASSWORD` or `ADMIN_PASSWORD`.
- [x] Overview or Settings shows a visible warning when `REGISTRY_INSECURE_TLS=true`.
- [x] Settings is read-only in v0.1.
- [x] A local `registry:2` manual test can complete login, status, repository list, tag list, manifest detail, and delete-disabled error flow.
- [x] Browser verification passes for login, overview, repository list, tag list, manifest detail, settings, and delete confirmation flows.
- [x] Typecheck/lint passes.
- [x] Verify in browser using dev-browser skill.

## Dependencies

Issue #3, Issue #5, Issue #12

## Type

fullstack

## Priority

medium
