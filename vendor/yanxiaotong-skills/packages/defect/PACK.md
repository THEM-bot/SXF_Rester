---
name: yanxiaotong-defect
description: >-
  研效通开放 API：迭代缺陷六操作（创建/查询/修改/流转状态/关闭）及 M11/R03 元数据点选。NL-first。
  Use when user mentions 缺陷、TD-、BUG、提缺陷、迭代缺陷。
disable-model-invocation: true
---

# yanxiaotong-defect

> **AGENT: 不要读 README.md**  
> **内部模块**：经 `@yanxiaotong-skills` 路由进入；**禁止**用户直连本子包 `@`。

## 主路径

```text
（父包 env + token 已通过）→ parse-intent → 确认 → defect-api → 校验 → 交付
```

已选环境：**继承父包** `selected_env` · 读 `router/public-env.md`（子包内不再问环境）。

## 快捷话术

| 意图 | 你说 |
|------|------|
| 创建 | `@yanxiaotong-skills` 在 REQ-xxx 下创建缺陷，标题… |
| 查询 | `@yanxiaotong-skills` 查 TD-xxx |
| 修改 | `@yanxiaotong-skills` 把 TD-xxx 严重性改成 B类 |
| 流转 | `@yanxiaotong-skills` 把 TD-xxx 状态改为 处理中 |
| 关闭 | `@yanxiaotong-skills` 解决关闭 TD-xxx |

## 禁止

- 直连 `@yanxiaotong-defect`；手填 id；D04 改 status；未调 CLI 报成功；token 回显

## Instructions

1. `reference/boot.md` → `reference/instructions.md`
2. NL 优先：`tools/parse-intent.mjs` · `reference/intent-routing.md`
3. 按操作读 `reference/phases/*-phase.md`
4. 话术：`reference/ui/response-templates.md`
5. 契约：`reference/open-api-contract.md`
6. 工具：`node $PACK_ROOT/tools/defect-api.mjs`（首选）

## Step Completion Gate

见 `reference/step-completion-gate.md`
