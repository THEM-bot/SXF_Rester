# 用户可见字段 · 中文展示

> 机检真源：`scripts/lib/display-humanize.cjs`

## 纪律

1. **禁止**向用户展示 API 英文字段名（如 `originalNo`、`businessPain`）。
2. Open API 的 `intakeStatus`/`priority` **已是中文**时原样展示。
3. CLI 优先：`--human`。

## 字段名映射

| API 字段 | 用户可见 |
| --- | --- |
| `originalNo` | 原始需求编号 |
| `id` | 原始需求 ID |
| `title` | 标题 |
| `businessPain` | 业务背景/痛点 |
| `userNeedDesc` | 原始需求描述 |
| `valueDescription` | 价值描述 |
| `intakeStatus` | 受理状态 |
| `priority` | 优先级 |
| `absolutePriority` | 绝对优先级 |
| `proposer` | 提出人 |
| `requirementAcceptancePerson` | 验收人 |
| `businessDomainName` | 业务领域 |
| `businessDomainId` | 业务领域 ID |
| `submitChannel` | 提出渠道 |
| `expectedDeliveryDate` | 计划交付 |
| `proposedAt` | 提出时间 |
| `businessContactPerson` | 业务接口人 |
| `itProductPlanner` | IT 产品规划 |
| `updatedAt` | 更新时间 |
