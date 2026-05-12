对，这个边界更合理：**不做 Harbor/Nexus，不做 Registry 执行器，不做 GC Agent，不读宿主机文件，不挂 Docker Socket，不接管 push/pull 流量**。

产品定位改成：

> 一个纯粹包装 Docker Registry HTTP API V2 的轻量 Web UI。

# Registry API Wrapper 设计方案 v0.1

## 1. 产品定位

这是一个面向官方 Docker Registry / CNCF Distribution 的轻量管理界面。

它只做一件事：

```text
把 Registry HTTP API V2 包装成一个好用的 Web 管理界面。
```

它不做：

```text
不替代 Registry
不代理 docker push / pull
不执行 garbage-collect
不读取 registry 存储目录
不读取 registry 配置文件
不操作 Docker Socket
不做漏洞扫描
不做多租户制品平台
```

所有能力都必须来自 Registry HTTP API。官方 API 支持什么，就做什么；官方 API 不支持的能力，不模拟、不猜测、不绕路。

---

## 2. 目标用户

目标用户非常明确：

```text
正在使用官方 registry:2 / distribution 自建镜像仓库的人
```

典型场景：

```text
个人 VPS 上部署了 registry
小团队 CI/CD 推送镜像到私有 registry
内网环境需要一个简单镜像列表页面
不想部署 Harbor / Nexus
只需要查看、搜索、删除 manifest
```

---

## 3. 核心原则

### 3.1 API First

所有功能必须能映射到 Registry HTTP API V2。

比如：

```text
查看仓库列表   -> GET /v2/_catalog
查看 tag       -> GET /v2/<name>/tags/list
查看 manifest  -> GET /v2/<name>/manifests/<reference>
获取 digest    -> HEAD /v2/<name>/manifests/<reference>
删除 manifest  -> DELETE /v2/<name>/manifests/<digest>
```

官方 API 文档中明确包含 catalog、tag、manifest、blob、delete 等接口；`/v2/_catalog` 用于列出仓库，`/v2/<name>/tags/list` 用于列出 tag，这两个接口都需要考虑分页。([Distribution][1])

---

### 3.2 Stateless 优先

第一版不做数据库。

服务端只做：

```text
认证
Registry API 代理
错误码转换
分页封装
删除前检查
```

不做：

```text
元数据同步
定时扫描
历史记录存储
push 时间推断
大小趋势统计
自动清理策略
```

最多支持一个本地配置文件或环境变量：

```text
REGISTRY_URL
REGISTRY_USERNAME
REGISTRY_PASSWORD
ADMIN_USERNAME
ADMIN_PASSWORD
```

---

### 3.3 不伪造官方 API 没有的信息

这些信息不做：

| 能力                  | 原因                                      |
| ------------------- | --------------------------------------- |
| 精确 push 时间          | Registry HTTP API 没有标准字段                |
| 真实磁盘占用              | API 只能看到 manifest/layer 描述，不能知道后端存储真实占用 |
| 真正释放磁盘空间            | garbage-collect 不是 HTTP API             |
| GC dry-run          | 不是 Registry HTTP API                    |
| 仓库级权限管理             | 官方 Registry API 本身不提供管理后台权限模型           |
| 自动 retention policy | 需要额外状态和调度，不属于纯 API 包装                   |

可以显示：

```text
镜像构建时间：来自 image config created 字段，如果能读取到
Tag Size：来自 manifest layers size 求和
Digest：来自 Docker-Content-Digest 响应头
```

但 UI 上必须明确叫法，不能把 `created` 写成 `push time`，也不能把 layer size 写成 `disk usage`。

---

## 4. 功能范围

## 4.1 v0.1 支持功能

| 功能                 | 是否支持 | API 来源                                  |
| ------------------ | ---: | --------------------------------------- |
| Registry 连通性检测     |   支持 | `GET /v2/`                              |
| 查看仓库列表             |   支持 | `GET /v2/_catalog`                      |
| 仓库分页               |   支持 | `n` + `Link` header                     |
| 查看 tag 列表          |   支持 | `GET /v2/<name>/tags/list`              |
| tag 分页             |   支持 | `n` + `Link` header                     |
| 搜索仓库名              |   支持 | 基于已拉取 catalog 前端过滤                      |
| 搜索 tag             |   支持 | 基于已拉取 tags 前端过滤                         |
| 查看 manifest digest |   支持 | `HEAD /v2/<name>/manifests/<reference>` |
| 查看 manifest JSON   |   支持 | `GET /v2/<name>/manifests/<reference>`  |
| 展示 mediaType       |   支持 | manifest body                           |
| 展示 layers          |   支持 | manifest body                           |
| 展示 tag size        |   支持 | layers size 求和                          |
| 删除 manifest        |   支持 | `DELETE /v2/<name>/manifests/<digest>`  |
| 删除前确认              |   支持 | UI 逻辑                                   |
| 复制 pull 命令         |   支持 | UI 逻辑                                   |

