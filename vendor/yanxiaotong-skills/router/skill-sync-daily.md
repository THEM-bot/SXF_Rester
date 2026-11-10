# 每日首用 skill-sync 比对与更新 · 父包公共

> **SSOT 代码**：`tools/entry-bootstrap.mjs`（**@ 后无论有无输入均触发** · P-411）+ `packages/skill-sync/tools/sync.mjs daily-auto`（P-271 · P-273）  
> **存储风格**：对齐 `router/token-store.md`，按环境分文件。

## 磁盘路径

```text
~/.yanxiaotong/sessions/skill-sync-daily/local.json
~/.yanxiaotong/sessions/skill-sync-daily/uat.json
~/.yanxiaotong/sessions/skill-sync-daily/prod.json
```

## CLI

```bash
# 唯一推荐入口（§0a/0b + §0c；无意图时 user_visible_text=完整首屏）
node "$SKILL_ROOT/tools/entry-bootstrap.mjs" --text "用户当轮完整首句"

# 兼容：仅首屏（也会自行 §0c）
node "$SKILL_ROOT/tools/first-screen.mjs" --text "用户当轮首句"

# 仅 daily 逻辑（调试）
node "$PACK_ROOT/tools/sync.mjs" daily-auto --environment {env_label}
```

### 展示分级（P-273）

| 条件 | `displayMode` | 用户可见 |
| --- | --- | --- |
| 全成功、无异常跳过 | `compact` | 一行汇总 |
| 有失败 / 检测中 / 接口异常等 | `detail` | 完整结果表 |

`daily-auto` JSON 含 `stats`、`dailyBlock`、`displayMode`。

## Agent 纪律（§0c · P-411）

1. **必须**先跑 `entry-bootstrap.mjs --text`（完整首句）。
2. **§0c 与意图无关**：token 通过且当日未比对 → 本命令内执行 `daily-auto`；**禁止**因 `@` 后带了描述/内容而跳过。
3. **展示**：按 `mode` 原样贴 `user_visible_text`（`first_screen` = 同步块+菜单；`handoff` = 仅同步横幅，可为空）。
4. **手动** skill-sync（菜单 6）走正常确认流程。

## 主包自更新两阶段（P-412 · **强制**）

> **为何**：`yanxiaotong-skills` 自替换时，持锁进程内 `rename` 安装根目录在 Windows 上易 `EPERM`/`EBUSY`；且换盘后同轮继续业务会跑旧指令。

| 阶段 | 谁做 | 行为 |
| --- | --- | --- |
| **A · prepare** | `daily-auto` / `update`（持锁） | 非主包照常 `atomicReplace`；主包只下载校验 → 写入 `{skillsRoot}/.yanxiaotong-self-update-pending.json` + staging；**禁止**本进程对主包根目录 rename |
| **B · apply** | Agent 新进程跑 `self_update_apply_cmd`（TEMP · **就地覆盖 P-414**，禁止对安装根 `rename`） | 逐文件覆盖 → registry → 清 pending；JSON `self_update: true` |

### Agent 同轮顺序

1. `entry-bootstrap` / `update` 退出后读 JSON。
2. 若 `self_update_pending === true` → **立刻**执行 `self_update_apply_cmd`（**禁止**先贴菜单/handoff；**禁止**跳过）。
3. apply exit 0 且成功 JSON → 发 **T-SYNC-SELF-UPDATE**（成功话术，**非**失败）；**本轮停止业务**，请用户重新 `@yanxiaotong-skills`。
4. apply 失败 → 按 skill-sync **T-SYNC-UPDATE-FAIL**；**禁止**声称主包已更新。
5. 残留 pending（上次崩溃）：`entry-bootstrap` 仍输出 `self_update_pending` + `self_update_apply_cmd` → 同规则先 apply。

### CLI

```bash
# 调试：仅落盘 pending（须在无占用主包的进程中执行；推荐用 JSON 内 apply_cmd）
node "$PACK_ROOT/tools/sync.mjs" apply-self-pending --skills-root <path>
```

## 与 token 门禁关系

- 须在 **§0b token 已通过** 之后执行 §0c。
- 无 token → `entry-bootstrap` exit 2 · `mode=token_ask` → **T-TOKEN-ASK**。
