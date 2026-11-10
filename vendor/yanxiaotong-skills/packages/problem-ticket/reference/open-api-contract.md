# 问题单 · 开放 API 契约（包内 SSOT · local:ready）

> **Agent 以本文件为准**；推广材料人读文档在 `efficiency-hub-doc/03-推广材料/指导手册-API/`，**勿**当作运行时 SSOT。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：`router/public-env.md` + `selected_env`  
> **执行首选**：`node packages/problem-ticket/tools/problem-ticket-api.mjs`

变量：`$BASE` = base_url · `$TOKEN` = 本地 token（勿贴对话）

---

## P-META 获取问题单元数据

`GET /api/open/problem-tickets/metadata`

无路径参数、无查询参数、无 Body。响应头可含 `Cache-Control: private, max-age=600`。

### data 字段

| 名称 | 类型 | 说明 |
|------|------|------|
| `version` | String | 元数据版本；客户端可按此缓存 10～30 分钟 |
| `problemTypes` | Array | `{ id, name, enabled }` |
| `featureTeams` | Array | 当前令牌可用特性小组 |
| `businessDomains` | Array | 当前令牌可用业务领域 |
| `appServices` | Array | 应用/服务（含 `featureTeamId` / `businessDomainId` / 默认人员） |
| `tokenUser` | Object | **令牌绑定账号** `{ userId, name, employeeId }`；技能默认提单人 / 二线 / 处理人唯一来源 |
| `defaults` | Object | 归属回落：`problemTypeId` / `featureTeamId` / `businessDomainId` / `appServiceId`；`secondLineFollowerEmployeeId` 为环境主数据参考，**技能创建默认不用**（改用 `tokenUser`） |

```bash
node "$PACK_ROOT/tools/problem-ticket-api.mjs" metadata [--human] [--out meta.json]
```

---

## P01 创建问题单

`POST /api/open/problem-tickets`

### 请求头

| 名称 | 必填 | 说明 |
|------|------|------|
| `X-Open-Api-Token` | 是 | 个人 API 令牌 |
| `Idempotency-Key` | **是** | 8～128 位字母、数字或 `.` `_` `:` `-`；CLI 未传则自动生成 UUID |

> **本包已落地 Idempotency-Key**：创建时 CLI **必须**带该头（见 `open-api-common.md` 写操作例外）。

### 请求体（推荐新字段）

| 名称 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | 问题标题；纯文本最长 512 |
| `description` | 是 | 描述富文本/纯文本；清理后须有有效内容。别名 `businessImpact`。技能侧为 **Agent 业务总结**（非整卡原文）；`prepare`/`create` 转 HTML；确认表与落库须同一 prepared 正文（见 `create-defaults.md`） |
| `submitterName` | 是 | 提单人展示名（建议姓名+工号）；也可 `submitterEmployeeId` |
| `problemType` | 否 | `线上缺陷` / `P级事件` / `需求`；或 `problemTypeId`；未传默认线上缺陷 |
| `secondLineFollower` | 否 | 二线跟进人；技能/CLI 未传时补 `tokenUser`（勿用手填环境默认二线）。别名 `caretaker`；也可 `secondLineFollowerId` |
| `handler` | 否 | 处理人；未传可回落 owners/提单人。也可 `handlerId` |
| `featureTeam` | 否 | 特性小组名称；或 `featureTeamId`；未传用默认 |
| `businessDomain` | 否 | 业务领域；或 `businessDomainId` |
| `appOrService` | 否 | 应用/服务；或 `appServiceId`。别名 `appServiceName` |
| `wecomChatId` / `wecomGroupName` | 否 | 企微群 |

建议创建前先调 **P-META** 取 ID/名称与 defaults。

```bash
node "$PACK_ROOT/tools/problem-ticket-api.mjs" create --json body.json [--idempotency-key KEY] [--human] [--out resp.json]
```

### 成功 data

| 名称 | 说明 |
|------|------|
| `id` | 问题单 ID（写入进展路径参数） |
| `problemNo` | 问题单号，如 `PRB-20261016-0001` |
| `woNo` | 工单号 |
| `shareUrl` | 研效通详情链接 |

命中幂等重放：结构与首次相同，不新建单据。

### 常见 HTTP

| 码 | 说明 |
|----|------|
| 200 | 创建成功或幂等重放 |
| 400 | Idempotency-Key 缺失/格式错；JSON 错 |
| 401 | 令牌无效 |
| 403 | 无创建授权 |
| 409 | 同 Key 不同内容；或处理中 |
| 422 | 字段校验失败 |
| 429 | 限流 |
| 503 | 默认主数据不可用 |

---

## 限流（创建）

同一令牌 + 客户端 IP 每分钟 30 次（多实例按实例分别计数）。
