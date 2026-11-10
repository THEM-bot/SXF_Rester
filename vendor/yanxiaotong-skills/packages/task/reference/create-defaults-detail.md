# 任务创建 · 细则（Agent SSOT · v0.9）

> **何时读**：按 `create-defaults.md` 速查表「按轨加载」**按需**读对应 §；**禁止**一次性 Read 全文。  
> **契约层**：API 必填不变；本文件为技能层默认填充与用户句/URL 解析细则。

---

## 4. 任务名称 / 内容 / 数量自动识别

### 4.1 用户输入轨（`track: user_input`）

#### 4.1.0 数量纪律（v0.7 · 已确认）

- **默认每次输入创建 `1` 条任务**（`create_count = 1`）
- **仅**用户句显式指定数量时 >1：`创建{n}个` / `{n}个任务` / `批量{n}`
- **禁止**因编号列表（`1.` `2.`）、多段逗号等**自动拆成多条**；列表内容整体写入**单条** `description`
- **禁止**与需求下已有任务做重合检测或跳过

#### 4.1.1 填充优先级

| 优先级 | 条件 | `title` | `description` |
|--------|------|---------|---------------|
| 1 | 显式关键词（**可选**，向后兼容） | `名称`/`标题`/`任务名` 后片段 | `内容`/`描述`/`任务内容如下` 后片段（支持 `===` 多行块） |
| 2 | `nl_remainder` 非空（§4.1.2） | `autoTitle(nl_remainder)` | `beautifyUserDescription(nl_remainder)`（去口语填充、规范标点） |
| 3 | 兜底（不应出现在用户输入轨） | 需求 `title` | 需求 `description`；空则省略 |

**禁止**（用户输入轨）：`generateTaskDescription` · 拼接需求业务概述 · `description_generated: true`

### 4.1.2 `nl_remainder` 提取

从用户句依次剥离：需求 URL / REQ 编号 / 创建动词（`创建任务` 等）/ `创建{n}个` / `工时{n}` / `预估{n}天` → 剩余 trim 即为 `nl_remainder`。

**不要求**用户写「名称」「内容」等引导词。`任务内容如下` + `===` 块：整块作为 `description` 来源。

### 4.1.3 `autoTitle` / `beautifyUserDescription`（机侧 · `parse-create-intent.mjs`）

**标题 `autoTitle`**：

1. 去句首填充词：`今天` / `本周` / `主要完成` / `主要做` / `计划` / `打算` 等  
2. 按 `，` `,` `、` `；` `;` 分段；段内 `和` 可拆为多项  
3. 多段：去填充词后用 `、` 拼接（≤ 80 字）  
4. 单段：去填充词后截断（≤ 80 字）  
5. 空结果 → 回退需求 `title`

**描述 `beautifyUserDescription`**（v0.7.1）：共用填充词表；多段口语以 `，` 连接；编号列表保留结构。

`_parse.description_beautified: true` 表示相对用户原句已规范化。

### 4.1.4 结构化覆盖（与 NL 并存）

| 用户表达 | 映射 |
|----------|------|
| `名称…` / `标题…` / `任务名…` | `title`（**可选**显式覆盖） |
| `内容…` / `描述…` / `任务内容如下` | `description`（**可选**显式覆盖；多行块原样保留） |
| `创建{n}个` / `{n}个任务` / `批量{n}` | `create_count` = n（正整数，默认上限 **10**，超限须确认） |
| `工时{n}` / `预估{n}天` / `预估{n}人天` | `estimatedHours` = n（**人天**） |

> 未命中上表数量表达时，**固定** `create_count = 1`，不因内容条数增加。

**示例 A**（v0.5 · **无关键词**）：

```text
在 http://localhost:5173/app/requirements/pool/requirement/4183 下创建任务，今天主要完成接口开发， Skills编写
```

→ `requirementId=4183` · `description=接口开发，Skills编写` · `title=接口开发、Skills编写` · 其余走 §2 默认。

**示例 B**（向后兼容 · 显式关键词）：

```text
在 http://localhost:5173/app/requirements/pool/requirement/4174 下新建任务，名称 API测试1，内容 测试url创建任务
```

→ `requirementId=4174` · `title=API测试1` · `description=测试url创建任务` · 其余走 §2 默认。

**示例 C**（v0.7 · 多行列表仍为 **1 条**）：

```text
在需求 …/requirement/4183 下创建任务，任务内容如下
===
1. 验收 迭代18的需求
2. 处理PMO关键项目阻塞点
===
```

→ `requirementId=4183` · `create_count=1` · `title=验收 迭代18的需求、处理PMO关键项目阻塞点` · `description` = 用户列表原文（规范化后）· **不去重** · 其余走 §2 默认。

### 4.1.5 内容提炼轨（`track: content_refine` · v0.8）

用户粘贴**大段输入**时，机侧标记 `refine_status: pending_agent`，由 **Agent 阅读理解后提炼** `title` + `description`，再进 **T-CREATE-CONFIRM**。

#### 触发条件（机侧 · `content-refine.mjs`）

