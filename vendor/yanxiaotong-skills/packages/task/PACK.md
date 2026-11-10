---
name: yanxiaotong-task
description: >-
  研效通开放 API：迭代任务创建/修改/取消 + 查询分流（详情/列表）及 M10/R03 元数据点选。local:ready。
  Use when user mentions 任务、TASK-、迭代任务、创建任务。
disable-model-invocation: true
---

# yanxiaotong-task

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ 操作类型 → 收参/点选 → task-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 创建 | `@yanxiaotong-skills` 创建任务 |
| 查询 | `@yanxiaotong-skills` 查 TASK-xxx |
| 修改 | `@yanxiaotong-skills` 改 TASK-xxx 描述 |
| 取消 | `@yanxiaotong-skills` 取消 TASK-xxx |

## 禁止

- 直连 `@yanxiaotong-task`；手填阶段/类别/需求 id；开放 API 改状态；token 回显；未调 CLI 报成功

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. 按操作读 `reference/phases/*-phase.md`
3. 话术：`reference/ui/response-templates.md`
4. 契约：`reference/open-api-contract.md`
5. 工具：`node $PACK_ROOT/tools/task-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
