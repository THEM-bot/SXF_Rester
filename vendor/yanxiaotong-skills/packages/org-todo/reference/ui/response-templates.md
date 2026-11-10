# 组织待办 · 话术模板（Agent SSOT）

> 用户可见回复须套用下列模板；**禁止**自由改写结构。

## T-OP-TYPE-ASK（四选一）

```text
请说明要做哪一种：

1. 创建组织待办
2. 查询组织待办
3. 修改组织待办（含改状态）
4. 追加进展

请回复序号（如 `1`）。
```

## T-QUERY-TYPE-ASK

```text
请选择查询方式：

1. 按编号查详情（OT-…）
2. 按条件查列表

请回复序号（如 `1`）。
```

## T-OT-ID-ASK

```text
**请提供组织待办编号**

格式示例：`OT-20260804-0001`

请直接回复编号。
```

## T-OT-DESC-ASK

创建流程收待办描述时**必须**使用（**描述必填，禁止跳过**；对齐 Web，**无标题字段**）：

```text
**请提供待办描述**（必填，不可跳过）

可直接粘贴正文。
```

**Agent**：**禁止**在话术中提供「跳过」；用户说「跳过」/空回 → 再次发出本模板，说明描述为必填项。**禁止**改问「待办标题」。

## T-OT-PROGRESS-NOTE-ASK

创建流程收「进展说明」时使用（**可选**，对齐 Web「写入首条进展」）：

```text
**请提供进展说明**（可选，写入首条进展）

有内容请直接粘贴；无则回复 `跳过`。
```

**Agent**：空回 /「无」/「跳过」→ 不写首条进展，继续后续收参。

## T-OT-OWNERS-ASK

```text
**请提供负责人**（工号或姓名）

默认将使用当前令牌用户；若需指定其他人，请回复工号或姓名。
多个负责人请用逗号或空格分隔。

示例：`47420` 或 `张三` 或 `47420, 47421`
```

## T-OT-PROPOSED-BY-ASK

```text
**请提供提出人**（工号或姓名）

默认将使用当前令牌用户；若需指定其他人，请回复工号或姓名。

示例：`47420` 或 `张三`
```

## T-OT-PLANNED-CLOSE-ASK

创建流程中**仅**用户要改默认闭环日、或默认不可用时使用（默认 = 今天 + 1 个月，见 `create-defaults.md`）：

```text
**请提供计划闭环日**

格式：`yyyy-MM-dd`，示例：`2026-09-30`
（未指定时默认：今天起一个月后）

请直接回复日期。
```

## T-OT-SESSION-DOMAIN-REUSE-ASK

> **何时**：创建轨且会话 `last_create_defaults` 存在**可用缓存**（领域或项目至少一组 id+名称成对）。**无可用缓存时禁止发本模板。**

```text
检测到上次创建曾使用以下业务领域 / 关联项目：

- 业务领域：{business_domain_display}
- 关联项目：{project_display}

是否沿用？

1. 沿用
2. 不沿用

请回复序号（如 `1`）。
```

**Agent**：缺省项展示「—」。选 1 → 写入确认表对应字段（id 仅内部）；选 2 → 不带入。

## T-OT-CREATE-CONFIRM

```text
请确认即将创建的组织待办：

| 项目 | 内容 |
|------|------|
| 当前环境 | {env_label} |
| 待办描述 | {description_summary} |
| 进展说明 | {progress_note_display} |
| 提出人 | {proposed_by_display} |
| 负责人 | {owners_display} |
| 状态 | 待处理（新建默认，不可改） |
| 业务领域 | {business_domain_display} |
| 关联项目 | {project_display} |
| 计划闭环 | {planned_close_display} |

1. 确认创建
2. 修改参数

请回复序号（如 `1`）。
```

**Agent**：`{proposed_by_display}` / `{owners_display}` 须为 `姓名工号`（工号**无**括号）；默认 Token 时可后缀「（默认：当前令牌用户）」。`{progress_note_display}` 无内容时填「（未填写）」。`{planned_close_display}` 为用户日期或默认今天+1月。**禁止**确认表出现「待办标题」行。

## T-OT-CREATE-EDIT-MENU

创建确认选「修改参数」后使用（**无状态项、无标题项**）：

