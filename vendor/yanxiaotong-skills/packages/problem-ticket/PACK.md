---
name: yanxiaotong-problem-ticket
description: >-
  研效通开放 API：问题单元数据 / 创建问题单（API-P-META / API-P01）。local:ready。
  Use when user mentions 问题单、PRB-、创建问题单、问题单元数据。
disable-model-invocation: true
---

# yanxiaotong-problem-ticket

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ 操作类型 → 收参 → problem-ticket-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 元数据 | `@yanxiaotong-skills` 获取问题单元数据 |
| 创建 | `@yanxiaotong-skills` 创建问题单 |

## 禁止

- 直连 `@yanxiaotong-problem-ticket`；token 回显；未调 CLI 报成功；创建漏 `Idempotency-Key`

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. 按操作读 `reference/phases/*-phase.md`
3. 话术：`reference/ui/response-templates.md`
4. 契约：`reference/open-api-contract.md`
5. 工具：`node $PACK_ROOT/tools/problem-ticket-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
