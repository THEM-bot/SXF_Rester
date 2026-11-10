# 研效通 skills · 路由 Boot

> **何时查阅**：`@yanxiaotong-skills` 后**首先**加载本文件（位于 `router/`，**非**业务 `reference/`）。

## 目录职责

| 目录 | 职责 |
|------|------|
| `router/` | **仅此**：父包路由、Boot、共享约定 |
| `packages/*/` | **业务子包**：各自 `reference/`、`tools/`、`scripts/` |
| `scripts/` | **仅此**：聚合包机检（验证 router + 子包结构） |

## 原则

- **高内聚**：curl、出包、契约只在 `packages/<子包>/` 内
- **内部模块**：`packages/*/` 为聚合包内业务模块，**非**顶层八大技能；须通过 `@yanxiaotong-skills` 路由进入
- **单包展开**：路由后只读**一个**子包

## 执行优先级（聚合层 · ≤15 条绝对规则 · P-395）

> **边界**：下列铁律 **优先于**子包 `instructions.md`。细节下沉 `public-env` / `operation-resolution` / 子包 phase。

1. **环境**：仅对**新一轮 `@` 首句**跑 `entry-bootstrap` / `resolveEntryEnv`；有环境词 → write；无环境词 → **默认生产**（Q25）。**禁止**用 `selected-env.json` 沿用**上一轮 `@`** 的 UAT/本地。路由卡含 `selected_env` + `env_source`。**禁止**每轮 **T-ENV-ASK**。**首屏后仅回序号** → **继承**当轮已解析 env，**禁止**再 bootstrap（详见 `public-env.md` §父包入口第 6 点；与各子包「继承 selected_env」对齐）。
2. **Token**：无 token → **T-TOKEN-ASK** / **T-TOKEN-MISS-STOP**；`pending_token` 时禁止菜单与业务收参。
3. **§0c + 入口**：token 通过后 **§0c 必跑**（`entry-bootstrap` · **@ 后无论有无输入** · P-411）；按 `mode` 原样贴 `user_visible_text`（`first_screen` / `handoff`）；禁止手工拼菜单；禁止因有描述/意图跳过入口。**不适用于**首屏后的纯序号续聊。
3b. **主包自更新（P-412）**：若 JSON `self_update_pending===true` → **同轮立刻**执行 `self_update_apply_cmd`（TEMP 独立脚本 · **须在 entry-bootstrap 进程退出后**）；apply 成功且 `self_update` → 发 **T-SYNC-SELF-UPDATE**，**本轮停止业务**（禁止贴菜单/handoff）；未 apply 成功 **禁止**声称主包已更新。详见 `router/skill-sync-daily.md`。
4. **单包**：路由后只展开**一个**子包；禁止混读。
5. **同轮进子包**：ready / local:ready handoff 后**同轮**加载子包 `boot.md` + `instructions.md`；禁止停在 router。
6. **operation**：SSOT = `operation-resolution.md`；仅「查询」→ `null` + **T-QUERY-TYPE-ASK**。
7. **多意图**：同句多包 → **T-MULTI-INTENT-SPLIT**（含「原始需求」· 对齐首屏）。
8. **能力边界**：OR 无受理/关联/不采纳；勿伪造未开放成功。
9. **唯一入口**：禁止直连子包 `@` → **T-SUBPKG-REDIRECT**。
10. **API 非 ready**：对应 `*_api` 非 ready → 如实告知，禁止伪造成功。
11. **原样贴 CLI / first-screen**；禁止 paraphrase（P-297）。
12. **禁止外露路由 JSON**（P-218）。
13. **写失败不自动重试**；读 5xx/超时可有限重试 → **T-API-UNREACHABLE**。
14. **Windows**：禁 `cd && node`；见根 `PLATFORM.md` / 下文 Shell 表。
15. **禁止目录导览收尾**；skill-sync **无** `phases/`（结构例外）。

> Demo 上传契约、M01 跨子包约束等 → 按需读 `open-api-common.md` / 子包 quickref（不再挤占铁律条数）。

## Demo 标准全流程（路由至 `demo` 时）

```text
检查 → 修复（须用户确认）→ 重打 zip → 问是否上传 → 问 D03/D04 → 收参（可沿用本地会话）→ 上传 → accessUrl
```

出包阶段须**每步**先发 **`当前正在…`** 再执行（`packages/demo/reference/ui/progress-display.md`）；改代码前须确认。

快捷话术见子包 `PACK.md`「快捷话术」或 `packages/demo/快速入门.md`。

## Demo 子包 PACK_ROOT（工具路径）

路由至 `demo` 后 **须加载** `packages/demo/reference/boot.md`（**子包 SSOT**）。父包仅提醒：`PACK_ROOT` = `packages/demo/`，**禁止**用聚合根 `yanxiaotong-skills/` 拼 `tools/`。

## 顶层独立（八大技能契约）

| 约束 | 要求 |
|------|------|
| **顶层可独立** | 复制整个 `yanxiaotong-skills/` 到 `{Agent根}/skills/` 即可运行；`requires: []` |
| **显式 `@`** | `disable-model-invocation: true`；仅用户 `@yanxiaotong-skills` 启动 |
| **内部模块** | `packages/*/` 为包内模块；入口用 `PACK.md`（避免平台误识别为多个 skill） |

父包聚合层使用 `packages/<子包>/`、`router/`；子包执行时**禁止**预读其它 `packages/` 或无关 `router/` 文件（**例外**：`public-env.md` + **`operation-resolution.md`**，见各子包 boot · P-378）。业务 SSOT 仅 `router/` + `packages/*/reference/`。平台纪律另见根 `PLATFORM.md`。