```text
请选择要修改的内容：

1. 待办描述
2. 进展说明
3. 提出人
4. 负责人
5. 计划闭环日
6. 业务领域 / 关联项目

请回复序号（如 `1`）。
```

**Agent**：创建轨**禁止**使用 **T-OT-STATUS-PICK** / **T-OT-UPDATE-FIELD-ASK**；**禁止**再问「待办标题」。

## T-OT-CREATE-DONE

```text
组织待办已创建。

| 项目 | 内容 |
|------|------|
| 组织待办编号 | {orgTodoNo} |
| 待办简称 | {title} |
| 状态 | {status_label} |
| 首条进展 | {first_progress_display} |
| 详情链接 | {detail_url} |

如需追加进展或修改，请直接说明。
```

**Agent**：`{title}` 取描述纯文本摘要（读侧派生，非独立字段）。`{first_progress_display}` 无则「（未写入）」；已写入可填摘要或「已写入」。
## T-OT-DETAIL-DONE

```text
组织待办详情如下：

{detail_human_text}

如需追加进展或修改，请说明。
```

**Agent**：`{detail_human_text}` 取 `detail --human` stdout（Markdown `| 项目 | 内容 |` 表）；**禁止**改写成「字段：值」纯文本行。

## T-LIST-FILTER-ASK

```text
请选择列表筛选方式：

1. 按关键词
2. 按负责人工号
3. 按状态
4. 查全部（默认分页 5 条）

请回复序号（如 `1`）。
```

## T-LIST-DONE / T-LIST-EMPTY-DONE

列表结果由 `list --human` 输出（Markdown 表：`# | 组织待办编号 | 待办简称 | 状态 | 负责人`）；空列表时说明「未找到匹配组织待办」。**禁止**改写成纯文本编号列表。

## T-OT-PROGRESS-BODY-ASK

```text
**请提供进展正文**

请直接回复要追加的进展内容。
```

## T-OT-PROGRESS-CONFIRM

```text
请确认追加进展：

| 项目 | 内容 |
|------|------|
| 组织待办编号 | {orgTodoNo} |
| 进展正文 | {progress_summary} |

1. 确认写入
2. 修改正文

请回复序号（如 `1`）。
```

## T-OT-PROGRESS-DONE

```text
进展已写入组织待办 {orgTodoNo}。

| 项目 | 内容 |
|------|------|
| 组织待办编号 | {orgTodoNo} |
| 操作人 | {operator_display} |
| 时间 | {progress_time} |
```

**Agent**：亦可原样贴 `append-progress --human` stdout（同款表格）。

## T-OT-UPDATE-FIELD-ASK

**仅修改轨**使用（创建改参用 **T-OT-CREATE-EDIT-MENU**）：

```text
请选择要修改的内容：

1. 待办描述
2. 负责人
3. 状态
4. 计划闭环日
5. 业务领域 / 关联项目
6. 提出人

请回复序号（如 `1`）。
```

## T-OT-STATUS-PICK

```text
请选择目标状态：

1. 待处理
2. 处理中
3. 已闭环
4. 挂起
5. 作废

请回复序号（如 `2`）。
```

## T-OT-UPDATE-CONFIRM

```text
请确认修改：

| 项目 | 内容 |
|------|------|
| 组织待办编号 | {orgTodoNo} |
| 修改摘要 | {update_summary} |

1. 确认更新
2. 重新选择

请回复序号（如 `1`）。
```

## T-OT-UPDATE-DONE

```text
组织待办 {orgTodoNo} 已更新。

| 项目 | 内容 |
|------|------|
| 修改字段 | {update_summary} |
```

**Agent**：亦可原样贴 `update --human` stdout（同款表格）。

## T-UPDATE-CONTINUE-ASK

```text
是否继续修改该组织待办？

1. 继续修改
2. 结束

请回复序号（如 `2`）。
```

## T-OT-PICK-FROM-LIST

```text
多条匹配，请选择要继续操作的条目序号：

{numbered_list}

请回复序号（如 `1`）。
```

## T-DETAIL-THEN-ACT

```text
需要对该组织待办进行下一步操作吗？

1. 追加进展
2. 修改
3. 仅查看，结束

请回复序号（如 `3`）。
```
