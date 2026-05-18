# Build Manifest Detail page with layers, platforms, and raw JSON

## Description

Build the Manifest Detail page so administrators can inspect digest, media type, layer/platform details, tag size, and raw JSON.

## Acceptance Criteria

- [x] The page displays repository, reference, digest, media type, schema version, and computed size.
- [x] Docker manifest v2 layer size is displayed as `Tag Size`, not `Disk Usage`.
- [x] Layer rows show digest, media type, and size.
- [x] Manifest list / OCI index displays platform entries without implying child manifests were recursively fetched.
- [x] Raw JSON is available in the Manifest Detail page.
- [x] Typecheck/lint passes.
- [x] Verify in browser using dev-browser skill.

## Dependencies

Issue #3, Issue #10

## Type

frontend

## Priority

medium
