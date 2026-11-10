# yanxiaotong-task · Agent Boot

> **何时读**：父包 **T-ROUTER-TASK-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/task/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/task-api.mjs`。

## 已选环境（继承父包）

**须读** `router/public-env.md`（SSOT）。**继承** `selected_env`（`tools/env-session.mjs read`）；**禁止**在子包内再问环境。

> **router 读例外**：**仅允许** `public-env.md` 与 **`operation-resolution.md`**（§4 task · P-378）。

## 父包令牌

`$SKILL_ROOT/tools/token-store.mjs resolve --environment {selected_env.env_label}`

## 最小必读

| 序 | 文件 |
|----|------|
| 1 | `reference/instructions.md` |
| 2 | `reference/create-defaults.md`（`operation: create` 时；细则按需 `create-defaults-detail.md`） |
| 3 | `reference/ui/progress-display.md` |
| 4 | `reference/ui/response-templates.md` |
| 5 | `reference/open-api-contract.md`（API 执行前） |
| 6 | 当前 `reference/phases/*-phase.md` |
| 7 | `reference/error-humanize.md`（失败时） |

## 工具命令

```bash
node "$PACK_ROOT/tools/parse-create-intent.mjs" --text "用户句" [--prepare] [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" prepare-create --text "用户句" [--resolve-only] [--force-track user_input|req_analyze] [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" create-quick --text "用户句" [--force-track …] [--human] [--out-dir dir]
node "$PACK_ROOT/tools/task-api.mjs" create --intent intent.json [--human] [--out-dir dir]
node "$PACK_ROOT/tools/task-api.mjs" create --json body.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/task-api.mjs" detail --id TASK-xxx [--human] [--out resp.json]
node "$PACK_ROOT/tools/task-api.mjs" list --json query.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/task-api.mjs" update --id TASK-xxx --json body.json [--human]
node "$PACK_ROOT/tools/task-api.mjs" cancel --id TASK-xxx [--out resp.json]
node "$PACK_ROOT/tools/task-api.mjs" m10 [--pick phase|category --phase 开发阶段]
node "$PACK_ROOT/tools/task-api.mjs" requirements --keyword 登录 [--pick]
node "$PACK_ROOT/tools/task-api.mjs" m05 [--keyword 张三] [--pick]
node "$PACK_ROOT/tools/task-api.mjs" m06 [--pick]
node "$PACK_ROOT/tools/task-api.mjs" m08 [--team-id id] [--pick]
node "$PACK_ROOT/scripts/verify-task-response.cjs" response.json
```

## 会话

- 路径：`~/.yanxiaotong/sessions/{env_slug}/task`（**无扩展名** · **禁止** `task.json`）
- 读写：`task-tools.mjs` · `readSessionFile` / `writeSessionFile`

## Windows JSON 纪律

- **T01/T03/T04**：Node `fs.writeFileSync` 写 `%TEMP%` 下 `body.json` / `query.json`
- **禁止** PowerShell `Set-Content -Encoding UTF8`（BOM）
- **禁止** `$json | node … --json - --out` 三连
- **须** `--out` 显式路径落盘响应后再 verify

`$SKILL_ROOT` = 含 `SKILL.md` 的 `yanxiaotong-skills/` 根。

## operation 路由（P-220 · 本子包 SSOT）

| operation | 关键词 / 条件 | phase |
|-----------|--------------|-------|
| `create` | 创建任务 / TASK URL + 创建 | `create-phase.md` |
| `detail` | TASK- 编号 + 查/详情 | `detail-phase.md` |
| `list` | 查列表 / 有哪些任务 | `list-phase.md` |
| `update` | 改标题/描述 + TASK- | `update-phase.md` |
| `cancel` | 取消 + TASK- | `cancel-phase.md` |

NL 解析：`parse-create-intent.mjs`；父包 `routing-rules.md` §task 为补充说明。
