# close-phase · 关闭缺陷（D06）

## NL 优先

`parse-intent` 有 `idOrNo` + `closeType` → **T-CLOSE-CONFIRM** → `close` → verify

## 兜底

**T-DEFECT-ID-ASK** → **T-CLOSE-TYPE-ASK**（1 解决关闭 / 2 非问题关闭）→ **T-CLOSE-CONFIRM** → close

`closeType`：`resolved` / `not_issue`（M11 点选，禁止手填 code）
