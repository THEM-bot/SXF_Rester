# 需求池 · 开放 API 契约（包内 SSOT · local:ready）

> **Agent 以本文件为准**；后端 REQ-0050 `接口文档.md` 在人读/后端仓，**勿** Read 仓外。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：读 `router/public-env.md` + 父包 `selected_env`（`tools/env-session.mjs read`）  
> **执行首选**：`node packages/requirement/tools/requirement-api.mjs`

变量：`$BASE` = base_url · `$TOKEN` = 本地解析的 token（勿贴对话）

---

## R01 创建需求

`POST /api/open/requirements/create`

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题，≤200 字 |
| `description` | string | 描述（详情页按 **HTML 富文本**渲染）；CLI 入库前统一转 HTML（P-241），并中和裸 `<script>` / `onerror=` / `javascript:` 等（P-240），避免成纯文本或清洗截断 |
| `businessDomainId` | string | M01 点选；snowflake long **须按字符串传递** |
| `projectId` | string | M02 点选（须属当前领域）；snowflake long **须按字符串传递** |
| `requirementLevel` | string | M09：`Epic` / `Feature` / `Story` |
| `appServiceId` | string | M03 点选；snowflake long **须按字符串传递** |

> **P-130 铁律**：研效通 id 多为 64 位 snowflake，可能超过 JS `Number.MAX_SAFE_INTEGER`。Agent 组装 JSON 时必须写成字符串（如 `"2173363464410542080"`），禁止写 number。

### 默认（可不收）

| 字段 | 默认 |
|------|------|
| `implementationType` | `AI_CODING`（Q6）；亦可显式 `TRADITIONAL`（传统开发则不传生成模式） |
| `generateModeName` | **已发布**生成模式规范名（与配置页 `modeName` **精确一致**）；AI-Coding 技能路径**必填有效名**；开放层空串=未传（可跳过绑定，严闸在技能确认表） |
| `priority` 等 | 服务端默认，不主动问（Q7） |
| `storyPoint` | 可选；非负整数（1 SP = 1 天）；故事卡上传时由 parse-doc 解析写入（SC-260802-005）；原文小数向上取整后同事务落库 |
| `originalRequirementId` | 不传则不关联；传入则创建成功后**自动关联**该原始需求（同事务；开放 API **不**校验「仅 IT 产品规划」） |
| `originalNo` | 可选同义入参（`OR-yyyyMMdd-序号`）；与 `originalRequirementId` 同时传时须指向同一条，否则 400 |
| `teamId` | 可选；M06 特性小组；yml `feature_team_name` 命中小组名时写入（字符串 snowflake） |

> **禁止**：技能路径向开放接口传臆造 `generateModeId`；名称须已发布精确匹配，由服务端解析为 Id。

> **故事点写入（SC-260802-005）**：优先 R01 同传 `storyPoint`。若创建成功后详情无该值，再 **立即** R04 回写；失败须人话提示，禁止伪造成功。

> **`originalRequirementId` 支持的值形态**（字符串）：
> 1. 主键 id（如 `"953"` / snowflake）
> 2. OR 编号（如 `"OR-20260722-0002"`）
> 3. Web 详情 URL（如 `https://…/app/requirements/original/requirement/953`）
>
> 亦可只传 `originalNo`。原始需求须存在且受理状态非「已完成」「不采纳」。

### curl

```bash
curl -sS -X POST "$BASE/api/open/requirements/create" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"title":"示例","description":"说明","businessDomainId":"2173363464410542080","projectId":"2458977242231912448","requirementLevel":"Story","appServiceId":"2442990352181810176","originalRequirementId":"OR-20260722-0002"}'
```

### CLI

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" create --json body.json
node "$PACK_ROOT/tools/requirement-api.mjs" create-from-doc --path file.md --reuse-defaults
```

Windows 写 `body.json` **须无 BOM**，且**不得**用 PowerShell / `node -e` 内联中文拼装。推荐：

```bash
# P-239：meta 可无中文；长描述进 description-file（由 Write 落盘）
node "$PACK_ROOT/tools/requirement-api.mjs" write-json-body \
  --json meta.json --description-file desc.txt --out "$TEMP/req-create-body.json"
node "$PACK_ROOT/tools/requirement-api.mjs" create --json "$TEMP/req-create-body.json" --out "$TEMP/req-create-resp.json"
```

非 Windows 或已有安全落盘的 body 时，也可 `create --json -` 读 stdin；**Windows Agent 默认禁止**依赖 stdin/`node -e` 拼中文 body。

`requirement-api.mjs` 会对 R01 id 字段自动 `String()`，但 Agent 仍须在用户可见契约里按字符串写。

成功 `data`：`requirementId`, `requirementNo`（`REQ-` 前缀）, `mappingKey`；若关联成功另含 `originalRequirementId`, `originalNo`, `originalTitle`（未关联为 null）

---

## R02 详情

`GET /api/open/requirements/detail/{idOrNo}`

成功 `data` 若已关联原始需求则含：`originalRequirementId`, `originalNo`, `originalTitle`（未关联为 null）。

另回传开发人员三列表（下标对齐；无则空列表）：

| 字段 | 说明 |
|------|------|
| `developerIds` | SysUser.id 字符串列表 |
| `developerNames` | 展示名（姓名+工号格式） |
| `developerEmployeeIds` | 工号列表（缺陷修复人默认用） |

```bash
curl -sS "$BASE/api/open/requirements/detail/REQ-xxx" \
  -H "X-Open-Api-Token: $TOKEN"
