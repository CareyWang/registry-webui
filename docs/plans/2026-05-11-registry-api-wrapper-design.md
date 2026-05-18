# Registry API Wrapper v0.1 技术设计

## 1. 背景与目标

这份设计只覆盖根目录 `design.md` 里定义的 v0.1 范围。产品形态是一个轻量的 Docker Registry HTTP API V2 Web UI，边界先写清楚：

- 只包装官方 Registry / CNCF Distribution HTTP API V2。
- 不代理 `docker push` / `docker pull` 流量。
- 不读取宿主机文件、Registry 存储目录或 Registry 配置文件。
- 不挂载 Docker Socket。
- 不执行 garbage-collect。
- 不引入数据库、任务队列、扫描器或 Agent。

v0.1 要解决的事情很具体：把 Registry API 已经提供的 catalog、tags、manifest、digest、delete 能力做成一个可审计、语义准确的管理界面。官方 API 没给的能力，本版本不补、不猜，也不通过读取宿主机或 Registry 存储目录绕出来。

## 2. 设计原则

### 2.1 API 能力边界优先

每个页面动作都要能落到 Registry HTTP API V2 的一次或多次调用上。没有对应 API 的信息，不在 UI 里伪装成“已支持”。

示例：

| UI 能力 | 后端调用 |
| --- | --- |
| Registry 连通性检测 | `GET /v2/` |
| 仓库列表 | `GET /v2/_catalog?n=&last=` |
| Tag 列表 | `GET /v2/<name>/tags/list?n=&last=` |
| 获取 digest | `HEAD /v2/<name>/manifests/<reference>` |
| 获取 manifest | `GET /v2/<name>/manifests/<reference>` |
| 删除 manifest | `DELETE /v2/<name>/manifests/<digest>` |

### 2.2 Stateless 优先

服务端不保存 Registry 业务数据。登录态用短期会话或签名 Cookie 维持，Registry 返回的数据只在单次请求里转发、解析和裁剪。

v0.1 不做：

- 元数据同步。
- 操作日志持久化。
- 定时任务。
- 自动清理策略。
- 推送时间推断。
- 真实磁盘占用统计。

### 2.3 删除语义必须准确

用户可以从 tag 行进入删除操作，但真正提交到 Registry 的只能是 digest 删除。后端不提供按 tag 字符串删除的接口，避免把 Registry 的 manifest 删除语义讲错。

删除确认必须明确说明：

- 用户删除的是当前 tag 指向的 manifest digest。
- 其他 tag 如果指向相同 digest，可能一起受到影响。
- 删除成功不代表磁盘空间立即释放。
- 本系统不会执行 garbage-collect。

## 3. 推荐技术栈

v0.1 采用单进程部署更合适：

- 后端：Go `net/http` 或 Chi 风格轻量路由。
- 前端：React + TypeScript + Vite。
- 构建：前端产物作为静态文件由后端服务。
- 部署：一个 Docker 镜像，无 volume、无数据库、无 Docker Socket。

选择 Go 作为后端的理由：

- 产物轻，适合“轻量 API wrapper”的产品定位。
- 标准库 HTTP 能完整控制 header、status 和 body streaming。
- 容器镜像可以做得很小。
- 后续如需支持 insecure TLS、自定义 CA、超时、代理等 Registry 连接配置，Go 的 HTTP client 可控性较好。

如果团队更倾向 TypeScript，也可以用 Node.js + Fastify 做同样的架构。后文的接口和模块划分不依赖某个具体框架。

## 4. 总体架构

```text
Browser
  |
  |  Static UI + /api/*
  v
Registry API Wrapper
  |
  |  Registry HTTP API V2
  v
Official Docker Registry / Distribution
```

后端代理层负责几件事：

- 隐藏 Registry 凭据，避免暴露到浏览器。
- 规避 CORS。
- 统一 Registry Basic Auth / Bearer Token 处理。
- 统一分页解析。
- 统一错误码映射。
- 在删除前强制执行 digest 获取和确认语义。

前端负责：

