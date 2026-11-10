# yanxiaotong-requirement · Agent Boot

> **何时读**：父包 **T-ROUTER-REQ-HANDOFF** 后、**在** `instructions.md` **之前**。

## PACK_ROOT

```text
PACK_ROOT = packages/requirement/（含本 PACK.md）
```

经 `@yanxiaotong-skills` 路由时 **禁止**用聚合根拼 `tools/requirement-api.mjs`（除非显式父包 token 工具）。

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

## 工具命令

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" create --json body.json [--human] [--out resp.json]
node "$PACK_ROOT/tools/requirement-api.mjs" create-from-doc --path file.md [--reuse-defaults] [--json defaults.json]
node "$PACK_ROOT/tools/requirement-api.mjs" write-json-body --json meta.json --out body.json [--description-file desc.txt]  # P-239
node "$PACK_ROOT/tools/requirement-api.mjs" m01 --with-project-hints
node "$PACK_ROOT/tools/requirement-api.mjs" m06
node "$PACK_ROOT/tools/requirement-api.mjs" generate-modes --human   # alias: gm（SC-260827-001）
node "$PACK_ROOT/tools/requirement-api.mjs" parse-doc --path dir-or-file.md   # P-229 支持文档仓库别名路径
node "$PACK_ROOT/tools/requirement-api.mjs" resolve-upload-defaults [--yml path] [--match]  # SC-260802-005
node "$PACK_ROOT/tools/requirement-api.mjs" parse-create --text "在 OR-xxx 下新建需求，…" [--or-json or.json]
node "$PACK_ROOT/tools/requirement-api.mjs" refine-create --text "用户说明" [--or-json or.json]
node "$PACK_ROOT/tools/requirement-api.mjs" scan-iter --path {迭代目录} [--out scan.json]   # P-230/P-231
node "$PACK_ROOT/tools/requirement-api.mjs" batch-create --manifest scan.json --reuse-defaults [--out results.json]   # P-232
node "$PACK_ROOT/scripts/verify-requirement-response.cjs" response.json
```

**文档路径别名（P-229）**：`parse-doc` / `scan-iter` 的 `--path` 支持工作区文档仓库别名（见 `tools/lib/resolve-doc-path.mjs`）。

## 会话审计（P-208 · P-221）

- **会话文件路径（无扩展名）**：`~/.yanxiaotong/sessions/{env_slug}/requirement` — 继承父包当轮所选环境，**禁止**写死 `local`；**禁止**读 `requirement.json`（该路径不存在）。
- **禁止**用裸 `Get-Content` 判断 session 编码（易误报乱码）。
- **须**：

```powershell
node -e "const fs=require('fs');const p=require('path').join(process.env.USERPROFILE,'.yanxiaotong','sessions','uat','requirement');try{console.log(fs.readFileSync(p,'utf8'))}catch(e){console.log('NO_SESSION')}"
```

（`uat` 换为 `{selected_env.env_slug}`；路径**无** `.json` 后缀。）

父包 token：

```bash
node "$SKILL_ROOT/tools/token-store.mjs" resolve --environment {selected_env.env_label}
node "$SKILL_ROOT/tools/env-session.mjs" read
```

## Windows M01 脚注（P-223）

- **须** `node "$PACK_ROOT/tools/requirement-api.mjs" m01 --with-project-hints`
- **禁止** Windows 下 `node -e` + `execSync` 批量拉 M02 探测脚注

## 描述 HTML（P-241 / P-240）

- R01/R04 `description`：**CLI 入库前**转 HTML（`description-to-html.cjs` · `normalizeCreateBody` / `applyDescriptionHtml`）
- 文档轨全文上传；确认表不预览正文（见 `ui/response-templates.md` · T-DOC-CONTENT-CONFIRM）
- 裸 XSS 字面量入库前中和，避免服务端清洗截断

## Windows JSON 纪律（P-131 / P-138 / P-206 / **P-239**）

- PowerShell 禁用 `Set-Content -Encoding UTF8` 写 API body（可能带 BOM）。
- **R01 创建 body 唯一合法路径（按序）**：
  1. **首选**：编辑器/`Write` 工具直接落 `%TEMP%/req-create-body.json`（UTF-8 无 BOM）→ `create --json … --out …`
  2. **次选**：`write-json-body --json meta.json [--description-file desc.txt] --out %TEMP%/body.json`（CLI 内 `fs.writeFileSync`，中文只进文件不进命令行）→ `create`
  3. **次选**：系统 temp 下 `.mjs` 脚本**文件内**含中文，命令行**无**中文 → `node script.mjs` 写出 body → `create`
- **禁止**：`node -e` / `node --eval` 内联含中文或 `writeFileSync`+JSON 拼 body；禁止 PS `$json | node … create --json - --out` 三连（P-206）。
- **禁止** `>` 重定向捕获 CLI JSON；**须** `--out <path>` 且路径为显式字符串（可用 `--out=C:\path\resp.json`）。
- **禁止**为规避转义向 `packages/requirement/` 写 `_temp-*.mjs` 等临时脚本；临时文件只能落系统 temp 目录（**批量 R01 亦禁止 temp 整批脚本 · P-222**）。

```bash
node "$PACK_ROOT/tools/requirement-api.mjs" write-json-body --json meta.json --description-file desc.txt --out "$TEMP/req-create-body.json"
node "$PACK_ROOT/tools/requirement-api.mjs" create --json "$TEMP/req-create-body.json" --out "$TEMP/req-create-resp.json"
```

`$SKILL_ROOT` = 含 `SKILL.md` 的 `yanxiaotong-skills/` 根。

## operation 路由卡（P-220）

用户选定操作类型（**T-OP-TYPE-ASK** / **T-QUERY-TYPE-ASK**）后，**同轮**更新内部 `operation`；进入 `*-phase.md` 前须与 phase 一致。映射 SSOT：`router/operation-resolution.md` **§3 requirement**（**禁止**向用户展示 JSON · P-384）。
