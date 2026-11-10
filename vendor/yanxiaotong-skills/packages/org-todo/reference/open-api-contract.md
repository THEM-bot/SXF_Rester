# 组织待办 · 开放 API 契约（包内 SSOT · local:ready）

> **Agent 以本文件为准**；后端 SC-260804-001/002 接口文档在人读仓，**勿** Read 仓外。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：`router/public-env.md` + `selected_env`  
> **执行首选**：`node packages/org-todo/tools/org-todo-api.mjs`

变量：`$BASE` = base_url · `$TOKEN` = 本地 token（勿贴对话）

---

## OT01 分页列表

`POST /api/open/org-todos/findPage`

默认 `{ "current": 1, "size": 5 }`（Q9）。

| 字段 | 说明 |
|------|------|
| `keyword` | 编号/描述/进展/负责人/提出人/领域等 |
| `statusList` | API 码或中文（待处理/处理中/…） |
| `ownerList` | 负责人工号数组 |
| `businessDomainList` | 领域 ID 或名称 |
| `projectIds` | 项目 ID（string snowflake） |
| `proposedFrom` / `proposedTo` | 提出日期区间 |

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" list --json query.json --human
```

---

## OT02 详情

`GET /api/open/org-todos/detail/{idOrNo}`

`idOrNo` = `OT-YYYYMMDD-####` 或内部主键。

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" detail --id OT-xxx --human
```

---

## OT03 创建

`POST /api/open/org-todos`

### 必填

| 字段 | 说明 |
|------|------|
| `descriptionHtml` | 待办描述富文本（**对齐 Web**；**无独立 title**；读回 `title` 由描述纯文本派生） |
| `owners` | 负责人工号数组，≥1；技能/CLI 未指定时用 `resolve-token-user` 静默填 Token 工号 |
| `plannedCloseAt` | 计划闭环日（`yyyy-MM-dd`）；未指定时技能/CLI **默认今天 + 1 个月** |

### 可选

| 字段 | 默认/说明 |
|------|-----------|
| `businessDomain` | 领域 ID 或名称（可 M01 点选） |
| `projectIds` | 至多 1 个（可 M02 点选；JSON **须为字符串数组**，禁止把数组 `String()` 化） |
| `proposedBy` | 提出人工号；未指定时技能/CLI 静默填 Token 工号 |
| `proposedAt` | 提出时间；默认当前时间（可由服务端填） |
| `businessDomainName` / `projectName` | **仅会话缓存**；CLI 提交前剥离，不进开放 API |

> **进展说明**：Web 内部创建可传 `progressHtml` 写首条进展；**开放 API OT03 无此字段**。技能对齐方式：创建成功后 OT04，或 `create --progress-file` / `--progress-text`（CLI 内串 OT04）。

### 创建禁止

| 字段 | 说明 |
|------|------|
| `status` | **技能创建禁止传**；服务端默认 `PENDING`。改状态仅 OT05 |
| 独立 `title` | API/技能均无此写入字段；**禁止** `--title-file` |

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" write-json-body --json meta.json --description-file desc.txt --out body.json
node "$PACK_ROOT/tools/org-todo-api.mjs" create --json body.json [--progress-file progress.txt] --out resp.json
```

成功 `data`：`orgTodoNo`, `orgTodoId`, `status`, `proposedAt`, `plannedCloseAt`（若带进展，响应可含 `firstProgress`）

---

## OT04 追加进展

`POST /api/open/org-todos/{idOrNo}/progress`

| 字段 | 必填 | 说明 |
|------|------|------|
| `bodyHtml` | 是 | 进展正文 HTML，须有实质内容 |

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" append-progress --id OT-xxx --text "进展正文"
node "$PACK_ROOT/tools/org-todo-api.mjs" append-progress --id OT-xxx --json body.json
```

---

## OT05 更新（PATCH · 含改状态）

`PATCH /api/open/org-todos/{idOrNo}` · **未传字段不修改** · 至少 1 个有效字段。

| 字段 | 说明 |
|------|------|
| `descriptionHtml` | 描述（可空字符串） |
| `status` | API 码：PENDING/IN_PROGRESS/CLOSED/SUSPENDED/CANCELLED |
| `owners` | 全量替换，不能为空数组 |
| `proposedBy` | 提出人工号 |
| `plannedCloseAt` / `actualCloseAt` | 日期或 null |
| `businessDomain` | ID/名称；null/"" 清空 |
| `projectIds` | 全量替换；至多 1 个；[] 清空 |

`status` 改为 `CLOSED` 且未传 `actualCloseAt` → 服务端写入当前时间。

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" update --id OT-xxx --json body.json
```

---

## M01 / M02 / M05 元数据（创建/修改点选）

与 requirement 子包共用开放元数据 API：

| ID | 方法 | 路径 |
|----|------|------|
| M01 | GET | `/api/open/metadata/business-domains` |
| M02 | GET | `/api/open/metadata/projects?businessDomainId=` |
| M05 | GET | `/api/open/metadata/users?keyword=` |

```bash
node "$PACK_ROOT/tools/org-todo-api.mjs" m01 --pick --out picks.json
node "$PACK_ROOT/tools/org-todo-api.mjs" m02 --businessDomainId {id} --pick --out picks.json
node "$PACK_ROOT/tools/org-todo-api.mjs" m05 --keyword 张三 --pick --out picks.json
node "$PACK_ROOT/tools/org-todo-api.mjs" resolve-token-user --human --out user.json
```

- `--pick` 用户可见输出**仅序号+名称**（人员可附带工号展示串，**不含原始 snowflake id**）
- `--out` 写 `{ index, id|employeeId, name }[]` 供 Agent 映射；**禁止**把 id 贴给用户
- 用户直给领域/项目名称时可直接写入 `businessDomain` / `projectIds`，**跳过**点选

---

## 响应与错误

`Result<T>`：`success` / `code` / `message` / `data`

> **P-100**：业务失败常为 HTTP 200 + `success: false`。须解析 body，禁止仅凭 HTTP 状态码。

| 场景 | 处理 |
|------|------|
| `success: true` | `verify-org-todo-response.cjs` 通过后交付 |
| 400/404 | `error-humanize.md` 转人话；**禁止**伪造成功 |

常见 404：`组织待办不存在：{idOrNo}`
