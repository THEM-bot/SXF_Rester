# create-phase · 创建缺陷（D01）

> 契约：`open-api-contract.md` §D01 · NL：`intent-routing.md` · 默认：`create-defaults.md`

## NL 快捷轨（默认）

1. `parse-intent.mjs --text-file` 或 `defect-api.mjs prepare --text-file`（Windows 含中文须 Write 落 UTF-8 无 BOM 再传路径；**禁止** PowerShell `--text "中文…"` · `PLATFORM.md`）（**NL 自由文本**识别 `title`/`description`，**不必**带「标题/描述」关键词 · `create-defaults.md` §2）
2. **内容提炼轨**（§3）：`refine_status: pending_agent` 时 Agent 提炼标题/描述
3. **缺陷类型**（§4 · **强制**）：未显式指定时，Agent **根据标题+描述语义**判定码 `1`～`8`（或无把握不传）→ **同轮** `apply-refine --title … --description-file … --defect-type <码>`；**禁止**依赖机侧关键词命中；确认表展示「…（自动判定）」或「（未选）」
4. `missing` 含 `title` 且 NL 无法推断 → **T-DEFECT-TITLE-ASK**（仅此）
5. `missing` 含 `requirement` → 补 URL/REQ 或 R03 `--pick`
6. **T-DEFECT-CREATE-QUICK-CONFIRM**（`| 项目 | 内容 |` 表格，**须含「缺陷描述」行**；空则「（无）」）→ 用户选 1
7. `defect-api.mjs execute --intent` 或 `create --json` → verify → **T-DEFECT-CREATE-DONE**

## 完整轨（兜底）

用户说「完整创建」「逐步创建」→ M11（严重性 / 缺陷类型）/ M05（修复人 / 回归人）点选 → D01（`discoveryPhase` 仍自动取需求 R02 `status`，不问 M09）

## 禁止

手填 id；未 R02 校验即 D01；传 status；未调 CLI 报成功；以 `- 字段：` 列表代替创建确认表格
