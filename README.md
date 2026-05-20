# Registry API Wrapper

[English](README.md) | [简体中文](README.zh-CN.md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCareyWang%2Fregistry-webui&root-directory=web&install-command=corepack%20enable%20%26%26%20pnpm%20install%20--frozen-lockfile&build-command=pnpm%20run%20build&output-directory=dist)

Registry API Wrapper is a compact web console for browsing Docker Registry HTTP API V2 repositories, inspecting tags and manifests, copying pull commands, and issuing guarded manifest delete requests through a backend proxy.

## One-click Vercel deploy

Click **Deploy with Vercel** above to import the `web/` Vite app into Vercel.

The deploy button pre-fills these Vercel build settings:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |

This repository also includes a Go backend that owns authentication, `/api/*` routes, and registry credentials. A Vercel static deployment only hosts the frontend; for a fully working console, run the backend separately or use the Docker image and make sure the frontend can reach the same-origin API routes.

For private repositories, Vercel must have access to the GitHub repository before the deploy button can clone and build it.

## Local development

Start the backend and frontend separately during development:

```bash
cp .env.example .env
go run ./cmd/registry-webui
```

```bash
cd web
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Required backend environment variables:

| Variable | Description |
| --- | --- |
| `APP_PORT` | Backend HTTP port. Defaults to `3000`. |
| `ADMIN_USERNAME` | Login username. Defaults to `admin`. |
| `ADMIN_PASSWORD` | Login password. Change this before production use. |
| `REGISTRY_URL` | Upstream Docker Registry HTTP API V2 endpoint. |
| `REGISTRY_USERNAME` | Optional upstream registry username. |
| `REGISTRY_PASSWORD` | Optional upstream registry password. |
| `REGISTRY_INSECURE_TLS` | Set to `true` only for trusted registries with self-signed TLS. |
| `REGISTRY_PAGE_SIZE` | Registry pagination size. Defaults to `100`. |
| `REGISTRY_REQUEST_TIMEOUT` | Upstream request timeout, for example `30s`. |

## Docker

Build and run the full app as a single container:

```bash
docker build -t registry-webui .
docker run --rm -p 3000:3000 --env-file .env registry-webui
```

Or run the local compose setup:

```bash
docker compose -f compose.yml up --build
```

## Verification

```bash
go test ./...
cd web && pnpm run build
```
