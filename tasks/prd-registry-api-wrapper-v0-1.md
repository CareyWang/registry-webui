# PRD: Registry API Wrapper v0.1

## 1. Introduction / Overview

Registry API Wrapper v0.1 is a lightweight Web UI for self-hosted Docker Registry / CNCF Distribution instances. It wraps the official Registry HTTP API V2 and gives an administrator a browser-based way to check registry status, browse repositories and tags, inspect manifests, copy pull commands, and delete manifest digests.

The product deliberately avoids becoming Harbor, Nexus, a garbage-collection agent, or a Docker execution layer. It does not proxy `docker push` / `docker pull`, read host files, mount Docker Socket, edit Registry configuration, or infer data that the official API does not expose.

Source design:

- `docs/plans/2026-05-11-registry-api-wrapper-design.md`
- `docs/plans/2026-05-11-registry-api-wrapper-prototype.html`

## 2. Goals

- Provide a single-admin Web UI for official Registry HTTP API V2 operations.
- Let users browse repositories and tags using Registry pagination.
- Show digest, manifest, media type, layer/platform information, and tag size based on API responses.
- Make deletion semantics explicit: users delete a manifest digest, not a tag string.
- Keep the service stateless: no database, no background jobs, no metadata sync.
- Keep Registry credentials on the backend and never expose them to the browser.
- Preserve raw Registry errors enough for an operator to understand failed operations.

## 3. User Stories

### US-001: Configure and start the wrapper service

**Description:** As an operator, I want to configure the wrapper with environment variables so that I can deploy it next to an existing Registry without adding a database or Docker Socket access.

**Acceptance Criteria:**

