# Scaffold v0.1 service, config, and static UI hosting

## Description

Create the initial Registry API Wrapper v0.1 project skeleton. The service must read runtime configuration from environment variables, serve backend API routes under `/api/*`, and serve the frontend static build for browser routes.

## Acceptance Criteria

- [x] The service reads `APP_PORT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `REGISTRY_URL`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, `REGISTRY_INSECURE_TLS`, `REGISTRY_PAGE_SIZE`, and `REGISTRY_REQUEST_TIMEOUT` from environment variables.
- [x] Startup fails with a clear error when `REGISTRY_URL` is missing.
- [x] Startup fails in production mode when `ADMIN_PASSWORD` is left as `change-me`.
- [x] `REGISTRY_PAGE_SIZE` defaults to `100` and rejects values outside `10..1000`.
- [x] `/api/*` routes are reserved for backend handlers.
- [x] Non-API browser routes such as `/overview` and `/repositories/...` serve the frontend app.
- [x] The service does not require a database volume.
- [x] The service does not require Docker Socket access.
- [x] Unit tests cover config parsing and invalid config cases.

## Dependencies

None

## Type

infra/fullstack

## Priority

high
