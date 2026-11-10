# detail-phase · 原始需求详情（OR06）

## 进入条件

- `operation: detail`
- 已有 `OR-` 编号或数字 ID；否则 **T-OR-ID-ASK**

## 步骤

1. **当前正在**查询详情 → `original-requirement-api.mjs detail --id {idOrNo} --human [--out resp.json]`
2. verify → **T-DETAIL-DONE**（中文表，见 `field-labels.md`）

## 禁止

未调 CLI 报成功；向用户贴英文字段名