- [ ] The service reads `APP_PORT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `REGISTRY_URL`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `REGISTRY_INSECURE_TLS`, `REGISTRY_PAGE_SIZE`, and `REGISTRY_REQUEST_TIMEOUT` from environment variables.
- [ ] Startup fails with a clear error when `REGISTRY_URL` is missing.
- [ ] Startup fails in production mode when `ADMIN_PASSWORD` is left as `change-me`.
- [ ] `REGISTRY_PAGE_SIZE` defaults to `100` and rejects values outside `10..1000`.
- [ ] Unit tests cover config parsing and invalid config cases.

### US-002: Log in as the single administrator

**Description:** As an administrator, I want to log in with the configured admin credentials so that only authorized users can access Registry management pages.

**Acceptance Criteria:**

- [ ] `POST /api/session` returns `{ "authenticated": true }` for valid admin credentials.
- [ ] `POST /api/session` returns a non-2xx response for invalid credentials.
- [ ] `DELETE /api/session` clears the current session.
- [ ] Session cookies use `HttpOnly` and `SameSite=Lax`.
- [ ] The login page redirects authenticated users to Overview.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003: Check Registry status on Overview

**Description:** As an administrator, I want to see whether the configured Registry is reachable so that I can confirm the wrapper is connected to the correct upstream service.

**Acceptance Criteria:**

- [ ] `GET /api/status` calls upstream `GET /v2/`.
- [ ] The API response includes `registryUrl`, `available`, `authenticated`, `pageSize`, and `deleteCapability`.
- [ ] `deleteCapability` is one of `unknown`, `available`, or `unavailable`.
- [ ] Overview displays Registry URL, API status, authentication status, repository count placeholder or value, page size, and delete capability.
- [ ] Registry 401 and 5xx responses are shown as readable UI states.
- [ ] Verify in browser using dev-browser skill.

### US-004: Browse repositories with pagination and search

**Description:** As an administrator, I want to browse repositories returned by the Registry catalog so that I can find an image repository without using curl.

**Acceptance Criteria:**

- [ ] `GET /api/repositories?n=&last=` calls upstream `GET /v2/_catalog?n=&last=`.
- [ ] The backend parses the upstream `Link` header and returns only `pagination.next` and `pagination.hasNext`.
- [ ] Repository names are listed in the Repositories page.
- [ ] Current-page search filters only repositories already loaded in the browser.
- [ ] A `Load all repositories` action fetches all pages through the backend API before filtering.
- [ ] The page supports refreshing the current list.
- [ ] Verify in browser using dev-browser skill.

### US-005: Browse tags and copy pull commands

**Description:** As an administrator, I want to open a repository and browse its tags so that I can inspect available image references and copy a valid pull command.

**Acceptance Criteria:**

- [ ] Repository names containing `/` are URL encoded in frontend routes and API calls.
- [ ] `GET /api/repositories/{encodedName}/tags?n=&last=` calls upstream `GET /v2/<name>/tags/list?n=&last=`.
- [ ] The backend parses tag pagination from the upstream `Link` header.
- [ ] The Repository Detail page shows tag rows with actions for Manifest, Pull, and Delete Manifest.
- [ ] Current-page tag search filters only tags already loaded in the browser.
- [ ] A `Load all tags` action fetches all tag pages before filtering.
- [ ] Pull command copy uses the configured Registry URL, repository name, and tag.
- [ ] Verify in browser using dev-browser skill.

### US-006: Inspect digest and manifest details

**Description:** As an administrator, I want to inspect a tag or digest manifest so that I can see the exact digest, media type, size, layer list, platform list, and raw JSON.

**Acceptance Criteria:**

- [ ] `GET /api/repositories/{encodedName}/references/{encodedReference}/digest` calls upstream `HEAD /v2/<name>/manifests/<reference>`.
- [ ] Manifest `HEAD` and `GET` requests send Accept headers for Docker manifest v2, Docker manifest list v2, OCI image manifest, and OCI image index.
- [ ] `GET /api/repositories/{encodedName}/manifests/{encodedReference}` returns digest, media type, schema version, computed size, layers or manifests, and raw manifest JSON.
- [ ] Docker manifest v2 layer size is displayed as `Tag Size`, not `Disk Usage`.
- [ ] Manifest list / OCI index displays platform entries without recursively fetching child manifests.
- [ ] Raw JSON is available in the Manifest Detail page.
- [ ] Verify in browser using dev-browser skill.

### US-007: Delete a manifest digest safely

**Description:** As an administrator, I want deletion to require digest confirmation so that I do not confuse deleting a manifest digest with deleting only one tag string.

**Acceptance Criteria:**

- [ ] The UI enters deletion from a tag row but fetches the current digest before showing the confirmation dialog.
- [ ] The confirmation dialog displays repository, tag, digest, and the effective `DELETE /v2/<name>/manifests/<digest>` operation.
- [ ] The dialog includes the fixed warning that other tags pointing to the same digest may be affected.
- [ ] The dialog states that disk space is not released until external Registry garbage collection runs.
- [ ] The user must type the tag name before the delete button is enabled.
- [ ] `DELETE /api/repositories/{encodedName}/manifests/{encodedDigest}` calls upstream `DELETE /v2/<name>/manifests/<digest>`.
- [ ] The backend does not expose `DELETE /api/repositories/:name/tags/:tag`.
- [ ] Successful deletion shows status `202` and refreshes the current tag list.
- [ ] Verify in browser using dev-browser skill.

### US-008: Preserve Registry errors for operators

**Description:** As an administrator, I want upstream Registry errors to be visible and understandable so that I can distinguish wrong credentials, missing resources, disabled delete, and server failures.

**Acceptance Criteria:**

- [ ] Backend errors use the documented `{ "error": { ... } }` shape.
- [ ] Error responses include wrapper `code`, readable `message`, wrapper `status`, upstream `registryStatus`, and upstream `registryErrors` when available.
- [ ] `405` and `UNSUPPORTED` delete failures are shown without attempting to modify Registry configuration.
- [ ] `404` errors distinguish repository, tag, or manifest absence when the failing API route gives enough context.
- [ ] UI detail panels preserve raw Registry error content.
- [ ] Unit or integration tests cover `401`, `404`, `405`, `UNSUPPORTED`, and `5xx`.

### US-009: Show read-only settings and security warnings

**Description:** As an administrator, I want to see the current runtime settings and security warnings so that I understand how the wrapper is connected to the Registry.

**Acceptance Criteria:**

- [ ] Settings displays Registry URL, page size, request timeout, and whether insecure TLS is enabled.
- [ ] Settings never displays `REGISTRY_PASSWORD` or `ADMIN_PASSWORD`.
- [ ] Overview or Settings shows a visible warning when `REGISTRY_INSECURE_TLS=true`.
- [ ] Settings is read-only in v0.1.
- [ ] Verify in browser using dev-browser skill.

### US-010: Package the UI and backend as one deployable service

**Description:** As an operator, I want one container image that serves both the API and static UI so that deployment stays simple.

**Acceptance Criteria:**

- [ ] The frontend build is served as static files by the backend service.
- [ ] `/api/*` routes are handled by the backend API.
- [ ] Non-API browser routes such as `/overview` and `/repositories/...` serve the frontend app.
- [ ] The image does not require a database volume.
- [ ] The image does not require Docker Socket access.
- [ ] A local `registry:2` manual test can complete login, status, repository list, tag list, manifest detail, and delete-disabled error flow.

## 4. Functional Requirements

- FR-1: The system must read runtime configuration from environment variables.
- FR-2: The system must reject startup when required configuration is missing.
- FR-3: The system must provide a single-admin login endpoint.
- FR-4: The system must provide a logout endpoint.
- FR-5: The system must protect `/api/*` routes behind an authenticated session.
- FR-6: The system must keep Registry credentials on the backend.
- FR-7: The system must call `GET /v2/` to check Registry availability.
- FR-8: The system must expose Registry status through `GET /api/status`.
- FR-9: The system must call `GET /v2/_catalog` for repository listing.
- FR-10: The system must support catalog pagination through `n`, `last`, and upstream `Link` headers.
- FR-11: The system must call `GET /v2/<name>/tags/list` for tag listing.
- FR-12: The system must support tag pagination through `n`, `last`, and upstream `Link` headers.
- FR-13: The system must URL encode repository names and references in browser-facing routes.
- FR-14: The system must call `HEAD /v2/<name>/manifests/<reference>` to resolve digest.
- FR-15: The system must call `GET /v2/<name>/manifests/<reference>` to fetch manifest JSON.
- FR-16: The system must send manifest Accept headers for Docker and OCI manifest/index media types.
- FR-17: The system must compute tag size from manifest layer sizes when layers are present.
- FR-18: The system must label computed layer sum as `Tag Size`.
- FR-19: The system must not label computed layer sum as `Disk Usage`.
- FR-20: The system must show manifest list or OCI index platform entries without recursive child fetches.
- FR-21: The system must require digest-based deletion.
- FR-22: The system must not provide a tag-string delete endpoint.
- FR-23: The system must show repository, tag, digest, and delete API path before deletion.
- FR-24: The system must require typed tag confirmation before enabling deletion.
- FR-25: The system must call `DELETE /v2/<name>/manifests/<digest>` for deletion.
- FR-26: The system must refresh the current tag list after a successful deletion.
- FR-27: The system must show readable wrapper errors in the UI.
- FR-28: The system must preserve raw Registry errors in a detail area.
- FR-29: The system must not attempt to edit Registry configuration after delete failures.
- FR-30: The system must serve the frontend static build from the backend service.

## 5. Non-Goals / Out of Scope

- No database.
- No multi-Registry management.
- No multi-user login.
- No RBAC.
- No per-repository authorization.
- No Registry configuration editing.
- No garbage collection.
- No garbage-collection dry run.
- No Docker Socket mount.
- No host filesystem reads.
- No `docker push` / `docker pull` proxying.
- No vulnerability scanning.
- No webhook processing.
- No automatic retention policy.
- No precise push-time inference.
- No real disk-usage or freed-space calculation.
- No cross-repository or global digest reference analysis.

## 6. Design Considerations

- The first implementation should follow `docs/plans/2026-05-11-registry-api-wrapper-prototype.html` for information architecture, page structure, and deletion wording.
- The UI should avoid saying that a tag string is deleted. It should say that the currently referenced manifest digest is deleted.
- The UI should distinguish `Tag Size` from real disk usage.
- The Repositories and Tags pages should make `Load all` explicit so users understand when search covers all data rather than the current page only.
- Error details should be available without overwhelming the main table views.

## 7. Technical Considerations

- [Assumption] The initial backend implementation uses Go with a single process, as recommended by the design document.
- [Assumption] The frontend uses React, TypeScript, and Vite.
- [Assumption] The static frontend build is embedded into or copied into the backend image and served by the backend.
- [Assumption] v0.1 supports no-auth Registry and Basic Auth Registry. Bearer Token challenge support remains an open question unless explicitly confirmed.
- The service should remain stateless. If signed cookies are used, session validation must not require server-side storage.
- Registry client tests should use a mock HTTP server so pagination, manifest headers, and error mappings are deterministic.
- Manual acceptance should use a local `registry:2` container for end-to-end checks.

## 8. Success Metrics

- An operator can log in and see Registry status in under 30 seconds after container startup.
- Repository list and tag list work with paginated Registry responses.
- A user can reach a manifest detail page from a repository tag row without manually constructing API calls.
- Deletion cannot be submitted until the current digest has been resolved and the user has typed the tag confirmation.
- Delete-disabled Registry responses (`405` / `UNSUPPORTED`) are visible as readable errors and do not trigger any configuration mutation.
- Browser verification passes for login, overview, repository list, tag list, manifest detail, settings, and delete confirmation flows.
- Backend unit/integration tests cover config, pagination, manifest Accept headers, digest resolution, delete, and error mapping.

## 9. Open Questions

1. Should v0.1 commit to Go for the backend, or should the implementation use Node.js / TypeScript full stack?
2. Should login state use a signed stateless cookie, or a server-side random session?
3. Should v0.1 support Bearer Token Registry challenge flow, or only no-auth and Basic Auth Registry?
4. Should the independent prototype file keep its current name `2026-05-11-registry-api-wrapper-prototype.html`, or be renamed to a shorter `prototype.html` before implementation starts?