官方文档说明，manifest 可以通过 `GET /v2/<name>/manifests/<reference>` 获取，也可以通过 `HEAD` 检查资源信息；删除 manifest 时使用 `DELETE /v2/<name>/manifests/<reference>`，并且删除时 `reference` 必须是 digest，否则会失败。([Distribution][1])

---

## 4.2 v0.1 不支持功能

| 功能                  | 处理方式            |
| ------------------- | --------------- |
| GC                  | 不做，只给提示文案       |
| 定时 GC               | 不做              |
| 自动清理旧 tag           | 不做              |
| 精确 push 时间          | 不做              |
| 真实磁盘释放量             | 不做              |
| 仓库大小真实占用            | 不做              |
| 用户/RBAC             | v0.1 不做，只支持单管理员 |
| 多 Registry          | v0.1 先不做        |
| Webhook             | 不做              |
| Registry 配置修改       | 不做              |
| delete.enabled 自动开启 | 不做              |
| 远程执行命令              | 不做              |

删除失败时，如果 Registry 返回 `405 Method Not Allowed` 或 `UNSUPPORTED`，只展示错误原因，不尝试修改 Registry 配置。官方 API 文档中也说明，当 delete 被禁用或处于 pull-through cache 等场景时，删除 manifest/tag 会返回不允许操作。([Distribution][1])

---

# 5. 页面设计

## 5.1 登录页

功能：

```text
输入管理后台账号密码
登录后进入 Registry Overview
```

v0.1 只做单管理员。

不做注册、不做多用户、不做角色权限。

---

## 5.2 Overview 页面

展示：

```text
Registry URL
Registry API 状态
认证状态
Repository 数量
当前分页大小
删除能力状态
```

删除能力不通过配置文件判断，而是通过实际 API 响应判断。

比如可以设计为：

```text
删除能力：未知
```

当用户第一次执行删除，或者执行删除能力检测时，再根据 API 响应更新 UI：

```text
删除能力：可用
删除能力：不可用，Registry 返回 405 / UNSUPPORTED
```

---

## 5.3 Repository 列表页

字段：

```text
Repository
Tags
Actions
```

交互：

```text
搜索 repository
刷新列表
下一页 / 上一页
点击进入 tag 列表
复制 repository 名称
```

实现方式：

```http
GET /v2/_catalog?n=100
```

如果响应头里有 `Link`，继续请求下一页。官方 catalog 分页通过 `n` 和 `last` 参数实现，客户端应该按 `Link` header 继续翻页直到没有下一页。([Distribution][1])

---

## 5.4 Tag 列表页

路径示例：

```text
/repositories/app/backend
```

字段：

```text
Tag
Digest
Media Type
Size
Actions
```

交互：

```text
搜索 tag
刷新 tags
复制 pull 命令
复制 digest
查看 manifest
删除
```

实现方式：

```http
GET /v2/app/backend/tags/list?n=100
```

tag 分页和 catalog 分页机制一致，也通过 `n`、`last` 和 `Link` header 处理。([Distribution][1])

---

## 5.5 Manifest 详情页

展示：

```text
Repository
Reference
Digest
Media Type
Schema Version
Config Digest
Layers
Raw JSON
```

如果是普通 image manifest：

```text
展示 layers
展示每层 digest
展示每层 size
展示每层 mediaType
```

如果是 multi-arch manifest list / OCI index：

```text
展示 manifests
展示 platform
展示 digest
展示 size
```

不做跨 digest 深度递归扫描，除非用户点击某个子 manifest 再请求。

---

## 5.6 删除确认弹窗

删除操作必须保持准确语义：

```text
你不是在删除一个字符串 tag。
你是在删除这个 tag 当前指向的 manifest digest。
```

弹窗展示：

