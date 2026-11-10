# update-phase · 更新原始需求（OR02）

## 进入条件

- `operation: update`
- 路径须为 **OR 编号**（非纯数字 id）；否则先详情取 `originalNo`

## 白名单

`title` · `businessPain` · `userNeedDesc` · `valueDescription` · `expectedDeliveryDate` · `businessDomainId` · `proposer` · `requirementAcceptancePerson`

- 改领域时须再走 M01 点选。
- 改提出人：须 **M05 `--pick`**，将选中用户拼为 `proposer = name + employeeId`（若 `name` 已含工号则不重复拼接）；**禁止**手填姓名/工号；拼好后写入 body → **T-UPDATE-CONFIRM**。
- 改验收人：须 **M05 `--pick`**，拼为 `requirementAcceptancePerson = name + employeeId`（规则同提出人）；**禁止**手填；与提出人**独立**，改其一不自动改另一。
- **M05 命中数**：与 `create-phase.md` §M05 点选规则相同——**仅 1 条直接采用并复述（免再问序号）**；≥2 须序号点选；0 条换关键词。
- 提示：改提出人后，原 Token 用户可能失去后续修改权限（与 Web 一致）。

## 步骤

1. 缺编号 → **T-OR-ID-ASK**（若会话有 `last_original`，**可提示**最近编号，但**须用户确认**后方可采用 · P-404）
2. 用户未指明改哪一字段 → **T-UPDATE-FIELD-ASK**；已明示则收新值（一次一问）
3. 选提出人 / 验收人 → **当前正在**拉 M05 → 按 §M05 命中数规则拼对应字段
4. **T-UPDATE-CONFIRM** → 用户选 1；若确认后改口径 → 收齐后**重发**确认，**禁止**未再确认即 PATCH
5. **当前正在**更新 → `original-requirement-api.mjs update --id OR-xxx --json body.json`
6. verify → **T-UPDATE-DONE**

## 禁止

- 改受理状态 / 关联 / 优先级等非白名单字段 → **T-BOUNDARY-WEB**（P-387）
- 手填提出人/验收人展示串或 sys_user.id；改提出人时自动改写验收人（或反之）；终态强改；未确认即 PATCH；未调 CLI 报成功
- 写操作失败后**自动重试**
- 跳过 M05 手填人员；M05 多条命中时未点选即拼装
