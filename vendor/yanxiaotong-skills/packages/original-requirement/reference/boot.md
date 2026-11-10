# yanxiaotong-original-requirement · Agent Boot

> **何时读**：父包 **T-ROUTER-OR-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/original-requirement/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/original-requirement-api.mjs`（除非显式父包 token 工具）。

## 已选环境（继承父包 · Q19）

**须读** `router/public-env.md`（SSOT）。**继承**父包 `selected_env`（`tools/env-session.mjs read`）；**禁止**在子包内再问环境。

> **router 读例外**：子包纪律禁止预读 `router/`，**仅允许** `public-env.md` 与 **`operation-resolution.md`**（operation 映射 SSOT · P-378）。

## 父包令牌

读写：`$SKILL_ROOT/tools/token-store.mjs`（环境参数：`{selected_env.env_label}`）。

## 最小必读

| 序 | 文件 |
|----|------|
| 1 | `reference/instructions.md` |
| 2 | `reference/ui/progress-display.md` |
| 3 | `reference/ui/response-templates.md` |
| 4 | `reference/open-api-contract.md`（API 执行前） |
| 5 | **仅**当前操作 `reference/phases/*-phase.md`（**禁止**一次读齐所有 phase · P-388） |
| 6 | `reference/error-humanize.md`（失败时） |
| 7 | `reference/create-defaults.md`（创建前） |

## 工具命令

```bash
node "$PACK_ROOT/tools/original-requirement-api.mjs" create --json body.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/original-requirement-api.mjs" detail --id OR-xxx [--human]
node "$PACK_ROOT/tools/original-requirement-api.mjs" list --json query.json [--human]
node "$PACK_ROOT/tools/original-requirement-api.mjs" update --id OR-xxx --json body.json [--human]
node "$PACK_ROOT/tools/original-requirement-api.mjs" m01
node "$PACK_ROOT/tools/original-requirement-api.mjs" m05 [--keyword 张三] [--pick]
node "$PACK_ROOT/scripts/verify-original-requirement-response.cjs" response.json
```

## 会话审计

- **会话文件路径（无扩展名）**：`~/.yanxiaotong/sessions/{env_slug}/original-requirement`
- **禁止**用裸 `Get-Content` 判断 session 编码。
- **写入 SSOT**：`create` 成功后 CLI **已**调用 `writeSessionFile`；Agent **禁止**再写 JSON/`Set-Content` 覆盖（会破坏 `readSessionFile`，导致下次无法 **T-SESSION-REUSE-ASK**）。
- **正确形态示例**（只读对照；勿当模板手搓覆盖，除非应急修复且字段齐全）：

```text
# original-requirement session (UAT)
last_create_defaults:
  businessDomainId: 1899410689622035456
  businessDomainName: IT部
last_original:
  id: 299
  originalNo: OR-20260723-0001
updated_at: 2026-07-23T06:05:00.000Z
```

```powershell
node -e "const fs=require('fs');const p=require('path').join(process.env.USERPROFILE,'.yanxiaotong','sessions','local','original-requirement');try{console.log(fs.readFileSync(p,'utf8'))}catch(e){console.log('NO_SESSION')}"
```

（`local` 换为 `{selected_env.env_slug}`。）

父包 token：

```bash
node "$SKILL_ROOT/tools/token-store.mjs" resolve --environment {selected_env.env_label}
node "$SKILL_ROOT/tools/env-session.mjs" read
```

## Windows JSON 纪律（对齐 requirement · P-169 / P-206）

- PowerShell 禁用 `Set-Content -Encoding UTF8` 写 API body（可能带 BOM）。
- **OR01 / OR02 / OR07 body**：先落到系统 temp（如 `%TEMP%\yanxiaotong-or-create\body.json`），再 `create|update|list --json body.json --out resp.json [--human]`。
- **首选**编辑器 / Cursor **Write** 工具直接写入上述 `body.json`（UTF-8 **无 BOM**）；亦可用 Node `fs.writeFileSync`（**仅**读已存在文件或极短无中文 ASCII，再写出）。
- **禁止** `node -e` / `node --eval` **内联**写含中文的 JSON（弯引号 `“”`、书名号等会在 PowerShell 下弄断字符串 · 实测阻塞 OR01）。
- **禁止** PowerShell `$json | node … create --json - --out $path` 三连。
- **禁止** `>` 重定向捕获 CLI JSON；**须** `--out <path>`。
- **禁止**向 `packages/original-requirement/` 写临时脚本。
- **链式命令**：Windows PowerShell 5.x **不支持** bash 式 `cmd1 && cmd2`；改用 `cmd1; if ($LASTEXITCODE -eq 0) { cmd2 }`，或**分条**执行（先 create/`--out`，再 verify）。

`$SKILL_ROOT` = 含 `SKILL.md` 的 `yanxiaotong-skills/` 根。

## operation 路由卡

用户选定操作类型后，**同轮**更新内部 `operation`；进入 `*-phase.md` 前须与 phase 一致。映射 SSOT：`router/operation-resolution.md` **§2 original-requirement**。

同轮进入本子包后**须立刻**加载本 boot → `instructions.md`（**禁止**停在 handoff 话术 · P-407）。
