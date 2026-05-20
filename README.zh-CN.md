# Registry Web UI

[English](README.md) | [简体中文](README.zh-CN.md)

[![使用 Vercel 部署](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCareyWang%2Fregistry-webui&install-command=corepack%20enable%20%26%26%20pnpm%20install%20--frozen-lockfile&build-command=pnpm%20run%20build&output-directory=dist)

Registry Web UI 是一个纯浏览器端的 Docker Registry HTTP API V2 控制台。它可以浏览 repository 和 tag、查看 manifest、复制 pull 命令，并从前端直接发送带确认保护的 manifest 删除请求。

运行链路里不再需要 Go 后端或 API 代理。浏览器会直接连接你在 UI 中配置的 Registry 端点，因此 Registry 必须允许来自 Web UI 来源的 CORS 请求。

## 一键部署到 Vercel

点击上方的 **使用 Vercel 部署** 按钮，可以把根目录下的 Vite 前端导入到 Vercel。

部署按钮会预填以下 Vercel 构建配置：

| 配置项 | 值 |
| --- | --- |
| Root Directory | 仓库根目录 |
| Install Command | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |

如果仓库是私有仓库，Vercel 需要先获得对应 GitHub 仓库的访问权限，部署按钮才能克隆和构建代码。

## Registry 连接

没有连接配置时，应用首次进入会强制打开连接弹窗。需要填写：

| 字段 | 说明 |
| --- | --- |
| Registry URL | Registry HTTP API V2 地址，例如 `https://registry.example.com`。 |
| Username | 可选 Basic Auth 用户名。 |
| Password | 可选 Basic Auth 密码或 token。 |
| Page size | Registry 分页大小，会限制在 `10`-`1000`。 |
| Request timeout | 浏览器请求超时时间，单位为秒。 |

弹窗会先测试 `GET /v2/`，测试通过后才保存。保存后的配置存放在当前浏览器的 `localStorage`。

也可以用 Vite 变量提供公开的构建期默认值：

| 变量 | 说明 |
| --- | --- |
| `VITE_REGISTRY_URL` | 可选默认 Registry 地址。 |
| `VITE_REGISTRY_USERNAME` | 可选默认 Basic Auth 用户名。 |
| `VITE_REGISTRY_PASSWORD` | 可选默认 Basic Auth 密码或 token。共享部署中不建议使用。 |
| `VITE_REGISTRY_REQUEST_TIMEOUT_SECONDS` | 可选默认请求超时时间，单位为秒。 |

## Docker Registry 配置

因为请求直接来自浏览器，Registry 必须能被用户浏览器访问，而不是只在 Web UI 容器或服务器内部可达。比如 UI 打开地址是 `https://ui.example.com`，那么连接弹窗里填写的 Registry URL 也必须能从浏览器直接访问。

生产部署建议通过 Nginx 暴露 Registry API V2 端点，并把 CORS 策略配置在这个反向代理上。应用里的 Registry URL 应填写公开代理地址，例如 `https://registry.example.com`，而不是内部的 `http://registry:5000` 服务地址。

代理必须允许 Web UI 来源，并暴露 Registry API V2 分页和 manifest 检查需要的响应头：

```text
Access-Control-Allow-Origin: https://your-web-ui.example.com
Access-Control-Allow-Methods: HEAD, GET, OPTIONS, DELETE
Access-Control-Allow-Headers: Authorization, Accept, Content-Type
Access-Control-Expose-Headers: Link, Docker-Content-Digest, Content-Type, Content-Length
```

共享或生产部署建议使用明确的来源，不要用 `*`。如果 UI 部署在多个域名，需要在 Nginx 策略里加入所有可信来源。

官方 `registry:3` 服务前面的最小 Nginx 反向代理示例如下：

```nginx
server {
  listen 443 ssl http2;
  server_name registry.example.com;

  # ssl_certificate /etc/nginx/certs/registry.example.com.crt;
  # ssl_certificate_key /etc/nginx/certs/registry.example.com.key;

  client_max_body_size 0;

  location /v2/ {
    if ($request_method = OPTIONS) {
      add_header Access-Control-Allow-Origin "https://your-web-ui.example.com" always;
      add_header Access-Control-Allow-Methods "HEAD, GET, OPTIONS, DELETE" always;
      add_header Access-Control-Allow-Headers "Authorization, Accept, Content-Type" always;
      add_header Access-Control-Max-Age 86400 always;
      add_header Content-Length 0 always;
      return 204;
    }

    add_header Access-Control-Allow-Origin "https://your-web-ui.example.com" always;
    add_header Access-Control-Expose-Headers "Link, Docker-Content-Digest, Content-Type, Content-Length" always;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://registry:5000;
  }
}
```

上游 Registry 只有在需要删除 manifest 时才必须配置 `REGISTRY_STORAGE_DELETE_ENABLED=true` 或 `storage.delete.enabled: true`。浏览 repository、tag 和 manifest 不依赖这个开关。如果没有使用 Nginx 或其他反向代理，则需要把同样的 CORS 响应头直接配置到 Registry 的 `http.headers` 中。

如果 Registry 使用自签名证书，必须让用户浏览器信任该证书，否则浏览器会在应用处理前直接拦截请求。纯前端应用无法关闭 TLS 校验。

## 本地开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

然后打开 dev 地址，在弹窗中配置 Registry 连接。

## Docker

构建并运行静态前端：

```bash
docker build -t registry-webui .
docker run --rm -p 3000:3000 registry-webui
```

也可以运行本地 compose 示例，它会在宿主机 `5050` 端口启动一个测试 Registry，并为 `http://localhost:3000` 配好 CORS 响应头：

```bash
docker compose -f compose.yml up --build
```

在连接弹窗中使用 `http://localhost:5050` 作为 Registry URL。

## 验证

```bash
pnpm run test
pnpm run build
```
