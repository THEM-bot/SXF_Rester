# 需求操作 · 固定话术

> 与用户交互时**必须**套用；选项须序号 +「请回复序号」。

## T-OP-TYPE-ASK

```text
请说明要做哪一种：
1. 创建需求（需求池）
2. 查询需求
3. 修改需求
4. 作废需求

请回复序号（如 `1`）。
```

**Agent（P-220）**：用户回复序号后**同轮**更新内部路由卡 `operation`（`1`→`create`，`2`→暂 `null` 并紧接 **T-QUERY-TYPE-ASK**，`3`→`update`，`4`→`cancel`）；**禁止**在 `operation` 仍为 `null` 时进入 `create-phase` 等 phase。映射见 `router/operation-resolution.md` **§3**。

## T-QUERY-TYPE-ASK

用户选「查询」或 `operation` 待定时（**无** `REQ-` 编号）**必须**先发：

```text
请说明查询方式：
1. 查某条需求详情（须提供 REQ- 编号）
2. 按条件查需求列表

请回复序号（如 `2`）。
```

用户首句已含 `REQ-` / 数字 id + 查/详情 → **跳过**，直进 `detail-phase`。

**Agent（P-220 · P-396）**：用户**仅说「查询」** → 内部 `operation` 保持 `null` 直至本菜单；回复 **1**→`detail`；**2**→`list`；**同轮**写入后再进入对应 phase。**禁止**未分流即进 detail。

## T-REQ-ID-ASK（详情/修改/作废 · **必用**）

进入 `detail-phase` / `update-phase` / `cancel-phase` 且用户**未**提供 `REQ-` 编号或数字 `id` 时**必须**先发：

```text
**请提供需求编号或数字 ID**

示例：
- `REQ-20260629-0051`
- `1234567890123456789`
```

用户已在一行内给出编号或 ID → **跳过**本模板。

## T-UPDATE-FIELD-ASK（修改 · R04 · **必用**）

进入 `update-phase` 且已收 `idOrNo`、用户**未**指明要改哪一项时**必须**先发：

```text
请选择要修改的字段（一次改一项，可多轮）：

1. 标题
2. 描述
3. 优先级
4. 故事点
5. 计划时间（开始/结束）
6. 计划工时
7. 需求分类
8. 绝对优先级

请回复序号（如 `3`）。
```

**Agent**：
- 选 **3** → 发 **T-PRIORITY-PICK**，收中文优先级后改 `priority`
- 选 **7** → 发 **T-REQUIREMENT-CATEGORY-PICK**，映射 L1/L2/L3 后改 `requirementType`
- 选 **8** → 发 **T-ABSOLUTE-PRIORITY-ASK**，收整数后改 `absolutePriority`
- 用户已明示字段与新值（如「把需求分类改成 L2」）→ 可跳过本菜单
- 黑名单字段意图 → **T-BLACKLIST-FIELD**，不发 R04

## T-REQUIREMENT-CATEGORY-PICK（创建/修改 · **必用**）

用户要指定或修改 `requirementType`（需求分类）且**未**给出 L1/L2/L3 或完整 Web 文案时**必须**先发：

```text
**请选择需求分类**

1. L1 - AI 辅助需求
2. L2 - 简单改动需求
3. L3 - 全新开发需求

请回复序号（如 `2`）。
```

**Agent**：`1`→`L1`，`2`→`L2`，`3`→`L3`（API 仍传 code，展示用 Web 文案）。

## T-ABSOLUTE-PRIORITY-ASK（修改 · R04）

用户选改绝对优先级且**未**给出数值时**必须**先发：

```text
**请提供绝对优先级**（0～1000 的整数；0 表示未填写）

示例：`100`
```

## T-PRIORITY-PICK（创建/修改 · **必用**）

用户要指定或修改 `priority` 且**未**给出中文档位时**必须**先发：

```text
**请选择优先级**

1. 最高
2. 高
3. 中
4. 低

请回复序号（如 `3`）。
```

## T-CREATE-TITLE-ASK

创建流程收 `title` 时**必须**使用：

```text
**请提供需求标题**（≤200 字）

示例：`开放 API 任务创建接口`
```

## T-CREATE-DESC-ASK

创建流程收 `description` 时**必须**使用（**描述必填，禁止跳过**）：

