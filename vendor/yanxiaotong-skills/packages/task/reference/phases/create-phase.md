# create-phase · 创建任务（T01）

> 契约：`open-api-contract.md` §T01 · 默认：`create-defaults.md`（细则按需 `create-defaults-detail.md`）· 进度：`ui/progress-display.md`

## 进入条件

- `operation: create`
- 五必填齐备前 **禁止** T01

## 首步（P-360 · 强制 · v0.9.2 · P-410）

> **菜单纯序号 ≠ 创建内容**（P-408）：handoff / **T-OP-TYPE-ASK** 回复的 `1`～`4` **禁止**作为 `prepare-create --text`。  
> **创建方式序号 ≠ 创建内容**（P-410）：**T-CREATE-MODE-ASK** 的 `1`/`2` **禁止**作为 `prepare-create --text`。

1. 看当轮用户句：
   - **仅** `^[1-4]$`（菜单选「创建」等）→ **禁止** `prepare-create` → 发 **T-CREATE-INPUT-ASK** → 停手
   - 无可解析所属需求（无需求 URL / `REQ-` /「沿用需求」/ 上下文 id；CLI：`hasCreatableRequirementRef`）→ 同上，发 **T-CREATE-INPUT-ASK**（**禁止**先跑 prepare 再甩「未解析到所属需求」）
   - **仅需求引用**（CLI：`isRequirementRefOnly`；无任务 NL、无「自动创建」口令）→ **当前正在**校验所属需求 → `prepare-create --text "…" --resolve-only` → 发 **T-CREATE-MODE-ASK** → **停手**（**禁止**立刻 `req_analyze`）
   - 「完整创建」等 → 走 §完整轨（可跳过本条 prepare）
2. 已有实质创建句（含任务标题/内容，或 MODE 已选定后的强制轨）→ **当前正在解析创建轨…** → `prepare-create --text "用户句" [--force-track …] --out intent.json`
3. 内部记录 `track`；**禁止**在未执行 `prepare-create` 前猜测轨（上列 ASK 停手除外）

### 创建方式双选（P-410）

| 用户在 T-CREATE-MODE-ASK | 下一步 |
|--------------------------|--------|
| **1** 手动创建 | 发 **T-CREATE-MANUAL-INPUT-ASK** → 停手；用户补标题/内容后 `prepare-create`（可不加 force；有 NL 即 `user_input`） |
| **2** 自动创建 | `prepare-create --text "{已锁定需求句}" --force-track req_analyze` → §需求分析轨 |

**可跳过双选**：

| 条件 | 动作 |
|------|------|
| 同句已含任务标题/内容 | 直进 `user_input` / `content_refine` |
| 同句含「自动创建 / 分析创建 / 按需求拆分」等 | `--force-track` 可省略；CLI 走 `req_analyze` |

## 模式分流（v0.9.2）

| 模式 | 触发 | 文档 |
|------|------|------|
| **待选方式** `pending_create_mode` | 仅需求引用 | **T-CREATE-MODE-ASK**（本文件 §创建方式双选） |
| **用户输入轨** `user_input` | 有任务内容 NL / 关键词 / `任务内容如下` 块 / MODE 选手动 | `create-defaults.md` §4.1 |
| **内容提炼轨** `content_refine` | 大段输入 / 文档结构 / 口令「提炼」 | `create-defaults.md` §4.1.5 |
| **需求分析轨** `req_analyze` | MODE 选自动 / 自动创建口令 | `create-defaults.md` §4.2 |
| **完整轨** `full` | 「完整创建」「自定义阶段」「逐步创建」 | 下文 §完整轨 |

各轨共用 §2 静默默认（阶段/类别/日期/工时/负责人），**非**「快捷模式」。

---

## 用户输入轨（§4.1）

