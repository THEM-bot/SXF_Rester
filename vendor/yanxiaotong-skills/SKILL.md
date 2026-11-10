---
name: yanxiaotong-skills
description: >-
  研效通开放 API 技能聚合：按意图路由至独立子包（Demo 打包上传、原始需求受理、需求池、任务、缺陷、组织待办、问题单、技能包安装与更新等）。
  Use when user mentions 研效通、开放 API、X-Open-Api-Token、Demo 上传、原始需求、需求池、任务、TASK-、缺陷、TD-、组织待办、问题单、PRB-、技能包安装、skill-sync、REQ-。
disable-model-invocation: true
---

# yanxiaotong-skills

> **AGENT: 不要读 README.md**；**禁止读 `doc/`**（人读维护文档）  
> **本包是路由器**：SSOT 在 `router/` + `packages/<子包>/reference/` 内。

## Constraints

| 顶层独立 | 整包复制可运行 · `requires: []` · 显式 `@` · 内部 `packages/` 用 `PACK.md`（见 `router/boot.md`） |

## When to Use

- 研效通开放 API 集成（多业务能力）
- `@yanxiaotong-skills` 后由路由选定**唯一**子包执行
- 用户**仅 @ 未说明意图** → `entry-bootstrap` 的 `mode=first_screen` → **原样贴** `user_visible_text`（见 `router/intent-menu.md`）

## Instructions

1. **新一轮 `@` 必须先跑入口（§0a～§0c）**：`node tools/entry-bootstrap.mjs --text "用户当轮完整首句（含 @ 后全部内容）"`（无 Shell 用 `--print-plan`）。  
   - **Windows 含中文**：Write 落 `%TEMP%/user-text.txt`（UTF-8 无 BOM）→ `--text-file`；**禁止** PowerShell `--text "中文…"`（代码页非 UTF-8 会乱码 · `PLATFORM.md`）。  
   - **§0c**：token 通过后，**@ 后无论有无输入**，均在本命令内执行一次平台技能包扫描更新（当日未跑时）；**禁止**因带了描述/意图而跳过本命令或 §0c（P-411）。  
   - 无 token → `mode=token_ask` · `status: pending_token` → **T-TOKEN-ASK**。  
   - 按 stdout JSON 的 `mode`：`first_screen` → **原样贴** `user_visible_text`（**T-FIRST-SCREEN**；兼容 `first-screen.mjs`）；`handoff` → 若 `user_visible_text` 非空则**原样贴**，再按 `route_hint` handoff。  
   - 平台纪律见根目录 `PLATFORM.md`（P-391）。无环境词 → **默认生产**；UAT / 本地须当轮明确写出。
   - **首屏后仅回序号 / 选能力（同轮续聊）**：**禁止**再跑 `entry-bootstrap`；**须**继承该次 `@` 的 `selected_env`（与各子包「继承 selected_env」对齐 · `router/public-env.md` / `intent-menu.md`）。**禁止**默认成生产再改回。
2. **`package` 已确定后**，**仅**加载 `packages/<子包>/reference/instructions.md`（**禁止**预读其它子包）
3. **`demo` / `original-requirement` / `requirement` / `task` / `defect` / `skill-sync` / `org-todo` / `problem-ticket` + ready**：handoff 话术发出后**同轮必须**加载子包 `boot.md` + `instructions.md`（**禁止**仅输出模板后停止）
4. **`operation` 解析**：见 `router/operation-resolution.md`（P-220）；子包可读该文件（与 `public-env.md` 同为 router 读例外 · P-378）
5. 上传/API 执行前读子包 `open-api-*.md`；失败读 `router/open-api-errors.md` + 子包 `error-humanize.md`
6. Gate：`packages/<子包>/reference/step-completion-gate.md` → `router/step-completion-gate.md`
7. **弱模型必遵（P-394）**：CLI/`user_visible_text` **原样贴**（禁 paraphrase）；用户可见只用 `T-*`；写失败**禁止**自动重试；**禁止**伪造成功
8. **问题单创建硬门禁**：发出确认表前**必须**已跑 `packages/problem-ticket/tools/problem-ticket-api.mjs prepare --human`，并**原样贴**含 `【prepare 确认表】` 的 stdout。  
   - 描述 = 对用户问题的**完整业务概况**（禁止 `...` /「全文约 N 行」截断式）  
   - 二线默认 = **令牌用户**（禁止手填环境默认二线如杨红卫）  
   - **禁止**手搓确认表；未跑 prepare 不得向用户展示创建确认

**禁止**：`Layer complete` / `Next available` / `router/` 文件清单式收尾（见 `router/boot.md` §执行优先级 7）。

## Step Completion Gate

见 `router/step-completion-gate.md`
