# yanxiaotong-demo · Agent Boot（子包入口 · 必读索引）

> **何时读**：父包路由至 demo 后，**在** `instructions.md` **之前或同时**加载本文件。

## PACK_ROOT（技能包绝对路径 · 强制）

```text
PACK_ROOT = 本文件所在目录的上一级（即含 PACK.md 的目录）
```

- **解析**：`reference/boot.md` → 上级 `reference/` → 再上一级即为 **PACK_ROOT**（与 `PACK.md` 同级）。
- **经 `@yanxiaotong-skills` 路由进入时**：`PACK_ROOT` **必须**指向 **`packages/demo/`**（含本包 `PACK.md`），**禁止**用聚合包根目录 `yanxiaotong-skills/` 拼 `tools/`（该路径下无 `pack-mock-zip.mjs`）。
- **定位失败时**：Glob `**/packages/demo/PACK.md` 或 `**/packages/demo/tools/pack-mock-zip.mjs`，取命中目录为 `PACK_ROOT`。
- **所有** Node 命令（路径均相对 `PACK_ROOT`）：

```bash
node "$PACK_ROOT/tools/pack-mock-zip.mjs" --source dist --out out.zip
node "$PACK_ROOT/tools/preview-upload-params.mjs" --environment 本地 --project-root "<项目>" --zip out.zip --name "…" --domain-keyword "平台组" --service-keyword "平台组"
node "$PACK_ROOT/tools/fetch-metadata.mjs" --kind domains --environment 本地 --match "平台组"
node "$PACK_ROOT/tools/upload-demo.mjs" ...
node "$PACK_ROOT/tools/token-store.mjs" write --token "..." --environment UAT
node "$PACK_ROOT/tools/session-store.mjs" clear --environment UAT
node "$PACK_ROOT/scripts/verify-upload-response.cjs" response.json
```

- **禁止**在用户项目 cwd 下相对调用 `tools/`、`scripts/`。

## 最小必读（4 文件 · 进入主路径前）

| 序 | 文件 | 用途 |
|----|------|------|
| 1 | `reference/instructions.md` | 执行优先级 · 阶段路由 |
| 1b | `reference/phases/pack-phase.md` | 出包主路径（zip 前） |
| 1c | `reference/phases/upload-phase.md` | 上传主路径（zip 后） |
| 2 | `reference/ui/response-templates.md` | 固定话术 · T-FIX-ASK / §8 一次一问 |
| 3 | `reference/ui/progress-display.md` | `当前正在…` 全表 |
| 4 | `reference/upload/open-api-upload.md` | D03/D04 契约（**上传执行前**） |

## 上传路径追加必读（+2 · **进入 §8 前**）

用户意图含 **上传 / D03 / D04 / 研效通** 时，在最小必读 4 文件基础上 **必须**再读：

| 序 | 文件 | 用途 |
|----|------|------|
| 5 | `reference/upload/token-store.md` | 令牌 `~/.yanxiaotong/tokens/{local,uat,prod}` |
| 6 | `reference/upload/session-store.md` | 会话 `~/.yanxiaotong/sessions/{env}/{project_slug}`（按 §1 项目路径） |

按需追加：`step-completion-gate.md` · `reference/pack/notes.md`（深读检查）

## reference 子目录（主题分组 · 勿在根层堆过多文件）

| 子目录 | 职责 | 文件 |
|--------|------|------|
| `phases/` | 出包 / 上传主路径 | `pack-phase.md`、`upload-phase.md` |
| `pack/` | 检查与 zip 深读 | `notes.md`、`zip-output.md` |
| `upload/` | 开放 API 与会话 | `open-api-upload.md`、`token-store.md`、`session-store.md` |
| `ui/` | 对用户话术与进度 | `response-templates.md`、`progress-display.md` |

根层仅保留：`boot.md`、`instructions.md`、`step-completion-gate.md`。

## 快捷启动（§ instructions 速查 · T-QUICK-START-ACK）

用户**首条**同时给出 **项目路径 + 上传意图 + 环境 + D03/D04（+ 可选 demoId）** 时：

- 可发 **T-QUICK-START-ACK** → 检查 → 构建（无阻塞则**跳过 T-CHECK-DONE**）→ zip
- 可跳过 **T-ZIP-DONE**「是否上传」
- zip 后**仍须**先定上传方式（开篇已给 D03/D04 则复述；否则 **T-UPLOAD-TYPE**）；**仅 D03** 再 §8.15 预览或逐项收参；D04 只收标识；修改一次一项

## Shell 写法（Windows · 强制）

| 环境 | 写法 | 禁止 |
|------|------|------|
| **PowerShell** | `Set-Location 'D:\path\proj'; npm run build:mock` | `cd ... && npm`（`&&` 非法） |
| **PowerShell** | 校验响应：先落盘再 `node "$PACK_ROOT/scripts/verify-upload-response.cjs" 'C:\path\response.json'` | bash heredoc `<<`（**语法错误**） |
| **cmd.exe** | `cd /d D:\path\proj && npm run build:mock` | — |
| **bash** | `cd /path/proj && npm run build:mock` | — |

### 响应校验（PowerShell · 推荐写法）

`upload-demo.mjs` 已内置校验；**单独复验**时 **勿**用 `<<'EOF'`：

```powershell
# 方式 A：响应已写入文件（首选）
node "$PACK_ROOT/scripts/verify-upload-response.cjs" 'C:\path\to\response.json'

# 方式 B：管道 stdin（单行 JSON）
'{"success":true,"data":{"demoId":1,"accessUrl":"https://..."}}' | node "$PACK_ROOT/scripts/verify-upload-response.cjs"
```

失败时对照 `reference/upload/open-api-upload.md`「无 Node 时人工核对响应」表，**禁止**因校验脚本失败否定已明确的 `success: true` 上传结果。

## 项目路径 · `@文件夹`

- 用户 `@<文件夹名>` **可**作项目路径。
- Agent **须** Read/Glob 确认该目录含 `package.json` 或 `index.html` 后固定为 **PACK_PROJECT**。
- 无法确认 → **T-PATH-ASK**。

## 响应校验脚本

- **对外推荐**：`scripts/verify-upload-response.cjs`
- **`verify-upload-response.js`**：仅 launcher，内部委托 `.cjs`（兼容宿主 `type:module`）

## 预览链接（accessUrl）

上传/查询 API 的 `base_url` **不变**。交付用户的 `accessUrl` 须经 **预览源站重写** + **去掉全屏 `f=1`**：

| 环境 | 预览源站 |
|------|----------|
| 本地 | `http://localhost:5173` |
| UAT | `https://yanxiaotong-uat.atrust.sangfor.com` |
| 生产 | `https://yanxiaotong.atrust.sangfor.com` |

`upload-demo.mjs` 调用 `normalizeAccessUrlForDelivery`；成功交付另附 **详情页链接**（`?d=`）。详见 `reference/upload/open-api-upload.md`。

## 工具维护说明（YXT-DEMO-16）

- **SSOT**：`tools/*.mjs` + `tools/lib/demo-tools.mjs`
- `*.ps1` / `*.sh`：**无 Node 备选**；长期方向为薄包装调用 mjs，新增能力**先写 mjs**
