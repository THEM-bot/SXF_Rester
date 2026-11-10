# list-phase · 组织待办列表（OT01）

## 进入条件

- `operation: list` 或用户要按条件列待办

## 步骤

1. 未给筛选且未说查全部 → **T-LIST-FILTER-ASK**（关键词 / 负责人 / 状态 / 查全部）
2. 组装 `query.json`：`current:1`, `size:5` + 筛选字段
3. **当前正在**查询 → `list --json query.json --human --out resp.json`
4. verify
5. `total=0` → **T-LIST-EMPTY-DONE**；否则 **T-LIST-DONE**
6. 多条且用户要改/写进展 → 须选唯一 **T-OT-PICK-FROM-LIST**
