# 原始需求 · 开放 API 契约（包内 SSOT · ready · 精简契约 v2）

> **Agent 以本文件为准**；**禁止**伪造调用成功。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：读 `router/public-env.md` + 父包 `selected_env`  
> **执行首选**：`node packages/original-requirement/tools/original-requirement-api.mjs`

变量：`$BASE` = base_url · `$TOKEN` = 本地解析的 token（勿贴对话）

路径前缀：`/api/open/original-requirements`

---

## OR01 创建原始需求

`POST /api/open/original-requirements`

### 客户端必填（六项）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题 |
| `businessPain` | string | 业务背景/痛点（可 HTML） |
| `userNeedDesc` | string | 原始需求描述（可 HTML） |
| `valueDescription` | string | 价值描述（富文本/HTML）；**Agent 从用户输入自动提炼**，创建交互默认不问 |
| `expectedDeliveryDate` | string | 计划交付 `yyyy-MM-dd`；**Agent 默认填当天**，创建交互默认不问 |
| `businessDomainId` | string | M01 点选；snowflake **须按字符串传递** |

> **P-130**：`businessDomainId` 禁止写 JS number。

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `proposer` | string | 提出人。**未传** → Token 用户；**传入**须能匹配用户元数据。推荐 M05 拼装 **姓名+工号**（如 `余训峰94023`）；服务端另支持仅人名、仅工号（人名重名取第一条，工号唯一） |
| `requirementAcceptancePerson` | string | 验收人（与提出人同格式、彼此独立）。**未传** → Token 用户；**传入**须能匹配用户元数据 |

### 服务端托管（请求体禁止传；未知字段 → 400）

| 项 | 默认 |
|----|------|
| 提出人 | **未传 `proposer` 时** = Token 对应用户 |
| 验收人 | **未传 `requirementAcceptancePerson` 时** = Token 对应用户；传入则以本字段为准（可与提出人不同） |
| `submitChannel` | `企微` |
| `priority` | `中` |
| `absolutePriority` | `0` |
| `valueType` | `提升效率` |
| 业务接口人 / IT 产品规划 | 按领域配置解析 |
| `taskFrequencyPerYear` / `annualBenefitEstimate` | `0` |

### curl

```bash
curl -sS -X POST "$BASE/api/open/original-requirements" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"title":"示例","businessPain":"痛点","userNeedDesc":"描述","valueDescription":"价值","expectedDeliveryDate":"2026-12-31","businessDomainId":"1899408351909954560"}'
```

### CLI

```bash
node "$PACK_ROOT/tools/original-requirement-api.mjs" create --json body.json
```

成功 `data`：`id`, `originalNo`（`OR-` 前缀）

---

## OR06 详情

`GET /api/open/original-requirements/detail/{idOrNo}`

路径支持主键 ID **或** OR 编号。成功 `data` 须含提出人 `proposer`、验收人 `requirementAcceptancePerson`（与其它详情字段一并返回）。

```bash
curl -sS "$BASE/api/open/original-requirements/detail/OR-20260701-0001" \
  -H "X-Open-Api-Token: $TOKEN"
```

```bash
node "$PACK_ROOT/tools/original-requirement-api.mjs" detail --id OR-20260701-0001
```

---

## OR07 列表

`POST /api/open/original-requirements/findPage`

默认 `{ "current": 1, "size": 5 }`。可选：`keyword`、`businessDomainList`、`priorityList`、`intakeStatusList`、`proposerList`、`submitChannelList`（数组字段须 JSON 数组）。

```bash
curl -sS -X POST "$BASE/api/open/original-requirements/findPage" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"current":1,"size":5,"keyword":"关键词"}'
```

```bash
node "$PACK_ROOT/tools/original-requirement-api.mjs" list --json query.json
```

---

## OR02 部分更新

`PATCH /api/open/original-requirements/{orNo}`

- 路径**只认 OR 编号**（不认数字 id）
- Body 字段全部可选；`null`/未传 = 不改；须至少一项非 null
- 白名单：`title`, `businessPain`, `userNeedDesc`, `valueDescription`, `expectedDeliveryDate`, `businessDomainId`, `proposer`, `requirementAcceptancePerson`
- `proposer`：提出人展示串；推荐 **姓名+工号**（M05 `name`+`employeeId`）；服务端亦接受仅人名 / 仅工号；须能匹配用户元数据；空串拒绝；`null`/未传 = 不改
- `requirementAcceptancePerson`：验收人，格式与解析规则同提出人；空串拒绝；`null`/未传 = 不改（**不**随提出人联动改写）
- 终态「已完成」「不采纳」不可改
- 未知字段拒绝

```bash
curl -sS -X PATCH "$BASE/api/open/original-requirements/OR-20260701-0001" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"title":"新标题"}'
```

```bash
# 修改提出人或验收人（须先 M05 点选，禁止手填工号；二者独立，互不联动）
node "$PACK_ROOT/tools/original-requirement-api.mjs" m05 --keyword 张三 --pick
node "$PACK_ROOT/tools/original-requirement-api.mjs" update --id OR-20260701-0001 --json body.json
```

成功 `data`：`id`, `originalNo`, `updatedAt`

---

## 元数据 M01 / M05

| ID | 方法 | 路径 | 说明 |
|----|------|------|------|
| M01 | GET | `/api/open/metadata/business-domains` | 业务领域列表（与需求池共用） |
| M05 | GET | `/api/open/metadata/users` | 用户列表（创建/修改**提出人、验收人**点选；`name` + `employeeId` → `proposer` / `requirementAcceptancePerson`） |

```bash
node "$PACK_ROOT/tools/original-requirement-api.mjs" m01
node "$PACK_ROOT/tools/original-requirement-api.mjs" m05 [--keyword 张三] [--pick]
```

**M05 点选（Agent）**：`--pick` 输出列表后——命中 **1** 条可直接采用并复述（免再问序号）；**≥2** 须用户回序号；**0** 换关键词。仍**禁止**跳过 M05 手填。细则：`phases/create-phase.md` §M05。

**分页纪律（P-390）**：`current` / `size` 分页；单页未覆盖 `total` 时**须**递增 `current` 直至取齐（或使用契约允许的 `fetchAll`）；**禁止**只展示第一页后让用户点选导致漏项。若服务端对 `size` 有封顶，以响应中的 `size`/`total` 为准继续翻页。

> **无**开放 API：受理状态更新、关联需求池、不采纳/作废。请引导用户用 Web → **T-BOUNDARY-WEB**。  
> **提出人 / 验收人**：创建/修改均可经 M05 **分别**指定；二者独立，修改其一**不**自动改写另一。创建未提提出人则不传 `proposer`（Token 默认）；创建未提验收人则不传 `requirementAcceptancePerson`（Token 默认，**不**与提出人绑同值）。

---

## 响应与错误

`Result<T>`：`success` / `code` / `message` / `data`

> 业务失败**常为 HTTP 200** + `success: false`。须解析 body；CLI / `httpJson` 已按 body 判定。

| 场景 | 处理 |
|------|------|
| `success: true` | `verify-original-requirement-response.cjs` 通过后交付 |
| 400 / `success: false` | `error-humanize.md` 转人话 |
| 网络/5xx | 说明失败，勿编造 originalNo |
