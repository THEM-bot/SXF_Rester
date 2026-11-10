# yanxiaotong-org-todo · Agent Boot

> **何时读**：父包 **T-ROUTER-OT-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/org-todo/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/org-todo-api.mjs`。

## 已选环境（继承父包）

**须读** `router/public-env.md`（SSOT）。**继承** `selected_env`；**禁止**在子包内再问环境。

> **router 读例外**：**仅允许** `public-env.md` 与 **`operation-resolution.md`**（§8 org-todo）。

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
node "$PACK_ROOT/tools/org-todo-api.mjs" create --json body.json [--progress-file p.txt] [--human] [--out resp.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" write-json-body --json meta.json --description-file desc.txt --out body.json
node "$PACK_ROOT/tools/org-todo-api.mjs" detail --id OT-xxx [--human] [--out resp.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" list --json query.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" append-progress --id OT-xxx --text "进展" [--human] [--out resp.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" update --id OT-xxx --json body.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" m01 --pick --out picks.json
node "$PACK_ROOT/tools/org-todo-api.mjs" m02 --businessDomainId {id} --pick --out picks.json
node "$PACK_ROOT/tools/org-todo-api.mjs" m05 [--keyword 张三] [--pick --out picks.json]
node "$PACK_ROOT/tools/org-todo-api.mjs" resolve-token-user [--human] [--out user.json]
node "$PACK_ROOT/scripts/verify-org-todo-response.cjs" response.json
```

## 会话

- 路径：`~/.yanxiaotong/sessions/{env_slug}/org-todo`（**无扩展名**）

## Windows JSON 纪律

- body/resp **须** `Write` / `write-json-body` / temp `.mjs` 落盘
- **禁止** PowerShell BOM、`node -e` 内联中文、`>` 重定向
- **须** `--out` 显式路径后再 verify

## operation 路由（P-220 · §8 org-todo）

| operation | 关键词 / 条件 | phase |
|-----------|--------------|-------|
| `create` | 创建组织待办 | `create-phase.md` |
| `detail` | OT- + 查/详情 | `detail-phase.md` |
| `list` | 列/查 + 筛选 | `list-phase.md` |
| `append-progress` | 追加进展 + OT- | `append-progress-phase.md` |
| `update` | 改描述/提出人/负责人/状态/计划闭环 + OT- | `update-phase.md` |

完整映射：**只读** `router/operation-resolution.md` **§8**。
