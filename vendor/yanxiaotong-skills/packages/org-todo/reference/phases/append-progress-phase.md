# append-progress-phase · 追加进展（OT04）

## 进入条件

- `operation: append-progress` 或 OT- + 追加/写进展

## 步骤

1. 缺编号 → **T-OT-ID-ASK**
2. 缺进展正文 → **T-OT-PROGRESS-BODY-ASK**
3. **T-OT-PROGRESS-CONFIRM**
4. **当前正在**写入 → `append-progress --id OT-xxx --text "…"` 或 `--json body.json --out resp.json`
5. verify → **T-OT-PROGRESS-DONE**

## 禁止

- 空进展正文提交 OT04
- 未调 CLI 声称已写入