```text
Repository: app/backend
Tag: latest
Digest: sha256:xxxx
API: DELETE /v2/app/backend/manifests/sha256:xxxx

注意：
删除 manifest 后，该 tag 可能无法再拉取。
如果其他 tag 指向相同 digest，也可能受到影响。
删除不会立即释放磁盘空间。
本系统不会执行 garbage-collect。
```

确认方式：

```text
输入 tag 名称确认删除
```

删除流程：

```text
1. HEAD manifest 获取 digest
2. 展示 digest
3. 用户确认
4. DELETE manifest digest
5. 根据返回状态展示结果
```

成功状态：

```text
202 Accepted
```

失败状态：

```text
401 Unauthorized
403 Denied
404 Manifest Unknown
405 Unsupported / Delete Disabled
```

官方文档说明，删除成功会返回 `202 Accepted`；如果 manifest 已不存在，会返回 `404 Not Found`。([Distribution][1])

---

# 6. 系统架构

## 6.1 最小架构

```text
Browser
  |
  v
Registry Admin Web
  |
  v
Registry Admin API Proxy
  |
  v
Official Docker Registry
```

服务端只负责代理，不保存业务数据。

---

## 6.2 为什么不让前端直连 Registry

虽然是 API 包装，但仍建议保留一个后端代理层。

原因：

```text
避免 Registry 凭据暴露到浏览器
规避 CORS 问题
统一处理 Basic Auth / Bearer Token
统一处理分页
统一处理错误码
统一封装删除前检查
```

后端不是重后台，只是 API wrapper。

---

# 7. 后端 API 设计

后端 API 只做语义化包装。

## 7.1 Registry 状态

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
  "authenticated": true
}
```

---

## 7.2 仓库列表

```http
GET /api/repositories?n=100&last=xxx
```

内部调用：

```http
GET /v2/_catalog?n=100&last=xxx
```

返回：

```json
{
  "repositories": [
    "app/backend",
    "app/frontend"
  ],
  "next": "app/frontend"
}
```

---

## 7.3 tag 列表

```http
GET /api/repositories/:name/tags?n=100&last=xxx
```

内部调用：

```http
GET /v2/:name/tags/list?n=100&last=xxx
```

返回：

```json
{
  "name": "app/backend",
  "tags": [
    "latest",
    "v1.0.0"
  ],
  "next": null
}
```

---

## 7.4 获取 tag digest

```http
GET /api/repositories/:name/tags/:tag/digest
```

内部调用：

```http
HEAD /v2/:name/manifests/:tag
```

请求时带：

```http
Accept: application/vnd.docker.distribution.manifest.v2+json
```

返回：

```json
{
  "repository": "app/backend",
  "tag": "latest",
  "digest": "sha256:xxxx",
  "contentType": "application/vnd.docker.distribution.manifest.v2+json"
}
```

官方文档特别说明，Registry 2.3 及以后版本在通过 `HEAD` 或 `GET` 获取要删除的 digest 时，应带上 `Accept: application/vnd.docker.distribution.manifest.v2+json`。([Distribution][1])

---

## 7.5 获取 manifest

```http
GET /api/repositories/:name/manifests/:reference
```

内部调用：

```http
GET /v2/:name/manifests/:reference
```

返回：

```json
{
  "digest": "sha256:xxxx",
  "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
  "schemaVersion": 2,
  "size": 123456789,
  "manifest": {}
}
```

---

## 7.6 删除 manifest

```http
DELETE /api/repositories/:name/manifests/:digest
```

内部调用：

```http
DELETE /v2/:name/manifests/:digest
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

不提供这个接口：

```http
DELETE /api/repositories/:name/tags/:tag
```

原因是它容易误导用户以为删除的是 tag 字符串。UI 可以从 tag 操作入口进入删除，但最终确认页必须展示 digest，后端也只接受 digest 删除。

---

# 8. 前端信息架构

```text
Login
  |
  v
Overview
  |
  v
Repositories
  |
  v
Repository Detail
  |
  +-- Tags
  +-- Manifest Detail
  +-- Raw JSON
```

导航设计：

```text
左侧：
- Overview
- Repositories
- Settings

右上：
- Registry URL
- Refresh
- Logout
```

---

# 9. 数据处理策略

## 9.1 不做数据库

v0.1 不需要数据库。

运行时数据：

```text
当前 catalog 页面
当前 tags 页面
当前 manifest JSON
```

都可以存在前端状态或服务端内存中。

---

## 9.2 搜索策略

由于没有数据库，搜索分两种：

### 当前页搜索

```text
只搜索当前已经加载的数据
```

优点：

