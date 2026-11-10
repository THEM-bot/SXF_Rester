# detail-phase · 详情（R02）

> 契约：`open-api-contract.md` §R02 · 后端：`OpenRequirementController#detail` · 响应：`OpenRequirementDetailVo`

## 进入条件

- `operation: detail` 或用户经 **T-QUERY-TYPE-ASK** 选 **1**（详情）
- 用户给出 `REQ-` / 数字 id 要查详情 → **跳过** T-QUERY-TYPE-ASK

## 步骤

1. 收 `idOrNo`（`REQ-` 前缀或数字 `requirementId`；缺则问 → **T-REQ-ID-ASK**）
2. **当前正在**查询详情 → `requirement-api.mjs detail --id {idOrNo} [--out resp.json]`（verify 后交付用 **`--human`** 或 **T-DETAIL-DONE**）
3. 响应写临时文件 → **必做** `verify-requirement-response.cjs`
4. **T-DETAIL-DONE**（字段取自 `data`，禁止编造）
5. **T-DETAIL-THEN-ACT**（**必须**）：问用户是否继续修改 / 作废 / 结束本轮

## 交付字段（`data` 有则展示 · **用户可见须中文**）

API 字段见下表；展示时**禁止**英文字段名，枚举须按 `ui/field-labels.md` 转中文：

`requirementNo`→需求编号, `title`→需求标题, `status`→状态, `priority`→优先级, `requirementLevel`→需求层级, `requirementType`→需求分类, `businessDomainName`→业务领域, `projectName`→关联项目, `appServiceName`→应用/服务, `responsiblePoName`→负责PO, `storyPoint`→故事点, `plannedStartDate`/`plannedEndDate`→计划时间, `createTime`→创建时间

## 失败

| 场景 | 处理 |
|------|------|
| 404 / 不存在 | 人话：未找到该需求，请核对 REQ- 编号 |
| 400 / token | `error-humanize.md` |
| 网络/5xx | 说明失败，勿伪造字段 |

**禁止**：跳过 verify；编造详情字段。
