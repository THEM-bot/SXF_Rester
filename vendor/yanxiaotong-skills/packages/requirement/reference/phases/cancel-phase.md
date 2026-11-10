# cancel-phase · 作废（R05）

> 契约：`open-api-contract.md` §R05 · 后端：`OpenRequirementController#cancel`

## 进入条件

- `operation: cancel` 或用户明确要作废/关闭某需求

## 步骤

1. 收 `idOrNo`（缺则问 → **T-REQ-ID-ASK**；列表多条先 **T-LIST-PICK-ONE**）
2. 可选 `cancelReason`（缺则用默认「需求取消」，对齐 `OpenRequirementCancelRequest`）
3. **T-CANCEL-CONFIRM** — 用户选 **1** 方可继续
4. **当前正在**作废 → `requirement-api.mjs cancel --id {idOrNo} --reason {reason}`
5. 响应写临时文件 → **必做** `verify-requirement-response.cjs`
6. **T-CANCEL-DONE**

## 失败

| 场景 | 处理 |
|------|------|
| 已作废 / 无法修改 | `error-humanize.md` |
| 404 | 核对 REQ- 编号 |
| token / 400 | `error-humanize.md` |

## 禁止

一句「作废它」直接调用；未 **T-CANCEL-CONFIRM** 执行 R05；未调 CLI 报成功。