满足 **任一**（优先级高于 `user_input`）：

1. **口令**：`提炼` / `根据以下内容` / `根据需求文档` / `帮我总结` / `帮我提炼`
2. **大段文本**：`source_content` **≥ 200 字**
3. **文档结构**：`source_content` **≥ 80 字** 且结构特征 **≥ 2 项**

**不触发**（仍 `user_input`）：口令 `原样创建`；显式 `名称/标题` + `内容/描述`；短句或 `===` 短列表块。

#### Agent 提炼规则

| 字段 | 规则 |
|------|------|
| `title` | **≤ 40 字**；概括核心工作；多事项用「、」；**禁止**照搬需求全文标题 |
| `description` | 结构化摘要（建议 `【业务目标】` + `【工作范围】` 编号列表）；保留关键约束；**禁止** HTML/原文整段粘贴 |
| `create_count` | **固定 1** |
| 去重 | **不适用** |

#### 流程

1. `prepare-create` → `track: content_refine` · `source_content` · `refine_status: pending_agent`
2. **Agent** 读 `source_content` + 本节规则 → 提炼标题/描述
3. `task-api.mjs apply-refine --intent … --title "…" --description "…" --out intent.json`
4. **T-CREATE-CONFIRM**（标注「内容提炼」）→ 用户确认 → `create --intent`

#### Golden-case（机侧对照 · P-315）

执行 `node scripts/test-content-refine-golden.mjs` 须全绿。Agent 提炼时**对照**下列标准样例（非机械照搬，须符合字段规则）：

| 样例 | 输入摘要 | 期望 `title`（≤40字） | 期望 `description` 结构 |
|------|----------|------------------------|-------------------------|
| **G1** | REQ 开放 API 任务 CRUD 全文 | `开放 API 任务 CRUD 接口开发` | `【业务目标】` + P0 四项 CRUD 编号列表 |
| **G2** | 验收说明 3 条工作项 | `迭代18验收与阻塞项处理` | `【工作范围】` 1. 2. 3. 保留原序号语义 |
| **G3** | 缺陷复现长文（误用任务轨时） | `登录按钮无响应问题修复` | `【现象】` + `【复现步骤】` 简要 |

Fixture 路径：`scripts/fixtures/refine-golden-g1.json` · `g2.json` · `g3.json`（task）；`defect/scripts/fixtures/refine-golden-d1.json` · `d2.json`

**示例 D**（大段需求文档）：

用户粘贴 REQ-0051 全文 + 需求 URL → 提炼后：

- `title`：`开放 API 任务 CRUD 接口开发（创建/查询/更新/取消）`（≤40 字）
- `description`：业务目标 + P0 CRUD 四项 + 元数据 + 实现约束（结构化，非原文）

### 4.2 需求分析轨（`track: req_analyze` · 无用户任务输入 · P-410）

> **入口**：用户在 **T-CREATE-MODE-ASK** 选 **2**，或句含「自动创建 / 分析创建 / 按需求拆分」等口令。  
> **禁止**：仅 URL/REQ、未选手动/自动时直接进入本轨（须 `--resolve-only` → MODE）。

用户选定自动创建、**无**自然语言补充时：

- **禁止**照搬需求 `title` / HTML `description`
- `analyzeRequirementForTasks`：推断 `create_count` + 为每条任务分析生成 `title` / `description`
- 推断优先级：`plannedHours` → `storyPoint` → 需求 CRUD/编号拆分 → `1`
- 产出 `task_items[]`（`create_count > 1` 时逐条创建）
- CLI：`prepare-create --text "…" --force-track req_analyze`

| 字段 | 规则 |
|------|------|
| `title` | `deriveAnalyzedTitle` 或工作项摘要（**非**需求标题原样） |
| `description` | 任务标题 + 业务对象概述/工作项摘要（**非** HTML 原文） |
| `create_count` | 见 §4.2.1 |

#### 4.2.1 任务数量自动推断（`prepare-create` · R02 后）

**单任务默认 1 人天** → 简单需求默认 **只创建 1 条**；需求计划工期或故事点较大时，自动拆为多条（每条仍 1 人天）。

| 优先级 | 条件 | `create_count` |
|--------|------|----------------|
| — | 用户句已指定数量（§4.1） | 用户值 |
| 1 | `plannedHours` 存在且 **> 1** | `⌈plannedHours / 1⌉`（每任务 1 人天） |
| 2 | 无有效 `plannedHours`，`storyPoint` **> 1** | `⌈storyPoint⌉` |
| 3 | 需求正文含 CRUD/编号等可拆分工作项（≥2 项） | 工作项数量 |
| 4 | 兜底 | `1` |

- 上限 **10**；超限须 **T-CREATE-CONFIRM** 前向用户说明并确认。
- 确认单 **创建数量** 行须附推断依据（如「需求计划工期 3 人天」）。
- `_parse.create_count_source`：`user_text` | `planned_hours` | `story_point` | `req_work_items` | `default`（Agent 内部 · P-218）。

#### 4.2.2 与已有任务去重（仅需求分析轨 · v0.7 · P-281 · P-316）

