# 原始需求操作 · 固定话术

> 与用户交互时**必须**套用；选项须序号 +「请回复序号」。

## T-OP-TYPE-ASK

```text
请说明要做哪一种：
1. 创建原始需求
2. 查询原始需求
3. 修改原始需求

请回复序号（如 `1`）。
```

## T-QUERY-TYPE-ASK

用户**仅说「查询」**（无 `OR-`）时 **`operation` 保持 `null`**，**必须**先发本模板（P-396）：

```text
请说明查询方式：
1. 查某条原始需求详情（须提供 OR- 编号）
2. 按条件查原始需求列表

请回复序号（如 `2`）。
```

## T-OR-ID-ASK

进入详情/修改且用户**未**提供 `OR-` 编号时**必须**先发。

若会话存在最近创建/查看的原始需求编号，可附加一行提示，例如：`（提示：本会话最近为 OR-xxxx，确认请回复该编号或另行提供）`——**禁止**未确认即自动沿用（P-404）。

```text
**请提供原始需求编号或 ID**

示例：`OR-20260701-0001`
```

## T-UPDATE-FIELD-ASK（修改 · OR02 · **必用** · P-392）

进入 `update-phase` 且已收编号、用户**未**指明要改哪一项时**必须**先发：

```text
请选择要修改的字段（一次改一项，可多轮）：

1. 标题
2. 业务痛点
3. 用户需求描述
4. 价值说明
5. 期望交付日期
6. 业务领域（须重新 M01 点选）
7. 提出人（须 M05 点选）
8. 验收人（须 M05 点选）

请回复序号（如 `1`）。
```

**Agent**：选 6 → M01 **T-META-PICK**；选 7 → M05 点选后拼 `proposer`；选 8 → M05 点选后拼 `requirementAcceptancePerson`；改 7 **不**自动改 8（反之亦然）；非白名单意图（受理/关联/不采纳等）→ **T-BOUNDARY-WEB**。

## T-SESSION-REUSE-ASK

```text
检测到本环境曾使用过创建默认项：

- 业务领域：{businessDomainName}

是否沿用？
1. 沿用
2. 重新选择

请回复序号（如 `1`）。
```

## T-CREATE-TITLE-ASK

```text
**请提供原始需求标题**

示例：`开放 API 联调示例`
```

## T-CREATE-PAIN-ASK

```text
**请提供业务背景/痛点**

可简要说明当前痛点与背景。
```

## T-CREATE-NEED-ASK

> **仅兜底**：无实质正文可提炼/生成需求描述时才用。有用户实质输入时须 Agent 自动生成 `userNeedDesc`（期望能力/范围/对象），**禁止**默认发出本模板；**禁止**因「原文只有痛点段」而改问用户。

```text
**请提供原始需求描述**

说明期望解决什么问题、给谁用。
```

## T-CREATE-VALUE-ASK

> **仅兜底**：无实质正文可提炼价值时才用。有用户输入时须 Agent 自动提炼，**禁止**默认发出本模板。

```text
**请提供价值描述**

说明落地后的业务价值（可 HTML）。
```

## T-CREATE-DATE-ASK

> **创建默认不用**。计划交付默认当天；仅当用户**主动要求**指定/修改交付日、且未给出 `yyyy-MM-dd` 时才可用本模板（修改流程改交付日见 **T-UPDATE-FIELD-ASK**）。

```text
**请提供计划交付日期**

格式：`yyyy-MM-dd`，示例：`2026-12-31`
```

## T-META-PICK

```text
请选择业务领域（回复序号）：

{options}

请回复序号（如 `1`）。
```

## T-CREATE-CONFIRM

> **必含**：标题、业务背景/痛点、原始需求描述、价值描述（可截断过长正文，但不得省略字段）、人员、计划交付。长文可用「…」截断中间，首尾保留可读摘要。  
> **样式**：与 task 子包 **T-CREATE-CONFIRM** 对齐 — 须用 `| 项目 | 内容 |` 表格，**禁止**改回 `- 字段：` 列表。