```text
**请提供需求描述**（必填，不可跳过）

可直接粘贴正文。
```

**Agent**：**禁止**在话术中提供「跳过」；用户说「跳过」/空回 → 再次发出本模板，说明描述为必填项。

## T-LIST-FILTER-ASK（列表 · R03 · **必用**）

进入 `list-phase` 且用户**未**给出筛选条件、**未**说「查全部」时**必须**先发：

```text
请提供筛选条件（可选其一）：

1. 按标题关键词搜索（如：开放 API）
2. 按需求编号搜索（如：REQ-20260629-0051）
3. 查全部（获取最近 5 条需求）

请回复序号（如 `3`）。
```

**Agent**：
- 选 **1** → 发 **T-LIST-FILTER-KEYWORD-ASK**，收 `title` 关键词后查列表
- 选 **2** → 发 **T-LIST-FILTER-NO-ASK**，收 `requirementNo` 后查列表
- 选 **3** 或用户已说「查全部」→ **跳过**本菜单，直接 R03（`size: 5`，无筛选）
- 用户首句已含明确 `REQ-` 编号或标题关键词 → 可跳过本菜单，直接查列表

## T-LIST-FILTER-KEYWORD-ASK

```text
**请提供标题关键词**

示例：`开放 API`

将按标题模糊搜索，返回最多 5 条。
```

## T-LIST-FILTER-NO-ASK

```text
**请提供需求编号**

示例：`REQ-20260629-0051`
```

## T-DOC-FOLDER-ACK（`@` 文档目录 · **必用**）

用户 `@` 指向**需求文档目录**（路径含 `REQ-` 规划编号）时**必须**先发（**禁止**直接读 md 跳过标题/描述确认）：

```text
检测到您 @ 了需求文档目录：{folder_path}

请确认是否用该目录下的文档作为创建素材：

1. 是，读取文档后向您确认标题/描述/优先级
2. 否，仍按常规流程逐项填写

请回复序号（如 `1`）。
```

用户选 **1** → 读取文档 → **T-DOC-CONTENT-CONFIRM** 复述元数据（**不**预览描述正文）→ 再收 M01…；选 **2** → **T-CREATE-TITLE-ASK** 常规流程。

**首句已 `@`（P-211）**：用户**首句**即 `@` 需求文档目录/单篇 md → **跳过** T-CREATE-TITLE-ASK / T-CREATE-DESC-ASK，直接发本模板确认素材来源。

## T-DOC-CONTENT-CONFIRM（读文档后 · **必用** · P-213）

读取 `@` 文档后、调用 R01 **之前**，**必须**先发本模板复述拟用元数据供确认（**禁止**读完直接创建）。  
**样式**：参数预览须用 `| 项目 | 内容 |` 表格（与 task **T-CREATE-CONFIRM** 对齐）。  
**描述口径（P-213）**：**一律**按文档**全文**写入 R01 `description`；确认表**禁止**贴描述正文，**禁止**再问「摘要/完整」。

```text
已从文档提取拟用内容，请确认：

| 项目 | 内容 |
|------|------|
| 需求标题 | {title} |
| 需求分类 | {category} |
| 优先级 | {priority} |
| 实现方式 | {implementationTypeLabel} |
| AI-Coding 生成模式 | {generateModeNameOrPending} |
| 模式来源 | {generateModeSource}（文档属性 / 用户改选；**禁止**用会话默认填模式） |
| 故事点 | {storyPointDisplay}（来源：{storyPointSource}） |
| 需求描述 | 文档全文（创建时完整上传，此处不预览） |

1. 确认，继续选归属
2. 修改后再确认

请回复序号（如 `1`）；如需改标题/分类/优先级/生成模式，可在同一条补充（如 `1 标题改为X`）。
```

