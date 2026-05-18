# Implement digest and manifest APIs with Docker/OCI media support

## Description

Implement backend APIs for resolving a digest and fetching manifest details with Docker and OCI media type support.

## Acceptance Criteria

- [x] `GET /api/repositories/{encodedName}/references/{encodedReference}/digest` calls upstream `HEAD /v2/<name>/manifests/<reference>`.
- [x] Manifest `HEAD` and `GET` requests send Accept headers for Docker manifest v2, Docker manifest list v2, OCI image manifest, and OCI image index.
- [x] `GET /api/repositories/{encodedName}/manifests/{encodedReference}` returns digest, media type, schema version, computed size, layers or manifests, and raw manifest JSON.
- [x] Docker manifest v2 layer sizes are summed when layers are present.
- [x] Manifest list / OCI index returns platform entries without recursively fetching child manifests.
- [x] Tests cover digest resolution, Docker manifest v2, Docker manifest list, OCI image manifest, and OCI index responses.

## Dependencies

Issue #4

## Type

backend

## Priority

high
