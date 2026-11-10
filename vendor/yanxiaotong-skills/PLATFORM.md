# 平台注意事项（P-391 · Agent / 人类共用）

> **位置**：技能包根（**非** `router/`）。Windows 与跨平台命令纪律集中于此；子包 boot 可链到本文件。

## Node 调用

- **禁止** `cd path && node …`（Windows PowerShell / cmd 易踩坑）。
- **须**用绝对或相对技能根路径：`node "D:\path\to\yanxiaotong-skills\tools\entry-bootstrap.mjs" --text "…"`。
- 无 Shell 时用 `--print-plan`（若工具支持），**禁止**假装已执行。

## JSON / 编码（Windows）

- **禁止** PowerShell `Set-Content -Encoding UTF8` / `Out-File` 写 API body（易带 BOM）。
- **首选**编辑器 / Cursor Write 将 `body.json` 落到系统 temp（UTF-8 **无 BOM**）；亦可用 Node `fs.writeFileSync`。
- **禁止** `node -e` / `node --eval` **内联**写含中文的 JSON（弯引号等会在 PowerShell 下弄断命令行）。
- **禁止** `>` 重定向捕获 CLI JSON；**须** CLI `--out <path>`。
- **禁止** `$json | node … --json - --out …` 三连。
- **含中文的用户原文**：PowerShell 默认代码页**不是 UTF-8**，`--text "中文…"` 会把标题/描述弄乱。**须** Write 落 `%TEMP%/user-text.txt`（UTF-8 无 BOM）→ `entry-bootstrap` / `prepare` / `parse-intent` 用 `--text-file`；**禁止**把长中文放进命令行后再靠「改编码重跑」。

## 临时文件

- 临时 body/脚本只落**系统 temp**；**禁止**写入 `packages/**`。

## 环境选择

- `resolveEntryEnv`：**仅**新一轮 `@` 首句；有环境词（UAT / 本地 / 生产）才用该环境；**否则一律生产**。
- **禁止**用 `~/.yanxiaotong/sessions/selected-env.json` 记住或沿用**上一轮 `@`** 的环境。
- 该文件仅作**当轮 `@`** CLI 快照（`env-session read`）。每轮 `@` 须重新跑入口解析。
- **首屏后回菜单序号**（如 `1`～`7`）：属同轮续聊 → **继承**该次 `@` 已解析环境；**禁止**再跑 `entry-bootstrap`（否则纯序号无环境词会被写成生产）。细则见 `router/public-env.md`。