**Agent**：
- 用户选 **1** → **不**展示描述正文，直接进 M01…；选 **2** → 按补充改字段后重回本模板
- 序号后带补充（`1 标题改为X`、`2 生成模式改为「S2：改动/小需求」`）→ **先解析序号**，余下按补充修正 `title`/`priority`/`requirementType`/`generateModeName`（P-216）
- **禁止**发「摘要/完整」二选一；**禁止**在本模板或后续预览中贴出文档全文/长描述
- **优先级/分类映射（P-217 / P-225）**：文档内 `P1`/`最高` → 展示与 body 均用中文档位；`L1/L2/L3` → 展示 Web 文案；解析 SSOT：`parse-doc` / `parse-requirement-doc.cjs`（**header > 属性表 > 正文**）；**冲突**时须复述各来源并请用户确认
- **AI-Coding 生成模式（SC-260827-001）**：
  - 解析字段：`generateModeName` / `generateModeStatus`（`hit`|`pending`|`missing`）/ `implementationType`
  - **传统开发**：跳过生成模式写入；确认表可标注「不适用」
  - **AI-Coding**（含文档未写实现方式、默认 AI_CODING）：若 `pending`/`missing`/确认时 list **未唯一命中** → **高亮必选**已发布模式（`generate-modes`），**禁止**无模式调用 R01；来源记 `用户改选`
  - 文档命中精确名 → 展示来源=`文档属性`；用户改选后覆盖为 `用户改选`
  - R01 body 须带 `implementationType` + `generateModeName`（已发布规范名，**禁止**臆造 generateModeId 写入开放接口）
- **目录 @ 主文档（P-226）**：`parse-doc --path`；多篇根目录 `.md` 时扩展 **T-DOC-FOLDER-ACK** 让用户点选
- 用户确认无误 → 进入 M01…（六必填仍须点选，**禁止**从文档猜 id）；R01 描述 = 文档全文
- **防摘要进库（硬）**：后续 R01 **须** `create-from-doc --path {原文档}` 或 `description-file`=原文档全文；**禁止**把确认表上的短说明、对话里的「摘要」、或任何截断预览写入 `body.description`

## T-CREATE-CONFIRM（R01 提交前 · **必用** · 与 task 对齐）

六必填齐备、提交前复述环境之后、调用 R01 **之前**必须发本模板（**禁止**跳过确认直接创建）。  
**样式**：须用 `| 项目 | 内容 |` 表格。

```text
已解析创建参数，请确认：

| 项目 | 内容 |
|------|------|
| 需求标题 | {title} |
| 需求描述 | {descriptionDisplay} |
| 关联原始需求 | {originalTitle}（{originalNo}） |
| 业务领域 | {businessDomainName}（来源：{businessDomainSource}） |
| 特性小组 | {teamName}（来源：{teamSource}） |
| 关联项目 | {projectName}（来源：{projectSource}） |
| 需求层级 | {requirementLevelLabel} |
| 应用/服务 | {appServiceName}（来源：{appServiceSource}） |
| 优先级 | {priority} |
| 需求分类 | {category} |
| 实现方式 | {implementationTypeLabel} |
| AI-Coding 生成模式 | {generateModeNameOrPending}（来源：{generateModeSource}） |
| 故事点初始值 | {storyPointDisplay}（来源：{storyPointSource}） |

当前环境：{env_label}。

1. 确认创建
2. 修改后再确认

请回复序号（如 `1`）。
```

**来源枚举（SC-260802-005 / SC-260827-001）**：`yml` / `会话` / `手选` / `故事卡` / `文档属性`；故事点未解析时 `{storyPointDisplay}` 写 `—（未解析到故事点）`，`{storyPointSource}` 写 `—`；若 `storyPointCeiled`/`story-point-ceiled`，`{storyPointDisplay}` 写 `{storyPoint}（原文 {rawNumber}，已向上取整）`。生成模式 `pending`/`missing` 时 `{generateModeNameOrPending}` 写 `[待确认]` 并**禁止**直接选 1 创建。

**Agent**：
- `{descriptionDisplay}`：**文档轨**固定写 `文档全文（已解析，创建时完整上传，此处不预览）`，**禁止**贴正文；其它轨可写短摘要（建议 ≤80 字）或同文案，**禁止**为确认贴全文；**禁止**空描述进入本模板（缺则先 **T-CREATE-DESC-ASK**，无「跳过」）；落库仍用完整 `description`
- `{category}` 未指定展示 `—`；`{priority}` 默认「中」须标明（默认）
- **特性小组 / 关联项目**：须分两行；缺项写 `—`；yml `feature_team_name` 经 M06 命中填小组行，经 M02 命中填项目行（见 `upload-defaults.md`）；**禁止**合并为「特性小组（关联项目）」
- **关联原始需求**：无关联时本行写 `—` 或**省略该行**；有关联须展示「{originalTitle}（{originalNo}）」；提炼来源可在表下括号注明（用户输入 / 原始需求正文）
- **预填来源**：yml 唯一匹配标 `yml`；沿用会话标 `会话`；用户点选/改参标 `手选`；故事点来自 parse-doc 标 `故事卡`；生成模式来自文档标 `文档属性`（**禁止**用会话默认填模式）
- 用户选 **1** → 再进入「当前正在创建…」→ R01；选 **2** → 按用户说明改字段后重回本模板
- AI-Coding 无有效生成模式时 **禁止**选 1 创建；须先改选/点选

