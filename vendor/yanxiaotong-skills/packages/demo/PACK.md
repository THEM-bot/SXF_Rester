---
name: yanxiaotong-demo
description: >-
  研效通 Demo：检查修复、mock 出 zip，出包后询问是否上传，D03 新增/D04 更新，交付访问链接。
  Use when user mentions Demo 打包、出包、上传、D03、D04、X-Open-Api-Token、研效通 Demo。
disable-model-invocation: true
---

# yanxiaotong-demo

> **AGENT: 不要读 README.md**  
> **PACK_ROOT** 与工具路径：**见 `reference/boot.md`**（子包 SSOT）  
> 经 `@yanxiaotong-skills` 路由时 **勿**用聚合包根目录拼工具路径。

## Constraints

| 包内闭环 | 业务 SSOT 在本模块 `reference/`、`tools/` 内 |

## 主路径（默认）

**检查 → 修复 → 出 zip → 问是否上传 →（若上传）问 D03/D04 → 按类型收参（D03 预览或逐项；D04 收标识）→ curl → 交付 accessUrl → 结束**

## 快捷话术（复制即用）

| 意图 | 你说 |
|------|------|
| **只出包** | `@yanxiaotong-skills` 只出包 Demo，项目 `D:/work/my-app` |
| **上传新建** | `@yanxiaotong-skills` Demo 打包并上传 **UAT**，新建 Demo「演示包」 |
| **指定名称新建** | `@yanxiaotong-skills` 打前端 Demo 包 `@efficiency-hub-web-v2` 新建 Demo，名称为 IT研效通-测试 → **直接用该名称**，不问是否沿用旧 Demo 名 |
| **指定领域/所属组** | `@yanxiaotong-skills` … 业务领域平台组，所属组平台组 → 选定 **D03** 后**后台匹配**进 **Demo 预览表**，用户确认或修改后上传 |
| **上传更新** | `@yanxiaotong-skills` Demo 重新打包，**本地** D04 更新 `demoId=65` |
| **快捷启动** | `@yanxiaotong-skills` Demo 打包上传 `efficiency-hub-web-v2`，本地 D04 更新 demoId=65 |

## 禁止

- **禁止**用户直连 `@yanxiaotong-demo`（唯一入口 `@yanxiaotong-skills`，Q15）
- **不得**用旧 zip 跳过出包；纯静态见 `pack-phase.md` §1.0
- **禁止**跳过 T-FIX-ASK 改代码、§8 多题同条、无序号选项（`response-templates.md`）

## When to Use

- **标准**：检查 → 修复 → **重新**打 zip → 询问上传 → **D03/D04** → 按类型收参 → 交付链接
- **只要出包**：§1～§6 + 步骤 3/3b 出 zip，**不进入 §8**

## Instructions

1. **`reference/boot.md`** → `reference/instructions.md` → 按阶段读 **`pack-phase.md`** / **`upload-phase.md`**
2. **`reference/ui/response-templates.md`**（与用户交互时）
3. **上传路径**（进入 upload-phase 前 **必读**）：父包 `router/token-store.md` + `yanxiaotong-skills/tools/token-store.mjs`；会话 → `reference/upload/session-store.md`
3. 上传契约：`open-api-upload.md`
4. **工具**：`node $PACK_ROOT/tools/*.mjs`（**首选**）· ps1/sh 备选

## Step Completion Gate

见 `reference/step-completion-gate.md`