```

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" detail --id REQ-xxx
```

---

## R03 列表

`POST /api/open/requirements/findPage`

默认 `{ "current": 1, "size": 5 }`（Q9）。筛选字段如 `title`、`requirementNo` 等；**数组字段须 JSON 数组**。

```bash
curl -sS -X POST "$BASE/api/open/requirements/findPage" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"current":1,"size":5,"title":"关键词"}'
```

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" list --json query.json
```

---

## R04 修改

`POST /api/open/requirements/update/{idOrNo}`

**白名单**：`title`, `description`, `priority`（`最高`/`高`/`中`/`低`）, `absolutePriority`, `requirementType`, `storyPoint`, `plannedStartDate`, `plannedEndDate`, `plannedHours`, `clearPlannedHours`, `implementationType`, `generateModeName`

**黑名单（400）**：`businessDomainId`, `projectId`, `appServiceId`, `requirementLevel`, `status`, `teamId`, `devIterationId` 等 → 见 `update-phase.md`

```bash
curl -sS -X POST "$BASE/api/open/requirements/update/REQ-xxx" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"priority":"高"}'
```

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" update --id REQ-xxx --json body.json
```

---

## R05 作废

`POST /api/open/requirements/cancel/{idOrNo}` · body `{ "cancelReason": "..." }`

须规则层 **T-CANCEL-CONFIRM** 后方可调用。

```bash
curl -sS -X POST "$BASE/api/open/requirements/cancel/REQ-xxx" \
  -H "Content-Type: application/json" \
  -H "X-Open-Api-Token: $TOKEN" \
  -d '{"cancelReason":"需求取消"}'
```

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" cancel --id REQ-xxx --reason "需求取消"
```

---

## 元数据 M01 / M02 / M03 / M06 / M09

> 需求创建预填常用：**M01** 领域 · **M06** 特性小组 · **M02** 关联项目 · **M03** 应用/服务 · **M09** 层级字典。  
> yml `feature_team_name` 双义见 `upload-defaults.md`（先 M06 再 M02）。  
> **分页（P-390）**：`current` / `size`；未覆盖 `total` 时须递增 `current` 取齐（或 `fetchAll`）；以响应实际 `size` 为准，禁止只展示首页。

| ID | 方法 | 路径 | 说明 |
|----|------|------|------|
| M01 | GET | `/api/open/metadata/business-domains` | 业务领域列表 |
| M02 | GET | `/api/open/metadata/projects?businessDomainId=` | 关联项目（须领域 id） |
| M03 | GET | `/api/open/metadata/app-services` | 应用/服务列表 |
| M06 | GET | `/api/open/metadata/teams` | 特性小组列表 |
| M09 | GET | `/api/open/metadata/requirement-dictionaries` | 需求层级等字典；含 `generateModes`（已发布且启用，与 Web 创建下拉一致） |

`M09.data.generateModes[]`：`id` / `modeName` / `description` / `latestVersionNo`。R01/R04 的 `generateModeName` 须与其中 `modeName` **精确**匹配。

**专拉生成模式（对齐 m01 拉业务领域）**：

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" generate-modes
node "$PACK_ROOT/tools/requirement-api.mjs" generate-modes --human
```

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" m01
node "$PACK_ROOT/tools/requirement-api.mjs" m02 --businessDomainId 1
node "$PACK_ROOT/tools/requirement-api.mjs" m03
node "$PACK_ROOT/tools/requirement-api.mjs" m06
node "$PACK_ROOT/tools/requirement-api.mjs" m09
```

---

## 响应与错误

`Result<T>`：`success` / `code` / `message` / `data`

> **本机网关惯例（P-100）**：业务失败**常为 HTTP 200**，body 内 `success: false` 且 `code` 为 400/401 等。  
> **禁止**仅凭 HTTP 状态码判断成功；须解析 JSON 的 `success` 与 `code`。`requirement-api.mjs` / `httpJson` 已按 body 判定。

| 场景 | 处理 |
|------|------|
| `success: true` | `verify-requirement-response.cjs` 通过后交付 |
| HTTP 200 且 `success: false` | 同下 |
| HTTP 400 / `success: false` | `error-humanize.md` 转人话；**禁止**伪造成功 |
| 网络/5xx | 说明失败原因，勿编造 requirementNo |

常见 400 字段：见 `reference/error-humanize.md`
