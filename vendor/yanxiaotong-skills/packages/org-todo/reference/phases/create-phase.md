# create-phase · 创建组织待办（OT03 · 对齐 Web 新建）

> 契约：`open-api-contract.md` §OT03 · `create-defaults.md`  
> **对齐 Web**：`CreateOrgTodoDialog` — 待办描述必填、进展说明选填（写入首条进展）；**无标题字段**。

## 进入条件

- 父包 token 已通过；`operation: create`
- `descriptionHtml`（仅待办描述）+ `owners`（≥1）+ `proposedBy` + `plannedCloseAt` 齐备前**禁止** OT03（后三者可静默/默认）
- **禁止**创建传 `status`；确认态固定「待处理」
- **禁止**交互收「待办标题」/ 使用 `--title-file`

## 步骤

1. 收待办描述 → **T-OT-DESC-ASK**（缺则问；**禁止跳过**）
2. 收进展说明 → **T-OT-PROGRESS-NOTE-ASK**（**可选**；用户跳过 / 空回 → 不写首条进展）
3. 提出人 / 负责人：未指定 → `resolve-token-user` **分别**静默填 Token；用户给工号/姓名 → 覆盖（姓名走 M05）；失败 → **T-OT-PROPOSED-BY-ASK** / **T-OT-OWNERS-ASK**
4. 计划闭环日：未指定 → **默认今天 + 1 个月**（不必先问）；用户已给日期则采用；要改再用 **T-OT-PLANNED-CLOSE-ASK**
5. 领域/项目：
   - 用户已直给 → 采用
   - 否则读会话：有可用缓存（id+名称成对）→ **T-OT-SESSION-DOMAIN-REUSE-ASK**（沿用 / 不沿用）
   - **无缓存 → 不询问**；可空或 M01/M02 `--pick --out`
6. **提交前复述环境**：当前环境：{env_label} · base_url
7. **T-OT-CREATE-CONFIRM**（含状态只读行、待办描述、进展说明、**提出人**、负责人 `姓名工号`）→ 用户选 **1**
   - 选 **2** → **T-OT-CREATE-EDIT-MENU** → 改后回本步（**禁止**改状态）
8. **当前正在**创建 → `write-json-body`（**仅** `--description-file`）→ `create --json body.json [--progress-file …] --out resp.json`
   - meta 可含 `proposedBy`、`owners`、`plannedCloseAt`、`businessDomain`、`projectIds`，及会话用 `businessDomainName`/`projectName`（CLI 剥离）
   - 有进展说明：CLI `--progress-file` / `--progress-text` **或** OT03 成功后再 `append-progress`（OT04）写入首条进展
9. **当前正在**校验 → `verify-org-todo-response.cjs`（创建响应）；若写了进展，对进展响应一并 verify
10. **T-OT-CREATE-DONE**（含详情链接；有首条进展可在话术中注明）；写 session（含 `token_user` 与领域/项目名称缓存）

## 交付

verify 通过 + **T-OT-CREATE-DONE** 或 `create --human`
