# 任务操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。  
> **与其它章节冲突时以「执行优先级」为准。**

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "local:ready",
  "operation": "create | detail | list | update | cancel | null"
}
```

## 执行优先级

1. **父包 env + token 已通过**；**继承 selected_env**，**禁止**再问环境。
2. **创建三轨 + 方式双选**（`create-defaults.md` v0.9.2 · P-410）：仅需求引用先 **T-CREATE-MODE-ASK**（手动 / 自动）；**用户输入轨**原样写入、**内容提炼轨**提炼（标题≤40字）、**需求分析轨**（仅自动）拆分 + 去重；**T-CREATE-CONFIRM** 一次确认；CLI：`prepare-create [--resolve-only|--force-track]` / `apply-refine` / `apply-dedup` / `create-quick`（**须先 T-CREATE-CONFIRM**）/ `create --intent`。

### 创建轨判定决策树（P-298 · P-410）

```text
用户句 / prepare-create
  ├─ 仅需求引用（无 NL、无自动口令）→ --resolve-only → T-CREATE-MODE-ASK
  │     ├─ 1 手动 → T-CREATE-MANUAL-INPUT-ASK → 用户补 NL → user_input
  │     └─ 2 自动 → --force-track req_analyze（可能去重）
  ├─ 含「原样创建/不要提炼」→ 用户输入轨
  ├─ 大段输入 / 口令「提炼」/ 文档结构信号 → 内容提炼轨（apply-refine）
  ├─ 「自动创建/分析创建/按需求拆分」→ 需求分析轨
  └─ 其它有明确标题/数量 → 用户输入轨
```

复杂或不确定时：**优先** `prepare-create --text` 看 `track` / `status` 字段，禁止猜测。
3. **跳过菜单**：须满足「禁止跳过菜单」checklist；**禁止**推测 operation。
4. **一次一问**（**完整轨**与查询/改/取消）；用户输入轨 / 需求分析轨 **禁止**默认逐项追问五必填。
5. **进度**：每步 **当前正在…**（`ui/progress-display.md`）。
6. **禁止猜 id**：完整轨 M10/R03/M05 须 **--pick**；`requirementId` 须 R02 校验。
7. **T01 五必填**齐备：`title`、`taskPhase`、`taskCategory`、`requirementId`、计划起止日期。
8. **列表默认 5 条**；多条改/取消须选唯一。
9. **T06 二次确认**（T-CANCEL-CONFIRM）。
10. **T04 白名单**：仅 `title`/`description`；黑名单 **T-BLACKLIST-FIELD**。
11. **工具首选** `task-api.mjs`。
12. **须调工具报成功**：**未**执行 CLI 并得到 JSON **禁止**声称 T01～T06 成功；须 `verify-task-response.cjs`。
13. **400 人话** `error-humanize.md`；**禁止**伪造成功。
14. **long id 字符串**：`requirementId` 等 snowflake **须 string**。
15. **Windows JSON**：Node 写无 BOM 文件；禁止向 `packages/` 写临时脚本。
16. **用户可见中文**：详情/列表/创建交付 **禁止**英文字段名；优先 `--human` · `field-labels.md`。
17. **禁止向用户展示路由 JSON**（P-218）。
18. **去重后 0 条**：**T-CREATE-DEDUP-EMPTY-DONE**；禁止空 **T-CREATE-CONFIRM**。

## 禁止跳过菜单

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 T-FIRST-SCREEN | 首句唯一命中「任务/TASK/迭代任务/创建任务」等 |
| T-ROUTER-TASK-HANDOFF 四选一 | 用户已明确 创建/修改/取消，或 `TASK-`+动词 |
| 首句含需求 URL + **任务标题/内容** | `operation: create` · 可跳过四选一与 MODE，直进确认轨 |
| 首句仅需求 URL/REQ | **必须** **T-CREATE-MODE-ASK**（P-410） |
| 仅说「查询」 | **必须** **T-QUERY-TYPE-ASK** |
| 首句含 `TASK-`+查/详情 | 直进 `detail-phase` |

**P-408 · 菜单纯序号**：handoff / **T-OP-TYPE-ASK** 回复的 `1`～`4` **只**映射 `operation`，**禁止**作 `prepare-create --text`。选「创建」后若无需求 URL/`REQ-` 等 → **T-CREATE-INPUT-ASK**（见 `create-phase.md` 首步）。  
**P-410 · MODE 序号**：`T-CREATE-MODE-ASK` 的 `1`/`2` **只**映射手动/自动，**禁止**作创建 NL。

## 阶段路由

| 操作 | 文件 |
|------|------|
| 创建 | `phases/create-phase.md` + `create-defaults.md` |
| 详情 | `phases/detail-phase.md` |
| 列表 | `phases/list-phase.md` |
| 修改 | `phases/update-phase.md` |
| 取消 | `phases/cancel-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| T01～T06 | `task-api.mjs` create/detail/list/update/cancel |
| 创建准备 / 去重 | `prepare-create` · `apply-dedup` |
| M10 / R03 / M05 / M06 / M08 | `m10` / `requirements` / `m05` / `m06` / `m08` + `--pick` |
| 校验 | `verify-task-response.cjs` |
| token | `$SKILL_ROOT/tools/token-store.mjs` |

## 会话

`~/.yanxiaotong/sessions/{env_slug}/task`；沿用前 **T-SESSION-REUSE-ASK**。
