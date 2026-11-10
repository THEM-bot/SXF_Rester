# metadata-phase · 获取问题单元数据（P-META）

> 契约：`open-api-contract.md` §P-META

## 进入条件

- `operation: metadata`
- 父包 token 已通过

## 步骤

1. **当前正在**拉取元数据 → `metadata --human --out meta.json`
2. **当前正在**校验 → `verify-problem-ticket-response.cjs meta.json`
3. 对人展示：`version`、问题类型、defaults、可用特性组/领域/应用（摘要即可）
4. 写 session：`last_metadata.version` 等

## 交付

verify 通过 + 摘要表；可引导「是否继续创建问题单」。
