# 构建完成后：`.zip` 命名、位置与打包

> **关联**：`reference/instructions.md` §1 步骤 3b · `reference/pack/notes.md` 第 8 节

## 默认流程

**先** `build` 成功，**再**将静态产物目录打成 **`.zip`**。

**存放位置默认** = **当前工作区根**（`git rev-parse --show-toplevel` 与用户所见根一般一致）。**不**默认写在子包目录内，除非用户明确要求。

- **命名**：`<项目名或用户指定名>-mock-<YYYYMMDDHHmmss>.zip`（含时分秒，避免同日覆盖）
- **自动生成**：`node pack-mock-zip.mjs --source dist --workspace-root <工作区根> [--project-name <名>]`（`demo-tools.mjs` · `defaultMockZipOut`）
- **位置**：工作区根；monorepo 在子包内构建时，zip 仍落在工作区根
- **内容**：仅产物目录（`dist` / `outDir` / 纯静态源目录），含 **非空** `index.html`、`assets/`、`mockServiceWorker.js` 等

### 硬门禁：`index.html` 非空（YXT-DEMO · pack）

`pack-mock-zip.mjs`（以及 `.ps1` / `.sh`）在打 zip **之前**校验源目录根下 `index.html`：

| 情况 | 行为 |
|------|------|
| 缺少 `index.html` | **拒绝打包** · exit 1 · 中文提示 |
| 0 字节，或去掉 BOM/空白后无内容 | **拒绝打包** · exit 1 · 中文提示 |
| 有可见内容 | 继续打 zip |

Agent 遇失败 → **T-PACK-EMPTY-INDEX**（`response-templates.md`）；**禁止**绕过工具手工打 zip。

## 打 zip：本包 `tools/`（Agent 首选 Node）

| 优先级 | 脚本 | 说明 |
|--------|------|------|
| **1 · 全平台** | `tools/pack-mock-zip.mjs` | 纯 Node，ZIP 内路径 `/` 规范化；**Windows Agent 首选** |
| 2 · Windows | `tools/pack-mock-zip.ps1` | `-File` 绝对路径；ParserError 时用 `.mjs` |
| 3 · Unix | `tools/pack-mock-zip.sh` | 需本机 `zip(1)` |

```bash
node <技能包>/tools/pack-mock-zip.mjs --source path/to/dist --out path/to/name-mock-YYYYMMDDHHmmss.zip
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<技能包>\tools\pack-mock-zip.ps1" -Source "dist" -OutZip "name-mock-YYYYMMDDHHmmss.zip"
```

```bash
bash tools/pack-mock-zip.sh path/to/dist path/to/out.zip
```

脚本路径相对于**本技能包根**；`--source` / `-Source` 为产物目录，`--out` / `-OutZip` 为输出 zip。

**禁止**：资源管理器「发送到压缩文件夹」等默认方式（易导致 Linux `unzip` 路径问题，见 `notes` 第 8 节）。

---

*流水线 unzip 异常见 `reference/pack/notes.md` 第 8 节。*
