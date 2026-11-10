# update-phase · 修改缺陷（D04）

## NL 优先

`parse-intent` 有 `idOrNo` + `updateBody` → **T-DEFECT-UPDATE-CONFIRM** → `update` → verify

## 兜底

**T-DEFECT-ID-ASK** → **T-UPDATE-FIELD-ASK** → update

**白名单**：title / description / severity / assigneeId / assigneeName / defectType / clearDefectType / regressionTesterId / regressionTesterName / clearRegressionTester

- 修复人：`assigneeId`（M05 点选工号）；**不可清空**
- 缺陷类型：码 `1`～`8` 或先 `m11 --pick defectType`；清空 → `clearDefectType=true` 或 `defectType=""`
- 回归人：`regressionTesterId`（M05）；清空 → `clearRegressionTester=true`

含 `discoveryPhase` / 用户要改「发现阶段」→ **T-BLACKLIST-FIELD**（只读；创建时自动取需求状态）

含「创建人」→ **T-BLACKLIST-FIELD**

含 status → **T-STATUS-VIA-D05**
