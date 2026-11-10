# 任务操作 · 固定话术

> 与用户交互时**必须**套用；选项须序号 +「请回复序号」。

## T-OP-TYPE-ASK

```text
请说明要做哪一种：
1. 创建任务
2. 查询任务
3. 修改任务
4. 取消任务

请回复序号（如 `1`）。
```

**Agent（P-220）**：序号 → `create` / `null`+T-QUERY-TYPE-ASK / `update` / `cancel`

## T-QUERY-TYPE-ASK

```text
请说明查询方式：
1. 查某条任务详情（须提供 TASK- 编号或任务 ID）
2. 按条件查任务列表

请回复序号（如 `2`）。
```

## T-TASK-ID-ASK

```text
**请提供任务编号或数字 ID**

示例：
- `TASK-20260709-001`
- `109`
```

## T-TASK-TITLE-ASK

```text
**请提供任务标题**（≤200 字）

示例：`实现开放 API 任务创建`
```

## T-TASK-DATE-ASK

```text
**请提供计划起止日期**（yyyy-MM-dd）

示例：`2026-07-09` 至 `2026-07-11`

可先回复开始日期，再回复结束日期。
```

## T-REQ-SEARCH-ASK

```text
**请提供需求搜索关键词**

用于在需求池中搜索所属需求（须已关联开发迭代）。

示例：`登录` 或 `REQ-20260703`
```

## T-M10-PHASE-PICK

```text
请选择任务阶段（回复序号）：
{脚本编号列表}

请回复序号。
```

## T-M10-CATEGORY-PICK

```text
请选择任务类别（阶段：{taskPhase}，回复序号）：
{脚本编号列表}

请回复序号。
```

## T-T03-FILTER-MENU

```text
请选择筛选方式（可多次选择后选「开始查询」）：

1. 按所属需求（搜索 + 点选）
2. 按特性小组（M06 点选）
3. 按开发迭代（M08 点选）
4. 按任务状态（M10 点选）
5. 按任务阶段 / 类别
6. 按标题模糊
7. 按任务编号模糊
8. 开始查询
9. 查全部（无筛选 · 慎用）

请回复序号（如 `1`）。
```

## T-UPDATE-FIELD-ASK

```text
请选择要修改的字段（一次改一项）：

1. 标题
2. 描述

请回复序号（如 `1`）。
```

## T-BLACKLIST-FIELD

```text
任务开放 API 仅允许修改**标题**和**描述**。

字段「{fieldLabel}」不能通过 API 修改；请在 Web 看板操作状态、负责人、阶段等。

请改用序号 1 或 2 修改标题/描述，或结束本轮。
```

## T-CANCEL-CONFIRM

```text
即将取消任务：{taskNo}（当前状态：{status}）

**请确认是否取消**

1. 确认取消
2. 不取消

请回复序号（如 `1`）。
```

## T-SESSION-REUSE-ASK

```text
检测到本地已保存的上传参数（创建任务 · {env_label} 环境）：

- 所属需求：{requirementTitle}（{requirementNo}）
- 任务阶段：{taskPhase}
- 任务类别：{taskCategory}

是否沿用以上参数？

1. 沿用
2. 不沿用，重新选择

请回复序号（如 `1`）。
```

> **Agent**：**仅完整轨**在步骤 1 使用；用户输入轨 / 需求分析轨**跳过**本模板。

## T-TASK-DEDUP-CLARIFY（需求分析轨 · 去重不确定 · **必用** · P-380）

> **何时**：`uncertain[]` 非空，或机侧 `confidence: medium` 且无描述佐证，或泛化标题需确认拆分意图。  
> **禁止**套用父包 `T-REQ-CLARIFY`（那是 OR vs 需求池歧义，与本场景无关）。

```text
需求分析去重结果需要您确认（部分任务与已有 TASK 可能重复或拆分意图不明确）：

{uncertainSummary}

请回复序号：
1. 按分析建议：创建未重复项，跳过已标重复项
2. 全部仍要创建（忽略去重建议）
3. 取消创建

请回复序号（如 `1`）。
```