- 登录和会话态展示。
- Overview、Repositories、Tags、Manifest 等页面。
- 当前页搜索和“加载全部后搜索”交互。
- 删除确认弹窗。
- Registry 原始错误展示。

## 5. 运行配置

v0.1 通过环境变量配置：

```env
APP_PORT=3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=registry-user
REGISTRY_PASSWORD=registry-pass

REGISTRY_INSECURE_TLS=false
REGISTRY_PAGE_SIZE=100
REGISTRY_REQUEST_TIMEOUT=15s
```

配置约束：

- `REGISTRY_URL` 是必填项。
- `ADMIN_PASSWORD` 生产环境不允许使用默认值。
- `REGISTRY_PAGE_SIZE` 默认 100，允许范围建议为 10 到 1000。
- `REGISTRY_INSECURE_TLS=true` 时，Settings/Overview 需要显示风险提示。

## 6. 后端模块设计

```text
cmd/server
  main.go

internal/config
  读取环境变量，做默认值和合法性校验

internal/auth
  管理后台单管理员登录、会话 Cookie、登出

internal/registry
  Registry HTTP client
  catalog/tags/manifest/digest/delete API 封装
  Link header 解析
  Accept header 管理

internal/api
  /api/* 路由
  请求参数校验
  错误响应格式

internal/web
  静态前端文件服务
```

### 6.1 Registry Client

Registry Client 只负责和上游 Registry 通信，不放产品业务判断。业务语义留在 API 层处理，例如删除前的 digest 查询、确认文案和错误映射。

关键点：

- 所有请求设置超时。
- `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` 存在时使用 Basic Auth。
- `HEAD` 和 `GET manifest` 请求带上可接受的 manifest media types。
- 完整保留 Registry 返回的 status、错误 body 和关键 header。
- 解析 `Link` header 后，只向前端返回 `next` 游标，不暴露 Registry 原始 URL。

Manifest 相关 Accept header：

```http
Accept: application/vnd.docker.distribution.manifest.v2+json
Accept: application/vnd.docker.distribution.manifest.list.v2+json
Accept: application/vnd.oci.image.manifest.v1+json
Accept: application/vnd.oci.image.index.v1+json
```

### 6.2 错误模型

后端错误统一成下面的结构：

```json
{
  "error": {
    "code": "REGISTRY_METHOD_NOT_ALLOWED",
    "message": "Registry does not allow this operation.",
    "status": 405,
    "registryStatus": 405,
    "registryErrors": [
      {
        "code": "UNSUPPORTED",
        "message": "The operation is unsupported."
      }
    ]
  }
}
```

错误处理原则：

- UI 必须展示人类可读原因。
- 调试面板或详情区域保留 Registry 原始错误。
- 不因为 `405` 或 `UNSUPPORTED` 去修改 Registry 配置。
- `404` 需要区分 repository、tag、manifest 不存在，但不做自动修复。

## 7. 后端 API 设计

### 7.1 登录

```http
POST /api/session
Content-Type: application/json

{
  "username": "admin",
  "password": "change-me"
}
```

返回：

```json
{
  "authenticated": true
}
```

登出：

```http
DELETE /api/session
```

### 7.2 Registry 状态

```http
GET /api/status
```

内部调用：

```http
GET /v2/
```

返回：

```json
{
  "registryUrl": "https://registry.example.com",
  "available": true,
  "authenticated": true,
  "pageSize": 100,
  "deleteCapability": "unknown"
}
```

`deleteCapability` 只使用这三个值：

- `unknown`
- `available`
- `unavailable`

v0.1 不读取 Registry 配置来判断删除能力。只有用户真正执行删除，或后续加入显式检测按钮时，才根据 Registry 的真实响应更新状态。

### 7.3 仓库列表

```http
GET /api/repositories?n=100&last=app/frontend
```

返回：

```json
{
  "repositories": [
    "app/backend",
    "app/frontend"
  ],
  "pagination": {
    "next": "app/frontend",
    "hasNext": true
  }
}
```

### 7.4 Tag 列表

