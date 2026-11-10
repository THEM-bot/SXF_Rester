# 原始需求 · 错误人话（Agent SSOT）

> 400/401 时套用；**禁止**向用户贴原始 JSON。

| 原文关键词 | 人话 |
|------------|------|
| title / 标题 | 请提供有效的原始需求标题 |
| businessPain / 痛点 / 业务背景 | 请提供业务背景/痛点 |
| userNeedDesc / 原始需求描述 | 请提供原始需求描述 |
| valueDescription / 价值 | 请提供价值描述 |
| expectedDeliveryDate / 计划交付 | 请提供计划交付日期（yyyy-MM-dd） |
| businessDomainId / 业务领域 | 业务领域无效，请从 M01 列表重新选择 |
| proposer / 提出人不存在 / 提出人格式 / 提出人无效 / 提出人不能为空 | 提出人无效，请从 M05 用户列表点选（姓名+工号） |
| requirementAcceptancePerson / 验收人不存在 / 验收人格式 / 验收人无效 / 验收人不能为空 | 验收人无效，请从 M05 用户列表点选（姓名+工号） |
| 未知字段 | 不能提交该字段；开放 API 仅接受契约内字段 |
| 终态 / 已完成 / 不采纳 / 不可修改 | 该原始需求已处于终态，无法通过开放 API 修改 |
| 权限 / 无权 / 相关方 / 仅提出人 | 当前令牌用户无权修改该原始需求 |
| 令牌 / token / 401 | 开放 API 令牌无效，请重新提供 |
| 不存在 / not found | 未找到该原始需求，请检查 OR 编号 |

完整规则：`scripts/lib/error-humanize-rules.cjs`
