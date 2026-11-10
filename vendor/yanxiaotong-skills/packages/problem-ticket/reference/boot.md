# yanxiaotong-problem-ticket · Agent Boot

> **何时读**：父包 **T-ROUTER-PT-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/problem-ticket/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/problem-ticket-api.mjs`。

## 已选环境（继承父包）

**须读** `router/public-env.md`（SSOT）。**继承** `selected_env`；**禁止**在子包内再问环境。

> **router 读例外**：**仅允许** `public-env.md` 与 **`operation-resolution.md`**（§9 problem-ticket）。

## 父包令牌

`$SKILL_ROOT/tools/token-store.mjs resolve --environment {selected_env.env_label}`

## 最小必读

| 序 | 文件 |
|----|------|
| 1 | `reference/instructions.md` |
| 2 | `reference/create-defaults.md`（`operation: create` 时） |
| 3 | `reference/ui/progress-display.md` |
| 4 | `reference/ui/response-templates.md` |
| 5 | `reference/open-api-contract.md`（API 执行前） |
| 6 | 当前 `reference/phases/*-phase.md` |
| 7 | `reference/error-humanize.md`（失败时） |

## 工具命令

```bash
node "$PACK_ROOT/tools/problem-ticket-api.mjs" metadata [--human] [--out meta.json]
node "$PACK_ROOT/tools/problem-ticket-api.mjs" prepare --json draft.json --out prepared.json [--human]
node "$PACK_ROOT/tools/problem-ticket-api.mjs" create --json prepared.json [--idempotency-key KEY] [--human] [--out resp.json]
node "$PACK_ROOT/tools/problem-ticket-api.mjs" resolve-token-user [--human] [--out user.json]
node "$PACK_ROOT/scripts/verify-problem-ticket-response.cjs" response.json
```

> **创建确认**：未执行 `prepare --human` 并原样贴出含 `【prepare 确认表】` 的输出前，**禁止**向用户展示确认表。

## 会话

- 路径：`~/.yanxiaotong/sessions/{env_slug}/problem-ticket`（**无扩展名**）

## Windows JSON 纪律

- body/resp **须** Write / temp `.mjs` 落盘
- **禁止** PowerShell BOM、`node -e` 内联中文、`>` 重定向
- **须** `--out` 显式路径后再 verify

## operation 路由（P-220 · §9 problem-ticket）

| operation | 关键词 / 条件 | phase |
|-----------|--------------|-------|
| `metadata` | 元数据 / 获取选项 | `metadata-phase.md` |
| `create` | 创建问题单 | `create-phase.md` |

完整映射：**只读** `router/operation-resolution.md` **§9**。
