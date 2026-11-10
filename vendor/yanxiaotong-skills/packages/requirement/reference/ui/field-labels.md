# 用户可见字段 · 中文展示（Q23 · P-194～P-204）

> **何时查阅**：R02 详情、R03 列表、R01 创建成功等**交付用户**时。  
> **机检真源**：`scripts/lib/display-humanize.cjs`（与本表同步）  
> **枚举 SSOT**：与 Web 对齐 — `efficiency-hub-web-v2/src/constants/requirementCategory.ts`、`src/utils/requirementLevel.ts`

## 纪律

1. **禁止**向用户展示 API 英文字段名（如 `requirementNo`、`title`、`status`）。
2. **禁止**向用户展示未翻译的英文枚举（如裸 `Story`、`L1` 无说明）。
3. Open API 的 `status`/`priority` **已是中文**时**原样展示**；`requirementLevel`/`requirementType` 须按下表映射。
4. CLI 优先：`requirement-api.mjs detail|list|create --human`；或严格套用 `response-templates.md` 中文模板。

## 字段名映射

| API 字段 | 用户可见 |
| --- | --- |
| `requirementNo` | 需求编号 |
| `requirementId` | 需求 ID |
| `title` | 需求标题 |
| `status` | 状态 |
| `priority` | 优先级 |
| `requirementLevel` | 需求层级 |
| `requirementType` | 需求分类 |
| `businessDomainName` | 业务领域 |
| `projectName` | 关联项目 |
| `appServiceName` | 应用/服务 |
| `responsiblePoName` | 负责PO |
| `storyPoint` | 故事点 |
| `implementationType` | 实现方式 |
| `generateModeName` | AI-Coding生成模式 |
| `generateModeId` | 生成模式 ID（一般不对用户强调英文名） |
| `plannedStartDate` / `plannedEndDate` | 计划时间（合并展示） |
| `createTime` | 创建时间 |
| `originalRequirementId` | 关联原始需求 ID |
| `originalNo` | 关联原始需求编号 |
| `originalTitle` | 关联原始需求 |

## R04 修改字段（白名单 · 用户可见）

| API 字段 | 用户可见 |
| --- | --- |
| `title` | 需求标题 |
| `description` | 描述 |
| `priority` | 优先级 |
| `absolutePriority` | 绝对优先级 |
| `requirementType` | 需求分类 |
| `storyPoint` | 故事点 |
| `implementationType` | 实现方式 |
| `generateModeName` | AI-Coding生成模式 |
| `plannedStartDate` / `plannedEndDate` | 计划开始 / 计划结束 |
| `plannedHours` | 计划工时 |
| `clearPlannedHours` | 清除计划工时 |

## R04 黑名单字段（拦截提示用）

| API 字段 | 用户可见 |
| --- | --- |
| `businessDomainId` | 业务领域 |
| `projectId` | 关联项目 |
| `teamId` | 特性小组 |
| `appServiceId` | 应用/服务 |
| `requirementLevel` | 需求层级 |
| `status` | 状态 |
| `requirementNo` | 需求编号 |

## 枚举值映射

### 需求分类 `requirementType`（Web · requirementCategory.ts）

| API 值 | 用户可见 |
| --- | --- |
| L1 | L1 - AI 辅助需求 |
| L2 | L2 - 简单改动需求 |
| L3 | L3 - 全新开发需求 |

### 需求层级 `requirementLevel`（Web · requirementLevel.ts）

| API 值 | 用户可见 |
| --- | --- |
| Epic | 史诗EPIC |
| Feature | 特性Feature |
| Story | 故事Story |

### 状态 `status`（Open API 直出中文 · RequirementStatusEnum）

| API 值 | 用户可见 |
| --- | --- |
| 草稿 | 草稿 |
| 评审中 | 评审中 |
| 待开发 | 待开发 |
| 开发中 | 开发中 |
| 测试中 | 测试中 |
| UAT验收 | UAT验收 |
| 已完成 | 已完成 |
| 作废 | 作废 |

遗留英文码（仅历史数据）：`DRAFT`→草稿、`CANCELLED`/`CANCELED`→**作废**（非「已作废」）。

`priority` 接口已返回中文（最高/高/中/低）时**原样展示**。