1. 读 `create-defaults.md`；`prepare-create` 解析 URL/REQ/NL
2. **当前正在**校验所属需求 → R02（`prepare-create` 内含）
3. `title` / `description` **原样**使用用户解析结果；`create_count` **默认 1**（仅用户显式 `创建{n}个` 可 >1）
4. **禁止**需求分析、`generateTaskDescription`、与已有任务去重
5. 发 **T-CREATE-CONFIRM**（一次展示全部字段）
6. 用户选 **1** → 复述环境 → **当前正在**创建
7. `task-api.mjs create --intent` → `verify-task-response.cjs` → **T-CREATE-DONE** / **T-CREATE-BATCH-DONE**

### 用户输入轨禁止

- 默认 M10/日期/工时/负责人逐项问
- 编号列表自动拆多条（除非用户指定数量）
- 拼接需求概述到描述

---

## 内容提炼轨（§4.1.5 · v0.8）

1. `prepare-create` → `track: content_refine` · `source_content` · `refine_status: pending_agent`
2. **Agent** 读 `create-defaults.md` §4.1.5 → 提炼 `title`（**≤40 字**）+ 结构化 `description`
3. `task-api.mjs apply-refine --intent … --title … --description …`
4. 发 **T-CREATE-CONFIRM**（标注「内容提炼」）
5. 用户选 **1** → `create --intent` → verify → **T-CREATE-DONE**

### 内容提炼轨禁止

- 调用 `analyzeRequirementForTasks` 或与已有任务去重
- 标题超过 40 字
- 描述整段粘贴原文/HTML

---

## 需求分析轨（§4.2）

1. `prepare-create --force-track req_analyze`（或句含自动创建口令）→ `analyzeRequirementForTasks` → `task_items[]`
2. T03 拉需求下**全部**已有任务 → `dedup` 上下文（含机侧预筛 · P-281/P-316）
3. **Agent 仅处理** `dedup.uncertain[]`（或机侧 `confidence: medium` 且无描述佐证项）；**禁止**覆盖机侧已自动 `skipped[]` 项
4. 产出 `skipped-json`：`[{ "proposed_index": 0, "reason": "与 TASK-xxx 重合" }]` → `apply-dedup --skipped-json …`
5. `task-api.mjs apply-dedup --intent … --skipped-json …`（或 `--skip "0,2"`）
6. 若去重后 `create_count=0` / `task_items=[]` → 发 **T-CREATE-DEDUP-EMPTY-DONE**（**禁止**空 **T-CREATE-CONFIRM**）→ 停手
7. 否则发 **T-CREATE-CONFIRM**（含将创建 / 将跳过列表）
8. 用户确认 → 逐条 T01（仅 `to_create`）

**T-CREATE-DEDUP-EMPTY-DONE** 选项：1 → **T-CREATE-MANUAL-INPUT-ASK**；2 → 忽略去重按原分析项创建；3 → 结束。

---

## 确认后修改（选 2）

发 **T-CREATE-EDIT-MENU**（兼容 **T-CREATE-QUICK-EDIT-MENU**）→ 改单项后回到 **T-CREATE-CONFIRM**。

---

## 完整轨（备用 · v0.2）

1. 有会话 → **T-SESSION-REUSE-ASK**；选 1 带入 `last_create_defaults`
2. **当前正在**搜所属需求 → `requirements --keyword {词} --pick` → 点选 `requirementId`（R03）
3. **当前正在**拉 M10 阶段 → **T-M10-PHASE-PICK**
4. **当前正在**拉 M10 类别 → **T-M10-CATEGORY-PICK**（联动 `phaseCategoryMap`）
5. **T-TASK-TITLE-ASK** → **T-TASK-DATE-ASK**（起止日期）
6. 可选：描述 / 负责人（**T-ASSIGNEE-ASK** → `m05 --pick`）/ 工时
7. **提交前复述环境**：当前环境：{env_label}；base_url：`{base_url}`
8. **当前正在**创建 → `task-api.mjs create --json body.json --out resp.json`
9. **verify-task-response.cjs** → **T-CREATE-DONE** → 写 session

## 禁止（各轨通用）

手填 id；未选/未校验需求进 T01；传 status；未调 CLI 报成功；把 OP/MODE 菜单序号当创建 NL；仅 URL 时跳过 **T-CREATE-MODE-ASK** 直进分析。
