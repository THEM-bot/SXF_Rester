# list-phase · 列表（T03）

> 契约：`open-api-contract.md` §T03

## 进入条件

- `operation: list`；或 **T-QUERY-TYPE-ASK** 选 2

## 步骤

1. **T-T03-FILTER-MENU** 多轮叠加（或用户明示查全部）
2. 组装 `{ "current": 1, "size": 5 }` + 筛选字段
3. **当前正在**查询 → `task-api.mjs list --json query.json --human --out resp.json`
4. **verify** → **T-LIST-DONE** / **T-LIST-EMPTY-DONE** → **T-LIST-EMPTY-RETRY-ASK**

## 后续

多条改/取消 → **T-LIST-PICK-ONE**

## 禁止

空 Body 扫全库（须提示加筛选）；未 verify 报成功。
