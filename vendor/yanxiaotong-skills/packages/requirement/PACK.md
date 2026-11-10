---
name: yanxiaotong-requirement
description: >-
  研效通开放 API：需求池操作（创建/查询/修改/作废）及 M01/M02/M03/M09 元数据点选。本地环境 local:ready。
  Use when user mentions 需求池、创建需求、REQ-、研效通需求操作。
disable-model-invocation: true
---

# yanxiaotong-requirement

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ 操作类型 → 收参/点选 → requirement-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 创建 | `@yanxiaotong-skills` 创建需求 |
| 基于原始需求创建 | `@yanxiaotong-skills` 在 OR-xxx 下新建需求… / 粘贴原始需求详情 URL 后说新建需求 |
| 查询 | `@yanxiaotong-skills` 查 REQ-xxx |
| 修改 | `@yanxiaotong-skills` 把 REQ-xxx 优先级改成高 |
| 作废 | `@yanxiaotong-skills` 作废 REQ-xxx |

## 禁止

- 直连 `@yanxiaotong-requirement`；猜领域/项目/服务 id；无二次确认作废；token 回显；伪造成功

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. 按操作读 `reference/phases/*-phase.md`
3. 话术：`reference/ui/response-templates.md`
4. 契约：`reference/open-api-contract.md`
5. 工具：`node $PACK_ROOT/tools/requirement-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
