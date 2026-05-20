# Registry Web UI

[English](README.md) | [简体中文](README.zh-CN.md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCareyWang%2Fregistry-webui&install-command=corepack%20enable%20%26%26%20pnpm%20install%20--frozen-lockfile&build-command=pnpm%20run%20build&output-directory=dist)

Registry Web UI is a browser-only console for Docker Registry HTTP API V2. It browses repositories and tags, inspects manifests, copies pull commands, and sends guarded manifest delete requests directly from the frontend.

There is no Go backend or API proxy in the runtime path. The browser connects to the Registry endpoint you configure in the UI, so the Registry must allow CORS from the Web UI origin.

## One-click Vercel deploy

Click **Deploy with Vercel** above to import the Vite app into Vercel.

The deploy button pre-fills these Vercel build settings:

| Setting | Value |
| --- | --- |
| Root Directory | repository root |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |

For private repositories, Vercel must have access to the GitHub repository before the deploy button can clone and build it.

## Registry connection

When no connection is configured, the app opens a required connection dialog on first load. Fill in:

| Field | Description |
| --- | --- |
| Registry URL | Registry HTTP API V2 origin, for example `https://registry.example.com`. |
| Username | Optional Basic Auth username. |
| Password | Optional Basic Auth password or token. |
| Page size | Registry pagination size, clamped to `10`-`1000`. |
| Request timeout | Browser request timeout in seconds. |

The dialog tests `GET /v2/` before saving. Saved settings live in this browser's `localStorage`.

You can also provide public build-time defaults with Vite variables:

| Variable | Description |
| --- | --- |
| `VITE_REGISTRY_URL` | Optional default Registry URL. |
| `VITE_REGISTRY_USERNAME` | Optional default Basic Auth username. |
| `VITE_REGISTRY_PASSWORD` | Optional default Basic Auth password or token. Avoid this for shared deployments. |
| `VITE_REGISTRY_PAGE_SIZE` | Optional default page size. |
| `VITE_REGISTRY_REQUEST_TIMEOUT_SECONDS` | Optional default request timeout in seconds. |

## CORS requirements

Because requests come directly from the browser, the Registry must allow the Web UI origin and expose the headers used by Registry API V2 pagination and manifest inspection:

```text
Access-Control-Allow-Origin: https://your-web-ui.example.com
Access-Control-Allow-Methods: HEAD, GET, OPTIONS, DELETE
Access-Control-Allow-Headers: Authorization, Accept, Content-Type
Access-Control-Expose-Headers: Link, Docker-Content-Digest, Content-Type
```

Manifest deletion also requires delete support in the Registry storage configuration.

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Then open the dev URL and configure your Registry connection in the dialog.

## Docker

Build and run the static frontend:

```bash
docker build -t registry-webui .
docker run --rm -p 3000:3000 registry-webui
```

Or run the local compose setup, which starts a test Registry on host port `5050` with CORS headers for `http://localhost:3000`:

```bash
docker compose -f compose.yml up --build
```

Use `http://localhost:5050` as the Registry URL in the connection dialog.

## Verification

```bash
pnpm run test
pnpm run build
```