Repository 名称可能包含 `/`，前端调用接口前必须做 URL encode。

```http
GET /api/repositories/{encodedName}/tags?n=100&last=v1.0.0
```

返回：

```json
{
  "repository": "app/backend",
  "tags": [
    "latest",
    "v1.0.0"
  ],
  "pagination": {
    "next": null,
    "hasNext": false
  }
}
```

### 7.5 获取 digest

```http
GET /api/repositories/{encodedName}/references/{encodedReference}/digest
```

内部调用：

```http
HEAD /v2/<name>/manifests/<reference>
```

返回：

```json
{
  "repository": "app/backend",
  "reference": "latest",
  "digest": "sha256:xxxx",
  "contentType": "application/vnd.docker.distribution.manifest.v2+json"
}
```

### 7.6 获取 manifest

```http
GET /api/repositories/{encodedName}/manifests/{encodedReference}
```

返回：

```json
{
  "repository": "app/backend",
  "reference": "latest",
  "digest": "sha256:xxxx",
  "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
  "schemaVersion": 2,
  "size": 123456789,
  "layers": [
    {
      "digest": "sha256:layer",
      "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "size": 12345
    }
  ],
  "manifest": {}
}
```

Manifest list / OCI index 只返回 `manifests` 列表，不递归拉取子 manifest。用户点击某个平台项时，再按对应 digest 请求详情。

### 7.7 删除 manifest

```http
DELETE /api/repositories/{encodedName}/manifests/{encodedDigest}
Content-Type: application/json

{
  "confirmedReference": "latest"
}
```

内部调用：

```http
DELETE /v2/<name>/manifests/<digest>
```

返回：

```json
{
  "deleted": true,
  "status": 202,
  "repository": "app/backend",
  "digest": "sha256:xxxx"
}
```

后端不提供 `DELETE /api/repositories/:name/tags/:tag`，避免用户误以为删除的是 tag 字符串。

## 8. 前端页面与状态设计

### 8.1 页面路由

```text
/login
/overview
/repositories
/repositories/:encodedName
/repositories/:encodedName/manifests/:encodedReference
/settings
```

### 8.2 页面职责

| 页面 | 职责 |
| --- | --- |
| Login | 管理员登录 |
| Overview | Registry URL、API 状态、认证状态、仓库数量、删除能力状态 |
| Repositories | 仓库分页、当前页搜索、加载全部、刷新 |
| Repository Detail | Tag 分页、Tag 搜索、Digest、Size、Pull 命令、Manifest 操作 |
| Manifest Detail | Manifest 摘要、Layers 或 platform 列表、Raw JSON |
| Settings | 只读展示运行配置和安全提示 |

### 8.3 前端状态

前端只保存运行时状态：

- 当前登录状态。
- 当前 catalog 页。
- 当前 tags 页。
- 当前 manifest 详情。
- 当前搜索关键字。
- 删除确认弹窗上下文。

不做 LocalStorage 业务缓存。页面刷新后重新请求 API，保证 UI 展示来自当前 Registry 响应。

### 8.4 搜索策略

默认只搜索当前已加载的数据。

列表页提供显式按钮：

- `Load all repositories`
- `Load all tags`

点击后，前端按分页接口循环拉完所有页面，再在浏览器内过滤。v0.1 不做服务端索引。

## 9. 删除流程设计

```text
用户点击 tag 行里的 Delete Manifest
  |
  v
GET /api/repositories/{name}/references/{tag}/digest
  |
  v
展示 repository、tag、digest、DELETE API
  |
  v
用户输入 tag 名称确认
  |
  v
DELETE /api/repositories/{name}/manifests/{digest}
  |
  v
展示 202 或 Registry 原始错误
  |
  v
刷新当前 tag 列表
```

删除弹窗必须包含下面的固定提示：

```text
This deletes the manifest digest currently referenced by this tag.
Other tags that point to the same digest may also be affected.
Disk space is not released until Registry garbage collection runs outside this app.
```

中文 UI 可对应为：

