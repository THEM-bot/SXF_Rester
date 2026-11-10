# update-phase · 修改（T04）

> 契约：`open-api-contract.md` §T04

## 进入条件

- `operation: update`

## 步骤

1. **T-TASK-ID-ASK**（或列表 **T-LIST-PICK-ONE**）
2. **T-UPDATE-FIELD-ASK**（标题 / 描述 · 一次一项）
3. 收新值 → **当前正在**更新 → `task-api.mjs update --json body.json --out resp.json`
4. **verify** → **T-UPDATE-DONE** → **T-UPDATE-CONTINUE-ASK**（可选多轮）

## 禁止

改 status/负责人/阶段；黑名单字段 → **T-BLACKLIST-FIELD**
