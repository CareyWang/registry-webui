# Implement safe digest deletion flow end to end

## Description

Implement deletion as a digest-based flow across backend and frontend. The UI may start from a tag row, but the backend must delete only a resolved digest and must not expose a tag-string delete route.

## Acceptance Criteria

- [x] The UI enters deletion from a tag row but fetches the current digest before showing the confirmation dialog.
- [x] The confirmation dialog displays repository, tag, digest, and the effective `DELETE /v2/<name>/manifests/<digest>` operation.
- [x] The dialog includes the fixed warning that other tags pointing to the same digest may be affected.
- [x] The dialog states that disk space is not released until external Registry garbage collection runs.
- [x] The user must type the tag name before the delete button is enabled.
- [x] `DELETE /api/repositories/{encodedName}/manifests/{encodedDigest}` calls upstream `DELETE /v2/<name>/manifests/<digest>`.
- [x] The backend does not expose `DELETE /api/repositories/:name/tags/:tag`.
- [x] Successful deletion shows status `202` and refreshes the current tag list.
- [x] `405` and `UNSUPPORTED` delete failures are shown without attempting to modify Registry configuration.
- [x] Tests cover successful delete and delete-disabled Registry responses.
- [x] Verify in browser using dev-browser skill.

## Dependencies

Issue #8, Issue #9, Issue #10

## Type

fullstack

## Priority

high