1. T03 `findPage` 按 `requirementId` 拉取该需求下**全部**已有任务（分页直至穷尽）
2. **机侧预筛**（`dedup-tasks.mjs`）：标题归一化完全相同 → 自动 `skipped[]`；标题高度重合 + 描述词重叠 ≥ 阈值 → 自动 `skipped[]` 或 `uncertain[]`
3. Agent 对比 `task_items[]` 与 `existing_tasks[]`（`title` + `description` + `taskNo` + `status`）
4. **重合**（工作范围 substantially 相同）→ 加入 `skipped[]`，**不**调 T01
5. **不重合** → 加入 `to_create[]`
6. **不确定**（`uncertain[]` 非空或机侧 `confidence: medium` 且无描述佐证）→ **必须**发 **T-TASK-DEDUP-CLARIFY**（**禁止**默认跳过或默认创建；**禁止**套用父包 `T-REQ-CLARIFY`）
7. 确认单 **T-CREATE-CONFIRM** 须列出：将创建 / 将跳过（含 `taskNo` 与理由）
8. 去重后 `create_count=0` → **T-CREATE-DEDUP-EMPTY-DONE**（**禁止**再发「确认创建」空单）

**适用边界**：需求正文无 CRUD/编号等可拆分结构时，机侧可能产出泛化标题；`_parse.create_count_source: default` 且标题含「推进」→ **必须** **T-TASK-DEDUP-CLARIFY** 请用户确认拆分意图。

**用户输入轨不适用本节。**

### 4.3 批量（`create_count` > 1）

- **有 `task_items[]`**（需求分析轨）：逐条使用分析得到的 `title` / `description`，**不**追加 `（i/n）` 后缀；跳过项不计入创建循环
- **用户输入轨 + 用户指定 `create_count` > 1**：各条 body 相同，仅 `title` 追加后缀 `（{i}/{n}）`，避免重名
- 逐条 T01 + verify；汇总 **T-CREATE-BATCH-DONE**
- 任一条失败：停止后续、汇报已成功条数与人话原因

---

## 5. 交互：确认而非逐项追问

用户输入轨 / 内容提炼轨 / 需求分析轨 **禁止** 默认发问：M10 阶段/类别、计划日期、工时、负责人、需求关键词（当 URL/REQ 已解析）。

**必须** 在 T01 前发 **T-CREATE-CONFIRM**，用户选：1 确认创建 · 2 修改参数 · 3 取消。

用户首句已含 URL + 创建意图时，**跳过** T-OP-TYPE-ASK / T-ROUTER-TASK-HANDOFF 四选一，直进对应轨确认。

---

## 6. 完整轨（备用 · `create_mode: full`）

用户显式说「完整创建」「自定义阶段」「逐步创建」或确认选 2 且选「逐项点选」时，走原 v0.2 流程（`T-SESSION-REUSE-ASK` → R03 点选 → M10 点选 → 标题/日期…）。

---

## 7. CLI 约定

```bash
node "$PACK_ROOT/tools/parse-create-intent.mjs" --text "用户句" [--prepare] [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" prepare-create --text "用户句" [--resolve-only] [--force-track user_input|req_analyze] [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" create-quick --text "用户句" [--force-track …] [--out-dir dir] [--human]
```

> **`create-quick` 纪律（P-364）**：**禁止** Agent 在未发 **T-CREATE-CONFIRM** 且用户选 **1** 前调用；仅用于用户已确认 intent 后的自动化执行。  
> **P-410**：仅需求引用须先 `--resolve-only`；自动轨加 `--force-track req_analyze`；裸 URL 未 force 时 CLI 抛 `NEED_CREATE_MODE`。

```bash
node "$PACK_ROOT/tools/task-api.mjs" create --intent intent.json [--out-dir dir] [--human]
node "$PACK_ROOT/tools/task-api.mjs" apply-dedup --intent intent.json --skip "0,2"
node "$PACK_ROOT/tools/task-api.mjs" apply-dedup --intent intent.json --skipped-json skips.json [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" apply-refine --intent intent.json --title "标题" --description-file desc.txt [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" create --json body.json [--out resp.json] [--human]
```

`intent.json` 结构（Agent 内部 · P-218 禁止外露）：见速查表；`estimatedHours: 1` = **1 人天**。

当日日期：**须** Node `Intl` 或 `parse-create-intent.mjs` 计算，**禁止** Agent 手填过期日期。

---

## 8. 修改记录

| 日期 | 说明 |
|------|------|
| 2026-07-15 | P-410 仅需求双选手动/自动；`--resolve-only` / `--force-track`；去重 0 条 **T-CREATE-DEDUP-EMPTY-DONE** |
| 2026-07-14 | P-380 去重澄清模板更名 **T-TASK-DEDUP-CLARIFY**（与父包 T-REQ-CLARIFY 隔离） |
| 2026-07-13 | v0.9 从 `create-defaults.md` 拆出细则 · golden-case · 去重 T-REQ-CLARIFY 强制（P-315～P-319） |
