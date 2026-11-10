# detail-phase · 组织待办详情（OT02）

## 进入条件

- `operation: detail` 或用户给 `OT-` + 查/详情

## 步骤

1. 缺编号 → **T-OT-ID-ASK**
2. **当前正在**查询 → `detail --id OT-xxx --human --out resp.json`
3. verify → **T-OT-DETAIL-DONE**
4. **T-DETAIL-THEN-ACT**（是否追加进展/修改）