## T-BATCH-DOC-CREATE-ACK（批量创建 · **必用** · P-212）

用户**一次** `@` **多个**需求文档（≥2）或明确「批量创建」时**必须**先发（**禁止**无确认直接连创）：

```text
检测到您 @ 了 {N} 个需求文档，准备批量创建：

1. {title_1}｜模式：{generateMode_1}
2. {title_2}｜模式：{generateMode_2}
… （逐条列出解析到的标题与 AI-Coding生成模式）

请确认创建方式：
1. 沿用上次默认（领域/项目/服务/层级）逐条创建
2. 逐条分别选择领域/项目/服务/层级
3. 取消

{warnings_block}

请回复序号（如 `1`）。
```

`{warnings_block}`（P-235）：若有 `batchWarnings` / 条目 `warnings`，须追加说明段，例如：
- 「第 N 条文档状态为作废」
- 「标题「X」重复出现于 …」
- 「第 N 条优先级 header 与属性表冲突，须确认」
- 「第 N 条缺少/待确认 AI-Coding生成模式，须先确认或改选后再创建」

**Agent**：
- 选 **1**（或用户口令含「沿用」）→ 带入 `last_create_defaults`（**仅六必填**，**不得**用会话默认填生成模式），**逐条** R01，每条前发批量进度句（`progress-display.md`）
- 任一条 `generate-mode-*` **blocked** → **禁止**对该条调用 R01 / `batch-create`；须先单条 **T-DOC-CONTENT-CONFIRM** 选定模式并写回 manifest，或用户改文档后重扫
- 选 **2** → 每条走完整 create-phase 六必填点选（每条仍过生成模式闸）
- 无会话默认却选 **1** → 提示无默认，退回选 **2**
- 口令 **`沿用 自创`** = 选 **1** + 跳过 T-SESSION-REUSE-ASK（P-214）；**仍受生成模式闸约束**
- `--force-conflicts` **仅**用于优先级冲突；**禁止**用于绕过生成模式缺失/待确认

## T-BATCH-CREATE-DONE（批量创建交付 · **必用** · P-215）

批量 R01 **全部** verify 通过后**必须**用本模板交付（**禁止**即兴表格）：

```text
批量创建完成，共 {N} 条：

| # | 需求标题 | 需求分类 | 优先级 | 需求编号 | 需求 ID | 详情链接 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | {title} | {category} | {priority} | {no} | {id} | {detailUrl} |
| … |

说明：若您有本地文档/规划编号，可能与系统分配编号不同，以 API 返回为准。
```

（每行须为 verify 通过后的真实返回；`{category}`/`{priority}` 须中文，按 `field-labels.md`。`{detailUrl}`＝`buildWebDetailUrl`。优先 `display-humanize.cjs` · `formatBatchCreateText`。）

**部分失败（P-369 · 强制）**：须首行汇总「成功 {ok} 条 · 失败 {fail} 条」；失败行标注人话原因；指引用户对失败条重试 `@文档` 或单条创建，**禁止**编造 REQ- 编号。

## 口令表（创建流程 · P-214 · P-216）

用户可见口令 → Agent 解析（**大小写/空格无关**）：