**Agent**：用户选 1/2 后继续 **T-CREATE-CONFIRM**；选 3 结束。**禁止**未发本模板即默认跳过或默认创建。

## T-CREATE-INPUT-ASK（创建内容收参 · P-408 · 菜单纯序号后必发）

> **何时发**：`operation: create` 已确定，但当轮句为 handoff/OP **纯序号**，或无可解析所属需求（无 URL / `REQ-` / 沿用需求 / 上下文 id）。**禁止**此时调用 `prepare-create`。

```text
请提供创建任务所需信息（可一段话说完）：

- 所属需求：需求页链接，或 REQ 编号，或关键词（关键词将进入搜索点选）
- 任务标题 / 内容（可选；也可先只发需求，再选手动或自动创建）

示例：
在 http://localhost:5173/app/requirements/pool/requirement/4174 下新建任务，名称 API测试1，内容 测试url创建任务

也可只发需求链接或 REQ 编号。
```

**Agent**：仅需求引用 → `--resolve-only` + **T-CREATE-MODE-ASK**；同句含标题/内容 → `prepare-create` → **T-CREATE-CONFIRM**。若用户改选「完整创建」→ 完整轨。

## T-CREATE-MODE-ASK（指定需求后创建方式 · P-410 · 必用）

> **何时**：已解析并校验所属需求，且无任务 NL、无自动创建口令。  
> **命令**：`prepare-create --text "…" --resolve-only`。**禁止**此时跑 `req_analyze`。

```text
已识别所属需求：{requirementTitle}（{requirementNo}）

请选择创建方式：
1. 手动创建任务（由您提供标题与内容）
2. 自动创建任务（按需求正文分析拆分，并与已有任务去重）

请回复序号（如 `1`）。
```

**Agent**：选 1 → **T-CREATE-MANUAL-INPUT-ASK**；选 2 → `prepare-create --force-track req_analyze`。MODE 序号 **禁止**当 `prepare-create --text`。

## T-CREATE-MANUAL-INPUT-ASK（手动轨收参 · P-410）

> **何时**：**T-CREATE-MODE-ASK** 选 **1**，或 **T-CREATE-DEDUP-EMPTY-DONE** 选 **1**。

```text
请提供本条任务信息（所属需求已选定：{requirementNo}）：

- 任务标题（必填）
- 任务内容 / 描述（可选）

示例：名称 实现固定访问链接，内容 打通详情页分享链与最新版路由

也可说「完整创建」改为逐步点选阶段/类别等。
```

**Agent**：用户补 NL 后，将需求引用与 NL 拼成一句再 `prepare-create`（走 `user_input`）。

## T-CREATE-DEDUP-EMPTY-DONE（自动轨去重后无可新建 · P-410）

> **何时**：`apply-dedup` 后 `create_count=0` / `task_items=[]`。**禁止**再发带「确认创建」的空 **T-CREATE-CONFIRM**。

```text
去重后无可新建任务（未调用创建接口）。

所属需求：{requirementTitle}（{requirementNo}）
已跳过：
{skippedList}

你可以：
1. 改为手动创建（提供标题/内容）
2. 全部仍要创建（忽略去重，按原分析项创建）
3. 结束本轮

请回复序号（如 `1`）。
```

**Agent**：选 1 → **T-CREATE-MANUAL-INPUT-ASK**；选 2 → 用去重前 `task_items` 重建 intent 并 **T-CREATE-CONFIRM**；选 3 结束。

## T-CREATE-CONFIRM（创建前必发 · v0.7 · 原 T-CREATE-QUICK-CONFIRM）

**单条**（`create_count` = 1 且无 `task_items`，或用户输入轨）：

