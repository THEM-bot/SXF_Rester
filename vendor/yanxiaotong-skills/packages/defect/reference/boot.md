# yanxiaotong-defect · Agent Boot

> **何时读**：父包 **T-ROUTER-DEFECT-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/defect/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/defect-api.mjs`。

## 已选环境（继承父包）

**须读** `router/public-env.md`（SSOT）。**继承** `selected_env`；**禁止**在子包内再问环境。

> **router 读例外**：**仅允许** `public-env.md` 与 **`operation-resolution.md`**（§5 defect · P-378）。

## 父包令牌

`$SKILL_ROOT/tools/token-store.mjs resolve --environment {selected_env.env_label}`

## 最小必读

| 序 | 文件 |
|----|------|
| 1 | `reference/instructions.md` |
| 2 | `reference/intent-routing.md`（NL 优先） |
| 3 | `reference/create-defaults.md`（`operation: create` 时） |
| 4 | `reference/ui/progress-display.md` |
| 5 | `reference/ui/response-templates.md` |
| 6 | `reference/open-api-contract.md`（API 执行前） |
| 7 | 当前 `reference/phases/*-phase.md` |
| 8 | `reference/error-humanize.md`（失败时） |

## 工具命令

```bash
node "$PACK_ROOT/tools/parse-intent.mjs" --text-file "%TEMP%/user-text.txt" [--prepare] [--out intent.json]
node "$PACK_ROOT/tools/defect-api.mjs" prepare --text-file "%TEMP%/user-text.txt" [--out intent.json]
node "$PACK_ROOT/tools/defect-api.mjs" execute --intent intent.json [--human] [--out-dir dir]
node "$PACK_ROOT/tools/defect-api.mjs" create --json body.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/defect-api.mjs" detail --id TD-xxx [--human] [--out resp.json]
node "$PACK_ROOT/tools/defect-api.mjs" list --json query.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/defect-api.mjs" update --id TD-xxx --json body.json [--human]
node "$PACK_ROOT/tools/defect-api.mjs" status --id TD-xxx --json body.json [--human]
node "$PACK_ROOT/tools/defect-api.mjs" close --id TD-xxx --json body.json [--human]
node "$PACK_ROOT/tools/defect-api.mjs" m11 [--pick status|severity|closeType|defectType]
node "$PACK_ROOT/tools/defect-api.mjs" requirements --keyword 登录 [--pick]
node "$PACK_ROOT/scripts/verify-defect-response.cjs" response.json
```

## 会话

- 路径：`~/.yanxiaotong/sessions/{env_slug}/defect`（**无扩展名**）
- 读写：`defect-tools.mjs` session 函数

## Windows JSON 纪律

- Node `fs.writeFileSync` 写 `%TEMP%` 下 `body.json` / `query.json`
- **禁止** PowerShell BOM · **禁止**管道 `--out` 三连
- **含中文原文**：Write 落 `%TEMP%/user-text.txt`（UTF-8 无 BOM）→ `prepare` / `parse-intent --text-file`；**禁止** PowerShell `--text "中文…"`

## operation 路由（P-220 · 本子包 SSOT）

| operation | 关键词 / 条件 | phase |
|-----------|--------------|-------|
| `create` | 创建缺陷 / 提BUG / 需求URL+缺陷 | `create-phase.md` |
| `detail` | TD- 编号 + 查/详情 | `detail-phase.md` |
| `list` | 查缺陷列表 / 查需求下缺陷 | `list-phase.md` |
| `update` | 改标题/严重性 + TD- | `update-phase.md` |
| `status` | 状态改为 + TD- | `status-phase.md` |
| `close` | 关闭/解决关闭 + TD- | `close-phase.md` |

NL 解析：`parse-intent.mjs`；**禁止**裸词「列表」触发 list（须含查/有哪些）。
