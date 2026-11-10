# create-phase · 创建问题单（P01）

> 契约：`open-api-contract.md` §P01 · `create-defaults.md`

## 进入条件

- `operation: create`
- `title` + `description` + 提单人齐备前**禁止**提交

## 步骤

1. 若无会话 metadata → 先静默 `metadata`（失败则如实告知，仍可尝试创建走服务端 defaults）
2. 收标题与用户素材；**撰写问题描述 = Agent 业务总结**（`create-defaults.md` §问题描述；禁止整卡原文搬迁）
3. 提单人 / 二线 / 处理人未指定 → 均用 `resolve-token-user`（**metadata.tokenUser**）；**禁止**用环境默认二线顶替
4. 类型/归属：用户已给则采用；否则走 metadata defaults（特性组/领域/应用）
5. 将**最终总结**写入 `draft.json` 的 `description`（与即将展示的确认描述同一内容）
6. **当前正在**规范化 → `prepare --json draft.json --out prepared.json --human`  
   - CLI 补人员 + 转 HTML；**原样贴** prepare 的 human 输出作为确认表  
   - **禁止**手写另一套概况
7. 用户选 **1** → `create --json prepared.json`（同一文件；禁改描述另存）
8. **当前正在**校验 → `verify-problem-ticket-response.cjs`
9. **T-PT-CREATE-DONE**（含 `problemNo` + 详情链接）

## 交付

verify 通过 + 成功话术；写 session `last_problem`。
