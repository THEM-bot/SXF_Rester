# update-phase · 修改组织待办（OT05 · 含改状态）

> **改状态并进本 phase**（无独立 status operation）

## 进入条件

- `operation: update` 或 OT- + 改/更新（描述、负责人、状态、计划闭环等）

## 步骤

1. 缺编号 → **T-OT-ID-ASK**
2. 缺修改意图 → **T-OT-UPDATE-FIELD-ASK**（含序号：描述 / 负责人 / 状态 / 计划闭环 / 领域 / 项目）
3. 若只改状态 → **T-OT-STATUS-PICK**（五态序号）→ PATCH `{ "status": "…" }`
4. 若改领域/项目：用户直给 **或** M01/M02 点选
5. **T-OT-UPDATE-CONFIRM** 展示将修改字段（中文摘要）
6. **当前正在**更新 → `update --id OT-xxx --json body.json --out resp.json`
7. verify → **T-OT-UPDATE-DONE** → **T-UPDATE-CONTINUE-ASK**

## PATCH 纪律

- 只传用户确认要改的字段
- `owners` 全量替换，禁止空数组
- `projectIds` 至多 1 个