| 口令 | 含义 |
| --- | --- |
| `沿用` | **显式**整组带入 `last_create_defaults`（**无需**先发 **T-SESSION-REUSE-ASK**）；创建默认路径已是 yml→会话静默，本口令用于用户主动覆盖 |
| `沿用` + `@迭代目录` / 多文档批量 | 等同 **T-BATCH-DOC-CREATE-ACK** 选 **1**，可跳过 ACK（P-233） |
| `重新选择` / `自选` | 走完整六必填点选（忽略本轮 yml/会话预填） |
| `自创` / `批量创建` | 进入批量文档创建（配合多 `@` 文档）|
| `沿用 自创` | 沿用会话默认 **+** 批量逐条创建（组合口令）|
| `在 OR-xxx 下新建/创建需求，…` | 基于原始需求快捷轨（`create-defaults.md`）：解析 OR → `originalRequirementId` → 确认表展示关联 |
| `创建需求 原始需求为/是: OR-xxx` | 同上；**无用户实质余段**时从 OR 正文提炼，**禁止**把「原始需求为」当标题 |
| `{序号} {补充}` | **先取序号**，余下为补充说明（如 `1 标题改为X`、`2 优先级改为高`）|

**禁止**：把补充说明整体当作序号导致解析失败；无 `@` 文档时把「自创」当作已有素材。

## T-SESSION-REUSE-ASK

> **默认不发**（SC-260802-005 优先级修订）：归属预填按 `upload-defaults.md` **yml → 会话静默 → 点选**；Agent **不得**在读完 yml / 回退会话后自动发出本模板。  
> **仍可发**的场景：用户显式口令涉及「是否沿用」澄清、或批量 ACK 等模板另有要求时。用户口令 **`沿用`** / **`重新选择`** 见口令表，**无需**先发本模板。

```text
检测到上次创建使用的默认：领域「{name}」、项目「{name}」、服务「{name}」、层级「{level}」{priority_suffix}{category_suffix}。

是否沿用？
1. 沿用
2. 重新选择

请回复序号（如 `1`）。
```

`{priority_suffix}`：有 `priority` 时 `、优先级「{priority}」`；`{category_suffix}`：有 `requirementType` 时展示 Web 文案（见 `field-labels.md`）。

## T-META-PICK

```text
[{M01|M02|M03|M09|生成模式}] 请选择{领域|项目|服务|层级|生成模式}：

1. {name}{footnote}
2. …

请回复序号（如 `1`）。
```

**用户可见仅序号 + 名称**（P-175）：**禁止**在选项中展示 `id=` 技术编号；Agent 内部维护「序号 → id」映射。

**M09 层级（P-199）**：选项须与 Web 一致——**史诗EPIC** / **特性Feature** / **故事Story**（禁止裸 Epic/Feature/Story）。

**M01 无项目脚注（P-099 / P-116）**：拉 M01 后，对每个领域**尝试**拉 M02；若 `records` 为空，追加 **「（暂无关联项目）」**；M02 探测失败则 **「（未能探测关联项目，请慎选）」**。用户仍误选 → **T-M02-EMPTY-REPICK**，**禁止**继续 M09/M03/R01。

## T-META-PICK-PAGE

M01 或 M03 数据超过单页展示上限时使用；**禁止**只展示第 1 页后无后续指引。

```text
[{M01|M03}] 请选择{领域|服务}（第 {current}/{pages} 页，共 {total} 条）：

1. {name}
2. …

还可以：
{nextOption}. 下一页
{prevOption}. 上一页（如有）
{searchOption}. 按名称搜索

请回复序号（如 `1`）。
```

搜索命中后仍须以序号点选；禁止用户手填 id。

## T-M02-EMPTY-REPICK

```text
领域「{domainName}」下暂无可选关联项目，无法继续创建。

请重新选择业务领域：
1. …（重新拉 M01 列表，仅展示有项目的领域若已知；否则完整 M01）

请回复序号（如 `1`）。
```

**禁止**：手填 projectId；在无项目领域上继续收 M09/M03。

## T-CANCEL-CONFIRM

```text
当前准备作废需求 {idOrNo}。
1. 确认作废
2. 取消

请回复序号（如 `1`）。
```

## T-CANCEL-DONE

```text
需求 {idOrNo} 已作废。
```

（verify 通过后**必须**用本模板交付。）

## T-LIST-PICK-ONE

```text
找到多条需求，请选择唯一一条：

1. {no} — {title}
2. …

请回复序号（如 `1`）。
```

## T-BLACKLIST-FIELD

```text
「{fieldLabel}」不能通过开放 API 修改，请到研效通 Web 端调整该需求。
```

（`{fieldLabel}` 须为中文，按 `ui/field-labels.md` · `labelForField` 映射，**禁止**展示 `requirementLevel` 等 API 字段名。）

