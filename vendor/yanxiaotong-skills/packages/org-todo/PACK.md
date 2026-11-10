---
name: yanxiaotong-org-todo
description: >-
  研效通开放 API：组织待办创建/查询/修改/追加进展（API-OT01～OT05）。local:ready。
  Use when user mentions 组织待办、OT-、org-todo。
disable-model-invocation: true
---

# yanxiaotong-org-todo

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ 操作类型 → 收参/点选 → org-todo-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 创建 | `@yanxiaotong-skills` 创建组织待办 |
| 查询 | `@yanxiaotong-skills` 查 OT-xxx |
| 修改 | `@yanxiaotong-skills` 改 OT-xxx 状态为处理中 |
| 追加进展 | `@yanxiaotong-skills` 给 OT-xxx 追加进展：… |

## 禁止

- 直连 `@yanxiaotong-org-todo`；手填领域/项目 id（须 M01/M02 点选或用户直给名称）；token 回显；未调 CLI 报成功

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. 按操作读 `reference/phases/*-phase.md`
3. 话术：`reference/ui/response-templates.md`
4. 契约：`reference/open-api-contract.md`
5. 工具：`node $PACK_ROOT/tools/org-todo-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
