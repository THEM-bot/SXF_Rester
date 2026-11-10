# detail-phase · 详情（T02）

> 契约：`open-api-contract.md` §T02

## 进入条件

- `operation: detail`；或 **T-QUERY-TYPE-ASK** 选 1

## 步骤

1. 收 `idOrNo`（缺 → **T-TASK-ID-ASK**；有 `last_task` → **T-SESSION-RECENT-PICK** 可选）
2. **当前正在**查询详情 → `task-api.mjs detail --id {id} --human --out resp.json`
3. **verify** → **T-DETAIL-DONE**

## 禁止

未调 CLI 报成功；英文字段名交付。
