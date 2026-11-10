# 缺陷 · 开放 API 契约（包内 SSOT · local:ready）

> **Agent 以本文件为准**；后端 REQ-0052 接口文档在人读仓，**勿** Read 仓外。  
> **鉴权**：`X-Open-Api-Token`（父包 `tools/token-store.mjs`）  
> **base_url**：`router/public-env.md` + `selected_env`  
> **执行首选**：`node packages/defect/tools/defect-api.mjs`

---

## D01 创建缺陷

`POST /api/open/defects/create`

### 必填

| 字段 | 说明 |
|------|------|
| `title` | 缺陷标题 |
| `requirementId` | string；须可建缺陷 |

### 可选默认

| 字段 | 默认 |
|------|------|
| `severity` | `C类（一般）` |
| `assigneeId` | **工号**。显式传入优先；未传 → 所属需求首位有工号的开发人员；再无 → Token 用户（界面称**修复人**） |
| `discoveryPhase` | 需求 R02 当前 `status`（**仅创建时**自动填充，**只读**） |
| `defectType` | 可选；码 `1`～`8`（M11）；创建时由 Agent 按正文语义判定后写入（见 `create-defaults.md` §4） |
| `regressionTesterId` | 不传；可选回归人工号 |
| `regressionTesterName` | 可选；随工号一并传 |

**忽略**：`status`、`defectNo`、`creatorId`

成功 `data`：`defectId`, `defectNo`, `mappingKey`

---

## D02 详情

`GET /api/open/defects/detail/{idOrNo}`

回传含：`assignee*`（修复人）、`regressionTester*`（回归人）、`defectType` / `defectTypeLabel`、`creator*`（创建人，只读）等。

---

## D03 分页

`POST /api/open/defects/findPage` · 默认 `{ "current": 1, "size": 5 }`

拆分字段模糊 + AND；**无**合并 keyword。

人员筛选：`assigneeIds`（修复人）、`regressionTesterIds`（回归人）；**同时传时按 OR** 命中。

---

## D04 修改

`POST /api/open/defects/update/{idOrNo}`

**白名单**：`title`, `description`, `severity`, `assigneeId`, `assigneeName`, `defectType`, `clearDefectType`, `regressionTesterId`, `regressionTesterName`, `clearRegressionTester`

| 字段 | 说明 |
|------|------|
| `defectType` | 码 `1`～`8`；传空串或 `clearDefectType=true` → 清空 |
| `regressionTesterId` | 设回归人；清空须 `clearRegressionTester=true` |
| `assigneeId` | 修复人（必填语义：不可清空） |

**只读（技能包禁止 D04 修改）**：`discoveryPhase`（创建时自动取所属需求状态；Web 详情抽屉亦为只读展示）

Body 含 `status` → 400（须走 D05）

---

## D05 状态流转

`POST /api/open/defects/status/{idOrNo}` · Body `{ "status": "…" }`

进入「修复待回归 / 回归中 / 解决关闭」且回归人为空时，服务端自动赋回归人=操作人（与 Web 一致）。

---

## D06 关闭

`POST /api/open/defects/close/{idOrNo}` · Body `{ "closeType": "resolved"|"not_issue"|"duplicate" }`

---

## M11 缺陷字典

`GET /api/open/metadata/defect-dictionaries`

返回：`status`、`severity`、`closeTypes`、`defectTypes`（`{ code, label }`）

```bash
node "$PACK_ROOT/tools/defect-api.mjs" m11 --pick status
node "$PACK_ROOT/tools/defect-api.mjs" m11 --pick defectType
```

---

## 联调

| API | CLI | 用途 |
|-----|-----|------|
| R02/R03 | `requirements --pick` | 创建/列表筛需求 |
| M05 | `m05 --pick` | 修复人 / 回归人（**工号** `employeeId`） |
| M06/M08 | `m06`/`m08 --pick` | 列表筛选 |

**snowflake id 须 JSON string**。
