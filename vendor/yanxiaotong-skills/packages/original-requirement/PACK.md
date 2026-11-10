---
name: yanxiaotong-original-requirement
description: >-
  研效通开放 API：原始需求操作（创建/查询/修改）及 M01 业务领域点选。三环境 ready。
  Use when user mentions 原始需求、OR-、需求受理、开放 API 原始需求。
disable-model-invocation: true
---

# yanxiaotong-original-requirement

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ 操作类型 → 收参/点选 → original-requirement-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 创建 | `@yanxiaotong-skills` 创建原始需求（可粘贴大段正文；提炼标题/描述/价值；交付默认当天） |
| 查询 | `@yanxiaotong-skills` 查 OR-xxx |
| 修改 | `@yanxiaotong-skills` 把 OR-xxx 标题改成… |

## 禁止

- 直连 `@yanxiaotong-original-requirement`；猜领域 id；token 回显；伪造成功
- 调用未开放端点（受理状态/关联/不采纳）

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. 按操作读 `reference/phases/*-phase.md`
3. 话术：`reference/ui/response-templates.md`
4. 契约：`reference/open-api-contract.md`
5. 工具：`node $PACK_ROOT/tools/original-requirement-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
