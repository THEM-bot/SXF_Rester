# 任务 · 开放 API 契约（包内 SSOT · local:ready）

> **Agent 以本文件为准**；后端 REQ-0051 接口文档在人读仓，**勿** Read 仓外。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：`router/public-env.md` + `selected_env`  
> **执行首选**：`node packages/task/tools/task-api.mjs`

变量：`$BASE` = base_url · `$TOKEN` = 本地 token（勿贴对话）

---

## T01 创建任务

`POST /api/open/tasks/create`

### 必填

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | ≤200 |
| `taskPhase` | string | M10 点选 |
| `taskCategory` | string | M10 联动点选 |
| `requirementId` | string | R03 点选；**须已挂开发迭代** |
| `plannedStartDate` | string | `yyyy-MM-dd` |
| `plannedEndDate` | string | `yyyy-MM-dd` ≥ 开始 |

### 可选

| 字段 | 默认 |
|------|------|
| `assigneeId` | 未传 → Token 用户（状态已认领） |
| `plannedStartPeriod` / `plannedEndPeriod` | `PM` |
| `description` / `estimatedHours` | — |

**技能层快捷轨默认**（非 API 默认）：`taskPhase=开发阶段` · `taskCategory=开发编码` · 计划日期=当日 · `estimatedHours=1`（**1 人天**）· 见 `create-defaults.md`。

**忽略**：`status`、`taskNo`、`creatorId`、`iterationId`

```bash
node "$PACK_ROOT/tools/task-api.mjs" create --json body.json
```

成功 `data`：`taskId`, `taskNo`, `mappingKey`（= taskNo）

---

## T02 详情

`GET /api/open/tasks/detail/{idOrNo}`

```bash
node "$PACK_ROOT/tools/task-api.mjs" detail --id TASK-xxx --human
```

---

## T03 分页

`POST /api/open/tasks/findPage` · 默认 `{ "current": 1, "size": 5 }`

多条件 **AND**；文本模糊、ID 精确。生产环境避免空 Body 扫全库。

```bash
node "$PACK_ROOT/tools/task-api.mjs" list --json query.json --human
```

---

## T04 修改

`POST /api/open/tasks/update/{idOrNo}` · **白名单**：`title`, `description`

黑名单（400 VR-T09）：`status`, `assigneeId`, `taskPhase`, `requirementId` 等

```bash
node "$PACK_ROOT/tools/task-api.mjs" update --id TASK-xxx --json body.json
```

---

## T06 取消

`POST /api/open/tasks/cancel/{idOrNo}` · 无 Body

已完成/已取消 → 400

```bash
node "$PACK_ROOT/tools/task-api.mjs" cancel --id TASK-xxx
```

---

## M10 任务字典

`GET /api/open/metadata/task-dictionaries`

返回 `taskPhase[]`、`status[]`、`phaseCategoryMap` 等。

```bash
node "$PACK_ROOT/tools/task-api.mjs" m10 --pick phase
node "$PACK_ROOT/tools/task-api.mjs" m10 --pick category --phase 开发阶段
```

---

## 联调元数据（REQ-0050 · 创建/列表筛选用）

| API | CLI | 用途 |
|-----|-----|------|
| R03 | `requirements --pick` | 创建时选需求 |
| M05 | `m05 --pick` | 负责人 |
| M06 | `m06 --pick` | 列表筛小组 |
| M08 | `m08 --pick` | 列表筛迭代 |

**无 M01～M04 于任务创建主路径**（与 requirement 不同）。

---

## snowflake id

`requirementId` 等 long id **须 JSON string**，禁止 number。
