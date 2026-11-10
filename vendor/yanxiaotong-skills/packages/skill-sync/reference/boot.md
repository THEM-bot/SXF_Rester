# yanxiaotong-skill-sync · Agent Boot

> 父包路由至 `skill-sync` 后加载本文件。

## PACK_ROOT

```text
PACK_ROOT = packages/skill-sync/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止** 用聚合包根拼 `tools/`。

## Node 命令（相对 PACK_ROOT）

```bash
node "$PACK_ROOT/tools/sync.mjs" parse-skill-ref --text "<plaza链接或skillId>"
node "$PACK_ROOT/tools/sync.mjs" scan --skills-root <path>
node "$PACK_ROOT/tools/sync.mjs" check-all --skills-root <path>
node "$PACK_ROOT/tools/sync.mjs" update --skill-ids 107 --skills-root <path>
node "$PACK_ROOT/tools/sync.mjs" apply-self-pending --skills-root <path>
node "$PACK_ROOT/tools/sync.mjs" install --skill-ref "<url或id>" --skills-root <path>
node "$PACK_ROOT/tools/sync.mjs" install --skill-id 109 --skills-root <path>
node "$PACK_ROOT/scripts/self-check.js"
```

| 子命令 | 用途 |
|--------|------|
| `parse-skill-ref` | 从 plaza 链接 / zip 路径 / 纯数字解析 skillId |
| `scan` | 仅本地 manifest 扫描 |
| `check-all` | 扫描 + 批量 sync-meta 比对（**更新模式**） |
| `update` | 用户确认后原子更新已安装技能（主包仅 prepare pending · P-412） |
| `apply-self-pending` | 落盘主包 pending（推荐用 JSON 内 TEMP `apply_cmd`） |
| `install` | **安装模式**：按 skillId 或 `--skill-ref` 下载并安装 |

## 环境与令牌

- 环境：复用父包 `router/public-env.md` + `tools/env-session.mjs`
- 令牌：复用父包 `tools/token-store.mjs`（§0b 门禁通过后）
- install / update 下载：**均**走 Open API（`X-Open-Api-Token`）

## 必读

| 序 | 文件 |
|----|------|
| 1 | `reference/instructions.md` |
| 2 | `reference/open-api-sync.md` |
| 3 | `reference/ui/response-templates.md` |
| 4 | `reference/error-humanize.md`（失败时） |