```text
已解析创建参数，请确认：

| 项目 | 内容 |
|------|------|
| 所属需求 | {requirementTitle}（{requirementNo}） |
| 任务标题 | {title} |
| 任务描述 | {description} |
| 任务阶段 | {taskPhase}（默认） |
| 任务类别 | {taskCategory}（默认） |
| 计划日期 | {plannedStartDate} 至 {plannedEndDate}（默认当日） |
| 预估工时 | {estimatedHours} 天（人天，默认） |
| 负责人 | {assigneeLabel}（默认当前令牌用户） |
| 创建数量 | {create_count}{createCountHint} |
| 内容来源 | {contentSourceHint} |

当前环境：{env_label}。

1. 确认创建
2. 修改参数
3. 取消

请回复序号（如 `1`）。
```

**多条**（需求分析轨 · `task_items[]`）：

```text
已解析创建参数，请确认：

| 项目 | 内容 |
|------|------|
| 所属需求 | {requirementTitle}（{requirementNo}） |
| 创建数量 | {create_count}{createCountHint} |
| 任务阶段 | {taskPhase}（默认） |
| 任务类别 | {taskCategory}（默认） |
| 计划日期 | {plannedStartDate} 至 {plannedEndDate}（默认当日） |
| 预估工时 | {estimatedHours} 天/条（人天，默认） |
| 负责人 | {assigneeLabel}（默认当前令牌用户） |

将创建以下任务：

{taskItemsList}

{dedupSkippedSection}

当前环境：{env_label}。

1. 确认创建
2. 修改参数
3. 取消

请回复序号（如 `1`）。
```

**Agent**：
- `{description}` 为空时显示「（无）」
- `{contentSourceHint}`：`content_refine` 轨 → `内容提炼（由您提供的大段输入摘要生成，标题≤40字）`；`user_input` → `用户输入（自动识别）`；`req_analyze` → `需求分析生成`；其它留空
- `{dedupSkippedSection}`：需求分析轨若有跳过项，追加段落「以下任务与已有任务重合，将跳过：…」；无则留空
- `{taskItemsList}`：逐条 `1. {title}`，描述过长截断约 80 字

> **兼容**：旧名 **T-CREATE-QUICK-CONFIRM** 等同本模板；话术**禁止**出现「快捷模式」。

## T-CREATE-QUICK-CONFIRM

> **已更名** → 使用 **T-CREATE-CONFIRM**（上文）。

## T-CREATE-EDIT-MENU（原 T-CREATE-QUICK-EDIT-MENU）

```text
请选择要修改的项：

1. 任务标题
2. 任务描述
3. 计划日期
4. 预估工时（人天）
5. 所属需求
6. 切换完整创建（阶段/类别点选）
7. 返回确认页

请回复序号。
```

## T-CREATE-QUICK-FAIL

```text
无法按当前参数创建任务。

原因：{reason}

你可以：
1. 更换所属需求（提供链接或关键词）
2. 切换完整创建
3. 结束本轮

请回复序号。
```

## T-CREATE-BATCH-DONE

```text
批量创建完成：成功 {successCount}/{totalCount} 条。

{summaryLines}

编号以 API 返回为准。
```

**Agent**：`{summaryLines}` 每行 `· {taskNo} · {title}`。

## T-CREATE-DONE

```text
任务创建成功。

| 项目 | 内容 |
|------|------|
| 任务标题 | {title} |
| 任务编号 | {taskNo} |
| 任务 ID | {taskId} |
| 所属需求 | {requirementTitle} |
| 详情链接 | {detailUrl} |

编号以 API 返回为准。
```

> **`{detailUrl}`**：`buildWebDetailUrl({ kind: 'task', id: taskId })`。缺 id → 无法生成提示；**禁止**编造。优先 `create --human`。

## T-DETAIL-DONE

```text
任务详情：

{humanDetailText}
```

## T-LIST-DONE / T-LIST-EMPTY-DONE / T-LIST-EMPTY-RETRY-ASK / T-LIST-PICK-ONE

同 requirement 列表交付结构，字段见 `field-labels.md`（任务编号、任务标题、状态、阶段…）。

## T-UPDATE-DONE / T-CANCEL-DONE

```text
任务 {taskNo} 已{更新|取消}。
```

## T-UPDATE-CONTINUE-ASK

```text
是否继续修改该任务的其他字段？

1. 继续修改
2. 结束

请回复序号（如 `2`）。
```
