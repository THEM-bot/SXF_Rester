# 需求创建 · 默认值与 NL 快捷轨（基于原始需求）



> **何时读**：`operation: create` 且用户口令含「在 … 下新建/创建需求」、原始需求详情 URL 或 `OR-` 时同步加载。  

> **机侧**：`tools/lib/parse-create-intent.mjs` · `tools/lib/refine-requirement-content.mjs` · `requirement-api.mjs parse-create|refine-create`  

> **契约**：R01 可选 `originalRequirementId`（string：主键 / OR 编号 / 详情 URL）或同义 `originalNo`；后端会解析并关联。



## 1. 快捷轨目标



对齐缺陷「在 REQ 下创建缺陷」：



```text

在 OR-20260701-0001 下新建需求，支持按原始需求拆池内条目并带出描述

# 口语等价（无「在…下」亦可）：

创建需求 原始需求为: OR-20260629-0001

# 或粘贴 Web 详情：

在 http://localhost:5173/app/requirements/original/requirement/203 下新建需求

```



→ 解析 OR → 调原始需求详情得 snowflake `id` → 填 `originalRequirementId` → **自动提炼**标题/描述 → **T-CREATE-CONFIRM** 表格展示 → R01。



## 2. 父单引用优先级（原始需求）



| 优先级 | 形态 | 说明 |

|--------|------|------|

| 1 | Web 详情 URL | `/app/requirements/original/requirement/{id}`（须识别） |

| 2 | 其它 OR URL | `/original/detail/{id}` 等兼容形态 |

| 3 | `OR-yyyyMMdd-序号` | 用 `original-requirement-api.mjs detail --id OR-xxx` 取 `data.id` |

| 4 | `在 OR-xxx 下` / `在原始需求 {id} 下` | 同上 |

| 4b | `原始需求为/是/：OR-xxx`（可与「创建需求」同句） | 同上；**整句仅此壳时不算用户实质说明** |

| 5 | 无 OR | 不传 `originalRequirementId`（普通创建） |



**纪律**：body 可写 `originalRequirementId`（主键 id / `OR-` 编号 / 详情 URL）和/或 `originalNo`；**禁止**猜不存在的 id。优先 detail 取 `data.id` 写入（提炼标题/描述仍须详情）；若仅关联且已有可靠 `OR-`/URL，可直接写入 body，由后端解析。



## 3. 标题 / 描述（自动提炼 · 必填）



> **描述不可跳过**（全渠道）：`T-CREATE-DESC-ASK` **禁止**提供「跳过」；R01 `description` 必填。



### 3.0 描述 HTML（P-241 强制 · 详情页富文本）



详情页按 HTML 渲染；纯文本 / Markdown 原文入库会显示成「纯文本」或挤成一段。  
提炼与确认表可用纯文本；**`create` / `create-from-doc` / `write-json-body` / `update` 入库前由 CLI 转 HTML**（已是块级 HTML 则原样 + P-240 中和）。



| 情形 | 处理 |

|------|------|

| 已含块级标签（`<p>` / `<ul>` / `<h1-6>` / `<table>` 等） | **原样**（再跑 P-240 中和） |

| Markdown / 纯文本（含文档轨全文） | CLI：标题/列表/表格/代码块 → HTML；正文 escape |

| 裸 `<script>` / `onerror=` / `javascript:` | P-240 全角中和，避免清洗截断后续正文 |



文档轨确认表**不**预览描述正文，但 R01 **一律全文**转 HTML 后上传。



### 3.1 基于原始需求创建



| 条件 | 标题 | 描述 | `refine_source` |

|------|------|------|-----------------|

| 用户有实质说明/描述输入 | 从用户输入提炼（建议 ≤40 字，硬上限 200） | 从用户输入整理全文（入库前转 HTML） | `user` |

| 用户无实质描述（含仅路由壳） | 从原始需求 `title` 等提炼 | 拼装痛点 / 原始需求描述 / 价值（提炼为纯文本，入库前转 HTML） | `original` |

| 两端皆空 | **T-CREATE-TITLE-ASK** / **T-CREATE-DESC-ASK**（无跳过） | 同左 | — |



**路由壳（非实质正文 · 机侧须剥净）**：



- `@yanxiaotong-skills` / `/yanxiaotong-skills`



