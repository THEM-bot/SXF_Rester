# update-phase · 修改（R04）

> 契约：`open-api-contract.md` §R04 · 后端：`OpenRequirementController#update` · 白名单：`OpenRequirementUpdateRequest`

## 进入条件

- `operation: update` 或用户明确要改某 `REQ-` 字段

## 黑名单（请求前拦截 · VR-09）

下列字段**不在** R04 白名单，JSON 出现即 400：

`businessDomainId`, `projectId`, `appServiceId`, `requirementLevel`, `status`, `requirementNo`, `teamId`, `devIterationId`, `planningIterationId`, `responsiblePoId`, `developerIds`, `moduleId` 等

命中 → **T-BLACKLIST-FIELD**，**禁止**发 R04。

### 自然语言 → 黑名单（请求前拦截 · P-117）

用户口语若含下列意图，**视为**改黑名单字段，**直接** **T-BLACKLIST-FIELD**，**不发** R04：

| 用户表述（示例） | 对应字段 |
|------------------|----------|
| 改领域 / 换业务领域 / 改 businessDomain | `businessDomainId` |
| 改项目 / 换关联项目 / 改 project | `projectId` |
| 改服务 / 换应用服务 / 改 appService | `appServiceId` |
| 改层级 / 改成 Epic·Feature·Story / 改 requirementLevel | `requirementLevel` |
| 改状态 / 改成进行中·已完成 | `status` |
| 改编号 / 改 REQ 号 | `requirementNo` |
| 改负责人 / 改 PO / 改开发 | `responsiblePoId` / `developerIds` |

## 白名单（可改）

`title`, `description`, `priority`, `absolutePriority`, `requirementType`, `storyPoint`, `plannedStartDate`, `plannedEndDate`, `plannedHours`, `clearPlannedHours`

### 枚举（对齐后端）

| 字段 | 合法值 |
|------|--------|
| `priority` | **最高**、**高**、**中**、**低**（中文；禁止 `HIGH`/`MEDIUM` 等） |
| `requirementType` | `L1`/`L2`/`L3`；对用户展示 **L1 - AI 辅助需求** 等（见 `field-labels.md`） |
| `absolutePriority` | 0～1000 整数 |

## 步骤

1. 收 `idOrNo`（缺则问 → **T-REQ-ID-ASK**；列表多条先 **T-LIST-PICK-ONE**）
2. 收要改的字段（**一次一问**；用户未指明字段 → **T-UPDATE-FIELD-ASK**；改优先级 → **T-PRIORITY-PICK**；改需求分类 → **T-REQUIREMENT-CATEGORY-PICK**；改绝对优先级 → **T-ABSOLUTE-PRIORITY-ASK**；至少一个白名单字段）
3. 黑名单字段 → **T-BLACKLIST-FIELD**，不发请求
4. **当前正在**修改 → `requirement-api.mjs update --id {idOrNo} --json body.json`
5. 响应写临时文件 → **必做** `verify-requirement-response.cjs`
6. **T-UPDATE-DONE**（`fieldSummary` 中文；优先 `update --human`）
7. **T-UPDATE-CONTINUE-ASK**（**必须**；用户选 1 则回到步骤 2）

## 失败

| 场景 | 处理 |
|------|------|
| 优先级不合法 | 提示用中文 最高/高/中/低 |
| 无可更新字段 | 至少提供一个可修改字段 |
| 已作废 | `error-humanize.md` 作废相关行 |

**禁止**：英文 priority；未调 CLI 报成功。
