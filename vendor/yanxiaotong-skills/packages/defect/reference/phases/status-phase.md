# status-phase · 状态流转（D05）

## NL 优先

`parse-intent` 有 `idOrNo` + `status` → **T-STATUS-CONFIRM**（展示 当前→目标）→ `status` → verify

## 兜底

**T-DEFECT-ID-ASK** → **T-M11-STATUS-PICK** → **T-STATUS-CONFIRM** → status

规则：枚举合法可互转；需求已完成禁止重开已关闭缺陷（VR-D05）
