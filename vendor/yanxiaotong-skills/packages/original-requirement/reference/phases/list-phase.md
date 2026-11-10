# list-phase · 原始需求列表（OR07）

## 进入条件

- `operation: list`

## 步骤

1. 收筛选（可选）：关键词 / 领域等 → 无则默认 `{ current: 1, size: 5 }`
2. **当前正在**查询列表 → `original-requirement-api.mjs list --json query.json --human`
3. verify → **T-LIST-DONE**
4. 若后续要修改且多条命中 → 请用户选唯一 OR 编号

## 禁止

默认过大的 `size`（>20 须说明）；未调 CLI 报成功