```text
此操作删除的是该 tag 当前指向的 manifest digest。
如果其他 tag 指向相同 digest，也可能受到影响。
删除不会立即释放磁盘空间，本系统不会执行 garbage-collect。
```

## 10. 安全设计

v0.1 的安全边界如下：

- 管理后台单管理员账号。
- 后端持有 Registry 凭据。
- 浏览器永不接触 Registry 凭据。
- Session Cookie 使用 `HttpOnly`、`SameSite=Lax`。
- HTTPS 由用户部署层处理，例如反向代理或平台 TLS。

限制：

- 不做用户/RBAC。
- 不做 per repository 权限。
- 不做审计日志持久化。

如果后续要支持多用户，就需要引入数据库或外部身份源。这已经超出 v0.1 范围，不在本设计里展开。

## 11. 测试策略

### 11.1 单元测试

后端：

- 配置解析。
- Registry URL 拼接。
- Repository 名称和 reference 的 URL encode/decode。
- `Link` header 解析。
- Manifest layer size 求和。
- Registry 错误 body 映射。

前端：

- 删除弹窗必须展示 digest 和固定风险提示。
- Tag size 文案不能写成 Disk Usage。
- Pull 命令生成。
- 当前页搜索和加载全部后的搜索。

### 11.2 集成测试

使用 mock Registry HTTP server 覆盖：

- `GET /v2/` 成功/401/5xx。
- catalog 分页。
- tag 分页。
- manifest v2。
- manifest list / OCI index。
- delete 返回 `202`。
- delete 返回 `405` / `UNSUPPORTED`。

### 11.3 手工验收

使用本地 `registry:2` 验收：

- 登录后能看到 Registry 状态。
- 能列出仓库和 tag。
- 能查看 manifest JSON。
- 能复制 pull 命令。
- 删除禁用时能看到明确错误。
- 删除启用时能通过 digest 删除 manifest。
- 删除后 UI 不宣称磁盘空间已释放。

## 12. 原型图

原型图已拆到独立 HTML 文件，方便直接用浏览器打开和后续维护：

- [2026-05-11-registry-api-wrapper-prototype.html](./2026-05-11-registry-api-wrapper-prototype.html)

该文件仍是 v0.1 信息架构原型，不是最终前端代码。第一版实现需要沿用它的页面结构、关键文案和删除语义。

## 13. 里程碑

### Milestone 1：服务骨架和连通性

- 读取环境变量。
- 启动 Web 服务。
- 登录/登出。
- `GET /api/status`。
- 前端 Overview。

### Milestone 2：仓库和 tag 浏览

- catalog 分页。
- tag 分页。
- 当前页搜索。
- `Load all` 拉取。
- Pull 命令复制。

### Milestone 3：manifest 详情

- digest 获取。
- manifest 获取。
- Docker manifest v2 layer 展示。
- OCI index / manifest list 展示。
- Raw JSON 查看。

### Milestone 4：删除 manifest

- 删除前 digest 查询。
- 删除确认弹窗。
- digest DELETE。
- `202`、`405`、`UNSUPPORTED`、`404` 错误展示。
- 删除后刷新 tag 列表。

## 14. 暂不实现

下面这些能力不进入 v0.1：

- 数据库。
- 多 Registry。
- 多用户/RBAC。
- Registry 配置编辑。
- GC 或 GC dry-run。
- Webhook。
- push 时间。
- 真实磁盘占用。
- 跨仓库或全局 digest 引用分析。
- 自动 retention policy。

## 15. 待确认问题

这些问题不阻塞 v0.1 的设计结论，但实现前最好定下来：

1. 后端技术栈是否接受 Go 单进程方案，还是希望使用 Node.js/TypeScript 全栈。
2. 登录态是否使用服务端随机 session，还是使用签名 Cookie。
3. 是否需要支持 Bearer Token Registry 的 token challenge 流程，还是 v0.1 只支持无认证和 Basic Auth。
4. 是否需要把 HTML 原型拆成独立 `prototype.html` 方便浏览器打开。