## T-CREATE-DONE（P-228 · 与 T-BATCH-CREATE-DONE 行字段对齐 · **必用**）

```text
需求已创建：

| 需求标题 | 需求分类 | 优先级 | 需求编号 | 需求 ID |
| --- | --- | --- | --- | --- |
| {title} | {category} | {priority} | {no} | {id} |

| 项目 | 内容 |
| --- | --- |
| 详情链接 | {detailUrl} |
| 关联原始需求 | {originalTitle}（{originalNo}） |

说明：若您有本地文档/规划编号，可能与系统分配编号不同，**以 API 返回为准**。
```

（`{category}`/`{priority}` 须中文；未指定分类展示 `—`。`{detailUrl}`＝`buildWebDetailUrl({ kind: 'requirement', id: requirementId })`；缺 id 勿编造。**无关联时省略「关联原始需求」行**或写 `—`。verify 通过后**必须**用本模板或 `create --human` · `formatCreateText`。P-210/P-228）

## T-DETAIL-DONE

```text
需求详情：
- 需求编号：{no}
- 标题：{title}
- 状态：{status}
- 优先级：{priority}
- 需求层级：{level}
- 需求分类：{category}
- 关联原始需求：{originalTitle}（{originalNo}）
- 业务领域：{businessDomainName}
- 关联项目：{projectName}
- 应用/服务：{appServiceName}
- 负责PO：{responsiblePoName}
- 故事点：{storyPoint}
- 计划时间：{plannedStartDate} ~ {plannedEndDate}
- 创建时间：{createTime}
```

（字段名**必须中文**；`{level}`/`{status}`/`{category}` 须按 `ui/field-labels.md` 映射，如 Story→故事Story、L2→L2 - 简单改动需求。缺失项省略，**禁止**编造。无关联时省略「关联原始需求」行。优先 `detail --human` 或读本模板。）

## T-DETAIL-THEN-ACT

详情交付后**必须**发问（用户已明示「只查不改」可跳过）：

```text
详情已展示。接下来要做什么？

1. 修改这条需求
2. 作废这条需求
3. 结束（不做其它操作）

请回复序号（如 `3`）。
```

用户选 **1** → `update-phase`；选 **2** → `cancel-phase`；选 **3** → 结束。

## T-LIST-DONE

```text
共找到 {total} 条（本页展示 {count} 条）：

1. {no} — {title}（{status} · {priority}）
2. …

需要改/废某条请回复序号。
```

（`count` ≤ 5；`{status}`/`{priority}` 须转中文枚举，优先 `list --human`。）

## T-LIST-EMPTY-DONE

```text
未找到匹配的需求。
```

（`total=0` 或 `records` 为空时**必须**先发本模板，**紧接** **T-LIST-EMPTY-RETRY-ASK**；禁止编造列表项。）

## T-LIST-EMPTY-RETRY-ASK（列表为空 · **必用**）

**T-LIST-EMPTY-DONE** 之后**必须**紧接发送（除非用户已明示结束）：

```text
未找到匹配的需求。

接下来怎么做？

1. 改用标题关键词重新搜索
2. 改用需求编号重新搜索
3. 查全部（最近 5 条）

请回复序号（如 `3`）。
```

**Agent**：
- 选 **1** → **T-LIST-FILTER-KEYWORD-ASK**
- 选 **2** → **T-LIST-FILTER-NO-ASK**
- 选 **3** → 无筛选直接 R03

## T-UPDATE-DONE

```text
需求 {idOrNo} 已更新。
修改字段：{fieldSummary}
```

（`{fieldSummary}` 须为中文标签，如「需求标题、优先级」；按 `display-humanize.cjs` · `formatUpdateFieldSummary` 或 `update --human`。）

## T-UPDATE-CONTINUE-ASK（修改成功后 · **必用**）

**T-UPDATE-DONE** 之后**必须**紧接发送（除非用户已明示结束）：

```text
接下来要做什么？

1. 继续修改其他字段
2. 结束（不做其它操作）

请回复序号（如 `2`）。
```

用户选 **1** → 回到 **T-UPDATE-FIELD-ASK**；选 **2** → 结束本轮。

## T-API-ERROR

失败时读 `error-humanize.md` 映射后输出；不回显 token。