```text
快
简单
不额外请求
```

缺点：

```text
未加载页搜不到
```

### 全量拉取后搜索

提供一个按钮：

```text
Load all repositories
```

点击后后端按分页拉取全部 catalog，再在前端搜索。

tag 同理：

```text
Load all tags
```

不做服务端索引。

---

## 9.3 大小计算

只做 `Tag Size`，不做 `Disk Usage`。

计算逻辑：

```text
普通 manifest:
  sum(layers[].size)

manifest list / OCI index:
  展示 index 自身描述
  用户点击具体平台 manifest 后，再计算该 manifest layers size
```

UI 文案：

```text
Tag Size：根据 manifest layer size 估算，不代表 Registry 实际磁盘占用。
```

---

# 10. 删除语义设计

这是整个产品最容易踩坑的地方。

## 10.1 不叫“删除 tag”

按钮文案建议：

```text
Delete Manifest
```

或者中文：

```text
删除 Manifest
```

tag 行里的操作可以叫：

```text
删除当前 tag 指向的 Manifest
```

不要只写：

```text
删除 tag
```

---

## 10.2 删除前流程

```text
用户点击删除
  ↓
HEAD /v2/<name>/manifests/<tag>
  ↓
拿到 Docker-Content-Digest
  ↓
展示 digest
  ↓
用户输入 tag 或 digest 确认
  ↓
DELETE /v2/<name>/manifests/<digest>
  ↓
刷新 tag 列表
```

---

## 10.3 不做跨 tag 引用分析

严格 API wrapper 下，不建议做复杂共享分析。

原因：

```text
Registry API 没有直接提供 “哪些 tag 指向这个 digest” 的反向查询接口。
```

可以做一个轻量版本：

```text
仅在当前 repository 已加载 tags 范围内，提示可能有相同 digest。
```

UI 文案：

```text
当前已加载 tag 中，发现以下 tag 指向相同 digest。
这不是完整全局分析。
```

不要承诺完整影响范围。

---

# 11. 错误处理

统一展示 Registry 原始错误。

常见错误：

| HTTP 状态 | 含义                              |
| ------: | ------------------------------- |
|     401 | 未认证                             |
|     403 | 没有权限                            |
|     404 | repository / tag / manifest 不存在 |
|     405 | Registry 不允许该操作                 |
|     429 | 请求过多                            |
|     5xx | Registry 服务异常                   |

错误展示示例：

```text
删除失败

Registry 返回：
HTTP 405 Method Not Allowed

可能原因：
- Registry 未开启 delete
- 当前 Registry 是 pull-through cache
- 当前用户没有删除权限
```

---

# 12. 配置设计

## 12.1 环境变量

```env
APP_PORT=3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=registry-user
REGISTRY_PASSWORD=registry-pass

REGISTRY_INSECURE_TLS=false
REGISTRY_PAGE_SIZE=100
```

---

## 12.2 Docker Compose 部署

```yaml
services:
  registry-admin:
    image: yourname/registry-api-wrapper:latest
    container_name: registry-admin
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      APP_PORT: "3000"
      ADMIN_USERNAME: "admin"
      ADMIN_PASSWORD: "change-me"
      REGISTRY_URL: "https://registry.example.com"
      REGISTRY_USERNAME: "registry-user"
      REGISTRY_PASSWORD: "registry-pass"
      REGISTRY_INSECURE_TLS: "false"
      REGISTRY_PAGE_SIZE: "100"
```

没有 volume，没有数据库，没有 Docker socket。

---

# 13. MVP 开发范围

第一版建议只做这些：

```text
1. 登录
2. Registry 状态检测
3. Repository 列表
4. Repository 搜索
5. Tag 列表
6. Tag 搜索
7. Digest 查看
8. Manifest JSON 查看
9. Layer size 展示
10. Delete Manifest
11. 错误码展示
```

不做：

```text
数据库
任务队列
GC
定时扫描
操作日志持久化
多用户
多 Registry
权限系统
Webhook
镜像扫描
```

---

# 14. 一句话版本

这个项目可以定义为：

> Registry API Wrapper：一个零侵入、无数据库、无 Agent、无 Docker Socket 的官方 Docker Registry HTTP API V2 可视化管理界面。

它的核心卖点不是“功能强”，而是：

```text
轻
准
透明
不越界
官方 API 支持才做
```

[1]: https://distribution.github.io/distribution/spec/api/ "HTTP API V2 | CNCF Distribution"