## 最小必读索引（P-284 · 按场景）

> **禁止**一次性 Read 下列全部文件；按 `package` + `operation` 只加载对应行。

| 场景 | 必读（顺序） |
|------|-------------|
| 仅 `@` 无意图 | `entry-bootstrap` → `mode=first_screen` → 原样贴 `user_visible_text` |
| 已路由至子包 | `packages/<子包>/reference/boot.md` → `instructions.md` → 当前 `phases/*-phase.md` |
| `operation: create` | 上表 + 子包 `create-defaults.md`（细则按需 `create-defaults-detail.md`）+ `ui/response-templates.md` |
| API 执行前 | 子包 `open-api-contract.md`（demo 先 `upload/open-api-upload-quickref.md`，细则按需 `open-api-upload.md`） |
| 失败时 | 子包 `error-humanize.md` |

## 流程（按场景 · 非全读清单 · P-321）

> 细节见上文「最小必读索引」；**禁止**把下列分支理解为须 Read 全部文件。

```text
@yanxiaotong-skills
  → §0a 环境（entry-bootstrap）
  → §0b token（未就绪 → T-TOKEN-ASK · 不加载子包）
  → §0c daily（entry-bootstrap 内 · @ 后无论有无输入 · P-411）
  → self_update_pending？ 同轮跑 self_update_apply_cmd（P-412）→ 成功则 T-SYNC-SELF-UPDATE 并停本轮
  → mode=first_screen？ 原样贴 user_visible_text
  → mode=handoff？ 原样贴 user_visible_text（若有）→ routing-rules → 唯一子包 boot → instructions → 当前 phase
  → 子包 gate + router gate
```

## 子包 status

| status | Agent 动作 |
|--------|------------|
| `pending_token` | token 未就绪；**T-TOKEN-ASK** 或 **T-TOKEN-MISS-STOP**；**不**加载子包 |
| `pending_intent` | 环境已解析 + token 已通过；展示 `intent-menu`；**不**加载子包 |
| `ready` / `local:ready` | 按子包完整执行（语义对照见 `routing-rules.md` §status · P-389） |
| `skill-sync` → `ready` | 同 `ready`；加载 `packages/skill-sync/` |
| `planned` | 告知待开放；**不**伪造成功 |

## 禁止

- 未路由就加载多个子包
- **Agent 读 `doc/`**（人读维护；业务 SSOT 仅 `router/` + `packages/*/reference/`）
- 引用仓库外文档
- 子包执行中预读 `router/` 或其它 `packages/`（路由后应只读当前子包）
- **目录导览式收尾**（`Layer complete`、`Next available`、`router/` 文件清单总结等）
- 仅 `@` 未说明意图时：用 Read 扫 `router/` 代替 **T-FIRST-SCREEN**（须跑 `first-screen.mjs`）
- 已路由至 `demo`（`ready`）却未进入子包收项目路径 / 出包
- **每轮** `@` 先发 **T-ENV-ASK** 阻塞首屏（Q22 废止 Q20）
- **向用户展示路由/调试 JSON**（P-218）：路由卡（`skill`/`package`/`status`/`operation`/`selected_env` 等）**仅**用于 Agent 内部推理；用户可见回复**只**输出固定话术模板，**禁止**附带 `json` 路由卡代码块

## Windows Shell（P-205 · **强制**）

| Shell | 允许 | **禁止** |
| --- | --- | --- |
| **PowerShell 5.1+** | `Set-Location '…'; node tools/entry-bootstrap.mjs --text "…"` | `cd … && node …`（`&&` 非法 · `InvalidEndOfLine`） |
| **任意** | `node "绝对路径\tools\entry-bootstrap.mjs" --text "…"`（无需 cd） | `write` + `read` + `resolve` 三连（`resolve` 已 write） |

入口**一条**（推荐）：

```powershell
node "$SKILL_ROOT/tools/entry-bootstrap.mjs" --text "@yanxiaotong-skills"
```

`token_ready: false` 时 exit 2 → **T-TOKEN-ASK**；**禁止**为补救再链式拼多条 `node`。

---

## 维护编号速查（Agent 用 · P-330 · ≤20 条）

| 编号 | 含义 |
|------|------|
| **P-205** | Windows 禁止 `cd && node`；用 `entry-bootstrap` 或绝对路径 |
| **P-218** | 路由卡 JSON **仅内部**；用户只见 `T-*` 话术 |
| **P-220** | `operation` 写入时机 → `router/operation-resolution.md` |
| **P-271** | §0c 每日 skill-sync（`daily-auto`） |
| **P-273** | 无意图首屏一条消息 **T-FIRST-SCREEN**（废止拆分 daily+菜单） |
| **P-411** | §0c 合入 `entry-bootstrap`：@ 后无论有无输入均扫描更新；用 `mode`/`user_visible_text` |
| **P-412** | 主包自更新两阶段：持锁进程只 prepare pending；独立 TEMP 进程 apply；成功后 T-SYNC-SELF-UPDATE 停业务 |
| **P-414** | 主包落盘就地覆盖：禁止对安装根 rename，避免 Cursor 占用 EBUSY |
| **P-284** | 禁止一次性 Read 全部 reference；按场景索引 |
| **P-297** | CLI stdout **原样贴**；禁止 paraphrase |
| **Q1** | 环境 API 非 ready 时禁止伪造业务成功 |
| **Q15** | 禁止直连子包 `@`；须 `@yanxiaotong-skills` |
| **Q22** | 废止每轮 **T-ENV-ASK**；首句解析环境 |
| **Q25** | 默认环境 **生产**（`DEFAULT_ENV_SLUG=prod`） |
