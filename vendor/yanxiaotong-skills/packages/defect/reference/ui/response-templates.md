# 缺陷操作 · 固定话术

> 与用户交互时**必须**套用；选项须序号 +「请回复序号」。

## T-OP-TYPE-ASK

```text
请说明要做哪一种：
1. 创建缺陷
2. 查询缺陷
3. 修改缺陷
4. 流转状态
5. 关闭缺陷

请回复序号（如 `1`）。
```

## T-QUERY-TYPE-ASK

```text
请说明查询方式：
1. 查某条缺陷详情（须提供 TD- 编号）
2. 按条件查缺陷列表

请回复序号（如 `2`）。
```

## T-DEFECT-ID-ASK

```text
**请提供缺陷编号或数字 ID**

示例：`TD-20260704-0001`
```

## T-DEFECT-TITLE-ASK

```text
**请提供缺陷标题**（≤200 字）

示例：`登录页按钮点击无响应`
```

## T-DEFECT-CREATE-QUICK-CONFIRM

> **命名说明**：与 task 子包 `T-CREATE-CONFIRM` 对应；保留 QUICK 为历史兼容。  
> **样式**：与 task **T-CREATE-CONFIRM** 对齐 — 须用 `| 项目 | 内容 |` 表格，**禁止**改回 `- 字段：` 列表。

```text
已解析创建参数，请确认：

| 项目 | 内容 |
|------|------|
| 所属需求 | {requirementTitle}（{requirementNo}） |
| 缺陷标题 | {title} |
| 缺陷描述 | {description_for_confirm 或带 <br> 的描述} |
| 严重性 | {severity} |
| 发现阶段 | {discoveryPhase} |
| 缺陷类型 | {defectTypeLabel 或「（未选）」；Agent/`agent_infer` 自动判定时带「（自动判定）」后缀} |
| 修复人 | {assigneeLabel} |
| 回归人 | {regressionTesterLabel 或「（未指定）」} |
| 内容来源 | {contentSourceHint} |

当前环境：{env_label}。

1. 确认创建
2. 修改后再确认

请回复序号（如 `1`）。
```

> **修复人展示**：`{assigneeLabel}` 须含来源，如 `张三（来源：需求开发人员）` / `当前用户（令牌持有人）（来源：令牌）` / `李四（来源：用户指定）`。来源枚举：`用户指定` / `需求开发人员` / `令牌`。

> **缺陷描述换行（必遵）**：多行 / 含 `【现象】` `【预期】` 等段落时，表格单元格内**必须**用 `<br>` 换行（优先用 intent 的 `description_for_confirm`）；**禁止**压成一行空格拼接。空则填「（无）」。

## T-DEFECT-CREATE-FAIL

```text
无法按当前参数创建缺陷。

原因：{reason}
当前环境：{env_label}

你可以：
1. 更换所属需求（提供链接或关键词）
2. 修改标题或描述后重试
3. 结束本轮

请回复序号。
```

## T-DEFECT-UPDATE-CONFIRM

```text
即将修改缺陷 {idOrNo}：

{fieldSummary}

1. 确认修改
2. 取消

请回复序号。
```

## T-STATUS-CONFIRM

```text
即将把缺陷 {idOrNo} 状态从「{currentStatus}」改为「{targetStatus}」。

1. 确认
2. 取消

请回复序号。
```

## T-CLOSE-CONFIRM

```text
即将关闭缺陷 {idOrNo}（{closeTypeLabel}）。

1. 确认关闭
2. 取消

请回复序号。
```

## T-CLOSE-TYPE-ASK

```text
请选择关闭类型：
1. 解决关闭
2. 非问题关闭

请回复序号。
```

## T-STATUS-VIA-D05

```text
缺陷状态不能通过「修改」接口变更，请使用状态流转（例如：把 TD-xxx 状态改为 处理中）。
```

## T-D03-FILTER-MENU

```text
请选择筛选方式（可多次选择后选「开始查询」）：

1. 按所属需求
2. 按特性小组（M06）
3. 按开发迭代（M08）
4. 按缺陷状态（M11）
5. 按严重性（M11）
6. 按标题模糊
7. 按缺陷编号模糊
8. 开始查询
9. 查全部（慎用）

请回复序号。
```

## T-UPDATE-FIELD-ASK

```text
请选择要修改的字段（一次改一项）：

1. 标题
2. 描述
3. 严重性
4. 修复人
5. 缺陷类型
6. 回归人

请回复序号。
```

## T-DEFECT-CREATE-DONE

```text
缺陷已创建。

| 项目 | 内容 |
|------|------|
| 缺陷编号 | {defectNo} |
| 标题 | {title} |
| 详情链接 | {detailUrl} |

可在研效通 Web 缺陷模块查看详情。
```

> **`{detailUrl}`**：`buildWebDetailUrl({ kind: 'defect', id: defectId })`。缺 id → 无法生成提示；**禁止**编造。优先 `create --human`。

## T-BLACKLIST-FIELD

```text
该字段不能通过开放 API 修改。

- **发现阶段**：仅在创建缺陷时自动取所属需求当前状态，创建后不可修改（Web 详情亦为只读）。
- **创建人**：系统登记，不可改。
- **缺陷状态**：请使用「流转状态」操作。
- 其它不可改字段请在 Web 操作。
```