- `创建需求` / `新建需求` 等动词



- `原始需求为` / `原始需求是` / `原始需求：` / `原始需求编号为`（其后 OR 编号或 URL 已另剥）



- **禁止**把余段「原始需求为」写成标题或描述；`user_text_substantial` 须为 `false`，改走 OR 正文提炼



**纪律**：



1. 同轮 `parse-create --text`；`needs_original_resolve` → `detail` → 取 `data.id`  

2. 再 `parse-create --text … --or-json or.json` **或** `refine-create --text … --or-json or.json` 完成提炼（`refine-create` 对含 OR 的整句须先剥路由壳再判定实质正文）  

3. 若首轮 `title`/`description` 仅为「原始需求为」等壳 → **视为误解析**，同轮用 `--or-json` 重提炼，**禁止**带壳进确认表  

4. 提炼成功后**跳过**逐步问标题/描述，**必须**进入 **T-CREATE-CONFIRM** 表格（含「关联原始需求」）  

5. 成功响应须含关联回显；若无 `originalRequirementId` → **禁止**声称已关联，并提示刷新原始需求页核对  



### 3.2 普通创建 / 文档轨



| 优先级 | `title` | `description` |

|--------|---------|---------------|

| 1 显式关键词 | `标题`/`名称` 后 | `描述`/`内容` 后 |

| 2 大段余段 | 机侧/Agent 提炼 ≤40 | 整理全文（**不可空**） |

| 3 兜底 | **T-CREATE-TITLE-ASK** | **T-CREATE-DESC-ASK**（**无跳过**） |



大段粘贴可走文档轨（`@` md）；文档抽空描述时仍须用户补描述，**禁止**跳过。



## 4. 其它「在 xx 下」（方案 / 项目等）



口令可识别「在某方案/项目下新建需求」，本轮 **API 无对应关联字段**：



- **不**写入 `originalRequirementId`（除非同句另有 OR）

- 可用于带出领域/项目等默认值（若能从上下文解析），仍须 M 点选补齐六必填

- 向用户说明：仅 **原始需求** 支持创建时自动关联



## 5. 与六必填关系



| 项 | 行为 |

|----|------|

| 有 OR 且 detail 含 `businessDomainId` | 可预填领域并跳过 M01（须在确认表展示名称）；项目/层级/服务仍点选 |

| 归属预填 | **yml 唯一命中 → 会话静默 → 点选**（`upload-defaults.md`）；默认不发 T-SESSION-REUSE-ASK |

| 会话「沿用」口令 | 用户显式 `沿用` 时可整组带入上次领域/项目/服务/层级 |

| 确认 | **必须** `T-CREATE-CONFIRM`；有关联时表格须含「关联原始需求」行；提炼结果须进表 |

| R01 body | 六必填 + 可选 `originalRequirementId`（id / OR 编号 / URL）和/或 `originalNo` |



## 6. CLI



```bash

node "$PACK_ROOT/tools/requirement-api.mjs" parse-create --text "在 OR-xxx 下新建需求，…"

# → JSON：original_ref / title / description / missing / refine_source / user_text_substantial



node "$PACK_ROOT/tools/requirement-api.mjs" parse-create --text "…" --or-json or.json

# 已 detail 时同轮完成从用户或 OR 正文提炼



node "$PACK_ROOT/tools/requirement-api.mjs" refine-create --text "用户说明" --or-json or.json

# 仅提炼：有用户实质输入 → user；否则 → original



# 解析 OR 编号/路径 id 为雪花 id（sibling 子包）：

node "$SKILL_ROOT/packages/original-requirement/tools/original-requirement-api.mjs" detail --id OR-xxx --out or.json

# 取 data.id → body.originalRequirementId（String）

```



## 7. 失败人话



| 后端提示 | 用户可见 |

|----------|----------|

| 原始需求不存在或已删除 | 未找到该原始需求，请核对 OR 编号、详情 URL 或 ID |

| 受理状态不允许关联 | 该原始需求当前受理状态不允许关联需求（如已完成/不采纳） |

| 原始需求 ID 格式不正确 | 原始需求引用须为数字 id、`OR-` 编号或合法详情 URL |

| 需求描述不能为空 | 请提供需求描述（不可跳过） |


