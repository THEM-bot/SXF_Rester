# 无意图首屏菜单（Agent SSOT）

> **何时查阅**：用户**仅** `@yanxiaotong-skills`（或等价启动），**未说明**要做哪类业务。  
> **话术 SSOT**：`router/response-templates.md` · **T-FIRST-SCREEN** / **T-ENV-SWITCH**（须原文套用）。

## 强制行为

1. **首条回复**（须先完成 `entry-bootstrap` · 含 §0a + §0b + §0c）：
   - **§0a**：`resolveEntryEnv`（有环境词 → 指定；否则 **默认生产**（Q25））；**禁止**沿用 `selected-env.json`；路由卡含 `selected_env` + `env_source`。
   - **当轮已解析 env、无 token** → `mode=token_ask` → **T-TOKEN-ASK** 或 **T-TOKEN-MISS-STOP**；路由卡 `status: pending_token`；**禁止**首屏与业务收参。
   - **env 已解析 + token 已通过 + 无意图** → `mode=first_screen` → **原样贴** `user_visible_text`（**T-FIRST-SCREEN** · P-273）；同时**内部**维护 **无意图路由卡**（`status: pending_intent`，含 `selected_env`）用于推理，**禁止**作为 `json` 代码块出现在用户可见回复中（P-218）。
2. **禁止向用户展示路由/调试 JSON**（P-218）：本文件所有 `json` 路由卡示例**仅**为 Agent 内部结构示例，用户可见回复**只**输出 T-FIRST-SCREEN 等固定话术，**不得**附带路由卡 JSON、`operation`、`selected_env` 等字段块。
3. **禁止**在用户选择意图前加载任何 `packages/*/reference/instructions.md`。
4. 用户回复**序号**或自然语言后 → 按下方表路由；**环境与入口（与 requirement / OR / task 等子包「继承 selected_env」同规）**：
   - 本条发生在 **T-FIRST-SCREEN 已发出之后** → **禁止**再跑 `entry-bootstrap` / `resolveEntryEnv`（会把无环境词的 `7`/`2` 等写成默认生产）。
   - **须**沿用该次 `@` 首屏已写入的 `selected_env`；handoff 话术中的 `{env_label}` / `{base_url}` 取自该快照。
   - **禁止**先默认生产再改回用户环境，或向用户解释「入口默认成了生产」。
5. 用户**新一轮 `@` 首句**已明确意图（如「demo 打包上传」）→ 须满足 `routing-rules.md`「禁止跳过菜单」checklist 后方可 `mode=handoff`（**仍须**先跑 `entry-bootstrap`；§0c **无论 @ 后有无输入均已执行**；若 `user_visible_text` 非空先原样贴 · P-411）。

## 序号 → 子包

| 用户选择 | package | status | Agent 下一步 |
|----------|---------|--------|--------------|
| **1** / Demo / 打包 / 上传 / D03 / D04 | `demo` | `ready` | **同轮**加载 `packages/demo/reference/boot.md` + `instructions.md` → 发 **T-ROUTER-DEMO-HANDOFF**（或子包 T-QUICK-START-ACK）→ 收项目路径 · **禁止** router 总结后停止 |
| **2** / 原始需求 / OR / 需求受理 | `original-requirement` | **ready** | 若 `selected_env.original_requirement_api !== ready` → 如实告知并请换环境；否则 **同轮**加载 `packages/original-requirement/reference/boot.md` + `instructions.md` → 发 **T-ROUTER-OR-HANDOFF** → 收操作类型 |
| **3** / 需求 / 需求池 / REQ- / 池内需求 / 需求池 URL | `requirement` | **local:ready**（可执行 · 与 `ready` 等价，见 routing-rules §status）或 blocked | 若 `selected_env.requirement_api !== ready` → 如实告知并请换 `requirement_api: ready` 的环境；否则 **同轮**加载子包 → **T-ROUTER-REQ-HANDOFF** → 收操作类型。**「需求」不含「原始」即进本包**（「读取需求详情」直通；「原始需求」走选 2） |
| **4** / 任务 / TASK / 迭代任务 | `task` | **local:ready**（同上）或 blocked | 若 `selected_env.task_api !== ready` → 如实告知并请换环境；否则 **同轮**加载子包 → **T-ROUTER-TASK-HANDOFF** → 收操作类型 |
| **5** / 缺陷 / TD- / BUG / 迭代缺陷 | `defect` | **local:ready**（同上）或 blocked | 若 `selected_env.defect_api !== ready` → 如实告知并请换环境；否则 **同轮**加载子包 → **T-ROUTER-DEFECT-HANDOFF** 或 NL 直通 |
| **6** / 技能 / 技能包 / 技能包安装 / 技能包更新 / 安装技能 / 更新技能 / 技能同步 / skill-sync | `skill-sync` | **ready** | **同轮**加载子包 → **T-ROUTER-SYNC-HANDOFF** → 按 `operation` 安装或更新（见 `routing-rules.md` §skill-sync）。**意图前缀含「技能」即可**，不必须说「技能包」 |
| **7** / 组织待办 / OT- / 组织级待办 | `org-todo` | **local:ready**（同上）或 blocked | 若 `selected_env.org_todo_api !== ready` → 如实告知并请换环境；否则 **同轮**加载子包 → **T-ROUTER-OT-HANDOFF** → 收操作类型 |
| **8** / 问题单 / PRB- / 创建问题单 / 问题单元数据 | `problem-ticket` | **local:ready**（同上）或 blocked | 若 `selected_env.problem_ticket_api !== ready` → 如实告知并请换环境；否则 **同轮**加载子包 → **T-ROUTER-PT-HANDOFF** → 收操作类型 |
| 其它 / 含糊 | — | `pending_intent` | 重跑 `first-screen.mjs`（**T-FIRST-SCREEN**）或 **T-REQ-CLARIFY** |

## 无意图路由卡（**Agent 内部结构** · 禁止外露 · P-218）

> 以下 JSON **仅**供 Agent 内部推理/自检，**禁止**出现在用户可见回复中。  
> `selected_env.base_url` **只读**当轮 `selected_env`（来源 `tools/lib/env-registry.json`），**禁止**手写 host。

```json
{
  "skill": "yanxiaotong-skills",
  "package": null,
  "sub_skill": null,
  "status": "pending_intent",
  "selected_env": {
    "env_slug": "prod",
    "env_label": "生产",
    "base_url": "{selected_env.base_url}"
  },
  "natural_summary": "已展示固定首屏菜单，等待用户选择"
}
```

## 用户选 3 后路由卡示例

选 3（需求池 · local:ready）：

```json
{
  "skill": "yanxiaotong-skills",
  "package": "requirement",
  "sub_skill": "yanxiaotong-requirement",
  "status": "local:ready",
  "auth_track": "open-api",
  "selected_env": {
    "env_slug": "prod",
    "env_label": "生产",
    "base_url": "{selected_env.base_url}",
    "requirement_api": "ready"
  },
  "operation": "create | detail | list | update | cancel | null",
  "natural_summary": "用户选择需求池操作"
}
```
