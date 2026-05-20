# Registry API Wrapper

[English](README.md) | [简体中文](README.zh-CN.md)

[![使用 Vercel 部署](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCareyWang%2Fregistry-webui&root-directory=web&install-command=corepack%20enable%20%26%26%20pnpm%20install%20--frozen-lockfile&build-command=pnpm%20run%20build&output-directory=dist)

Registry API Wrapper 是一个轻量级 Web 控制台，用于浏览 Docker Registry HTTP API V2 仓库、查看 tag 和 manifest、复制 pull 命令，并通过后端代理执行带确认保护的 manifest 删除请求。

## 一键部署到 Vercel

点击上方的 **使用 Vercel 部署** 按钮，可以把 `web/` 目录下的 Vite 前端导入到 Vercel。

部署按钮会预填以下 Vercel 构建配置：

| 配置项 | 值 |
| --- | --- |
| Root Directory | `web` |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |

这个仓库同时包含一个 Go 后端，负责登录认证、`/api/*` 路由和 Registry 凭据管理。Vercel 静态部署只会托管前端；如果要运行完整控制台，需要单独部署后端，或者使用 Docker 镜像，并确保前端可以访问同源 API 路由。

如果仓库是私有仓库，Vercel 需要先获得对应 GitHub 仓库的访问权限，部署按钮才能克隆和构建代码。

## 本地开发

开发时可以分别启动后端和前端：

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

后端需要的环境变量：

| 变量 | 说明 |
| --- | --- |
| `APP_PORT` | 后端 HTTP 端口，默认 `3000`。 |
| `ADMIN_USERNAME` | 登录用户名，默认 `admin`。 |
| `ADMIN_PASSWORD` | 登录密码，生产环境部署前必须修改。 |
| `REGISTRY_URL` | 上游 Docker Registry HTTP API V2 地址。 |
| `REGISTRY_USERNAME` | 可选，上游 Registry 用户名。 |
| `REGISTRY_PASSWORD` | 可选，上游 Registry 密码。 |
| `REGISTRY_INSECURE_TLS` | 仅在可信的自签名 TLS Registry 场景下设为 `true`。 |
| `REGISTRY_PAGE_SIZE` | Registry 分页大小，默认 `100`。 |
| `REGISTRY_REQUEST_TIMEOUT` | 上游请求超时时间，例如 `30s`。 |

## Docker

构建并运行完整应用容器：

```bash
docker build -t registry-webui .
docker run --rm -p 3000:3000 --env-file .env registry-webui
```

也可以使用本地 compose 配置：

```bash
docker compose -f compose.yml up --build
```

## 验证

```bash
go test ./...
cd web && pnpm run build
```
