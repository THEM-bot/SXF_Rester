# 开放 API 通用约定（仅父包 router）

> **范围**：`yanxiaotong-skills` 聚合路由层可选阅读。  
> **子包纪律**：`requirement` / `task` / `defect` / `original-requirement` **禁止**引用本文件全文；**`demo` 允许**引用 §M01 跨子包约束；各子包可在契约内复述本页 M01 分页纪律。

## 环境与 URL

| 项 | 说明 |
|----|------|
| `base_url` | 服务根，含 context-path，如 `http://127.0.0.1:19999/efficiency-hub` |
| 响应 | `Result<T>`：`success`、`code`、`message`、`data` |

## 鉴权（新开放轨）

```http
X-Open-Api-Token: ehub_live_<plain>
```

- **禁止** `Authorization: Bearer ...`
- 日志脱敏 token

## 元数据查询（M01～M03）

分页：`current` / `size`（**禁止** `page`）；`fetchAll=true` 上限 2000。

| ID | GET |
|----|-----|
| M01 | `/api/open/metadata/business-domains` |
| M02 | `/api/open/metadata/projects` |
| M03 | `/api/open/metadata/app-services` |

### M01 跨子包约束（同名「业务领域」· P-121 · P-408）

| 子包 | M01 用途 | 额外约束 |
|------|----------|----------|
| **demo**（D03） | 选 `businessDomainId` | 领域须**已配置部署根目录**；否则 D03 400 → **T-DEMO-NO-DEPLOY-ROOT** |
| **requirement**（R01 创建） | 选 `businessDomainId` | 领域下须有 **M02 关联项目**；无项目 → 脚注 + **T-M02-EMPTY-REPICK** |
| **original-requirement**（OR01） | 选 `businessDomainId` | 与需求池**共用** M01；**无**部署根要求、**无** M02 强制联选 |

**分页取齐（P-390）**：`current` / `size`；响应未覆盖 `total` 时须递增 `current`（或 `fetchAll`）；以响应实际 `size` 为准。

**勿混用**：demo 不要求 M02 点选；requirement 不要求部署根；OR 不要求部署根/M02。

## 写操作（规划）

**禁止 Agent 主动添加** `Idempotency-Key` 请求头，直至各子包 `open-api-contract.md` 显式落地该字段。

**已落地**：`packages/problem-ticket` 创建问题单（P01）**必须**带 `Idempotency-Key`（CLI 可自动生成）。