```text
已解析创建参数，请确认：

| 项目 | 内容 |
|------|------|
| 标题 | {title} |
| 标题来源 | {contentSourceHint} |
| 业务背景/痛点 | {businessPain} |
| 原始需求描述 | {userNeedDesc} |
| 价值描述 | {valueDescription} |
| 提出人 | {proposerDisplay} |
| 验收人 | {acceptanceDisplay} |
| 计划交付 | {expectedDeliveryDate}（默认当天，未另指定） |
| 业务领域 | {businessDomainName} |

当前环境：{env_label}。

1. 确认创建
2. 修改后再确认

请回复序号（如 `1`）。
```

> **`{proposerDisplay}` / `{acceptanceDisplay}`**：
> - 用户已指定提出人（body 将带 `proposer`）→ 提出人行展示 M05 拼装结果（如 `刘朋举w34708`）；**未指定** →「当前 Token 对应用户（服务端自动写入）」
> - 用户已指定验收人（body 将带 `requirementAcceptancePerson`）→ 验收人行展示 M05 拼装结果；**未指定** →「当前 Token 对应用户（服务端自动写入）」
> - **禁止**因改提出人而自动改写验收人预览（或反之）；二者独立，均遵循「未指定→Token / 已指定→指定人」
>
> **`{contentSourceHint}`**：
> - 内容提炼轨 → `内容提炼（由您提供的大段输入摘要生成，标题≤40字；原始需求描述与价值已自动提炼）`
> - 显式「标题：」关键词 → `用户指定`
> - NL 短句自动采用 → `用户输入（自动识别）`
> - 经 **T-CREATE-TITLE-ASK** 手填 → `用户补充`；亦可整行省略「标题来源」行
>
> **计划交付行**：若用户显式指定了日期，去掉「（默认当天，未另指定）」；未指定人员时对应行文案固定，勿猜测姓名工号写入请求体。
>
> **确认后改口径**：用户选 `2` 或在确认后口头改字段 → 收齐后**重发本模板**，禁止未再确认即创建。

## T-CREATE-DONE

```text
原始需求已创建。

| 字段 | 内容 |
|------|------|
| 标题 | {title} |
| 编号 | {originalNo} |
| ID | {id} |
| 详情链接 | {detailUrl} |
| 环境 | {env_label} |
```

> **`{detailUrl}`**：`buildWebDetailUrl({ kind: 'original-requirement', id })`（见父包 `router/public-env.md` / `tools/lib/web-detail-url.cjs`）。缺 id → `（响应未返回 ID，无法生成链接）`；**禁止**编造。优先原样贴 `create --human`（CLI 须带环境行）；**勿**在交付后再手写 session。

## T-DETAIL-DONE

```text
原始需求详情：

| 字段 | 内容 |
|------|------|
| 编号 | {originalNo} |
| 标题 | {title} |
| 受理状态 | {intakeStatus} |
| 优先级 | {priority} |
| 业务领域 | {businessDomainName} |
| 提出人 | {proposer} |
| 验收人 | {requirementAcceptancePerson} |
| 计划交付 | {expectedDeliveryDate} |
| 提出渠道 | {submitChannel} |
```

## T-LIST-DONE

```text
共 {total} 条，本页 {n} 条：

{table_or_lines}
```

## T-UPDATE-CONFIRM

```text
即将修改原始需求 {originalNo}：

{fieldSummary}

1. 确认修改
2. 取消

请回复序号（如 `1`）。
```

## T-UPDATE-DONE

```text
原始需求 {originalNo} 已更新。

修改字段：{fieldSummary}
```

## T-BOUNDARY-WEB

```text
该操作（{action}）开放 API 暂未开放，请到研效通 Web「原始需求」页面完成。

你可以：
1. 改为创建 / 查询 / 修改正文或领域
2. 结束本轮

请回复序号（如 `1`）。
```
