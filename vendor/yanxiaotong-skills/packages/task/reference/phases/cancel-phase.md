# cancel-phase · 取消（T06）

> 契约：`open-api-contract.md` §T06

## 进入条件

- `operation: cancel`

## 步骤

1. **T-TASK-ID-ASK**
2. **T-CANCEL-CONFIRM** — 用户选 **1** 方可继续
3. **当前正在**取消 → `task-api.mjs cancel --id {id} --out resp.json`
4. **verify** → **T-CANCEL-DONE**

## 禁止

未 **T-CANCEL-CONFIRM** 执行 T06；未调 CLI 报成功。
