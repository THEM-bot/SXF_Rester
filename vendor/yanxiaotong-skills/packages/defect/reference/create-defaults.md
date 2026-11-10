# 缺陷创建 · 默认值（Agent SSOT · v0.6）

> **何时读**：`operation: create` 时同步加载。  
> **按需读 §**：§2 NL 识别 · §3 内容提炼轨 · §4 缺陷类型自动判定 · §需求解析 · §完整轨（**禁止**一次性全读）  
> **v0.3**：NL 自由文本识别 `title`/`description`，**取消**「标题/名称/描述/复现步骤」关键词强制。  
> **v0.4**：新增 **内容提炼轨** `content_refine`（Agent 从大段输入提炼标题/描述，标题 ≤**40** 字）。  
> **v0.6**：创建时缺陷类型由 **Agent 按正文语义判定**（显式口令优先；无把握则「未选」；**禁止**机侧关键词默认命中）。

## 快捷轨默认

| 字段 | 默认 |
|------|------|
| `severity` | `C类（一般）` |
| `assigneeId` | **优先级**：① 用户指定（口令 `修复人`/`负责人` 或 M05 点选，传**工号**）→ ② 所属需求 R02 `developerEmployeeIds` 首位非空 → ③ 不传（Token 用户 = **修复人**） |
| `discoveryPhase` | 需求 R02 当前 `status`（**仅创建**自动填充，**不可修改**） |
| `defectType` | **Agent 语义判定**（§4）；显式口令/码优先；无把握则不传 |
| `regressionTesterId` | 不传；可选回归人 |
| `title` | **NL 自动识别**（§2）或 **Agent 提炼**（§3）；显式关键词可覆盖 |
| `description` | **NL 余段**、提炼结构化描述，或显式关键词；可选 |

## 2. NL 自由文本（`user_input` · `nl_remainder`）

剥离：需求 URL / REQ / `需求{id}` / 创建动词 / 已解析 `severity` / 显式 `修复人`/`负责人` / 显式 `缺陷类型` → `nl_remainder`。

| 优先级 | `title` | `description` |
|--------|---------|---------------|
| 1 显式关键词（可选） | `标题`/`名称`/`BUG：` 后 | `描述`/`复现步骤`/`内容` 后 |
| 2 `nl_remainder` 非空（短文本） | `autoDefectTitle`（首段 ≤200 字） | 后续段拼接；单段且较短时可为 `null` |
| 3 兜底 | `missing` → 只问标题 | `null` |

**`autoDefectTitle`**：首段去填充词（`今天`/`发现`/`出现`）；多段时首段作标题、余下作描述。

**示例**：

```text
在 REQ-20260703-001 下创建缺陷，登录按钮无响应，Chrome 点击后页面卡死
```

→ `title=登录按钮无响应` · `description=Chrome 点击后页面卡死` · Agent 判定 `defectType=5`（编码问题 · 自动判定）

**与 task 差异**：缺陷 **不继承**需求 `title`。

## 3. 内容提炼轨（`content_refine` · v0.4）

大段缺陷报告/需求文档片段粘贴时，机侧标记 `refine_status: pending_agent`，由 **Agent** 提炼。

### 触发（与 task 对齐 · `content-refine.mjs`）

1. 口令：`提炼` / `根据以下内容` / `帮我总结` 等
2. `source_content` ≥ 200 字
3. ≥ 80 字且文档/缺陷结构特征 ≥ 2 项（现象、复现步骤、预期/实际、环境等）

**不触发**：`原样创建`；显式 `标题/描述` 关键词；短句 NL。

### Agent 提炼规则

| 字段 | 规则 |
|------|------|
| `title` | **≤ 40 字**；一句话概括**现象/问题** |
| `description` | 结构化：`【现象】` `【复现步骤】` `【预期/实际】` `【环境】`（有则写）；**段之间须换行**；入库时纯文本换行会转为 `<br>`（Web `v-html`） |
| `defectType` | Agent 按 §4 语义判定后 **必须** `apply-refine --defect-type <码>`（或确认无把握留空）；确认表展示标签 |

### Golden-case（P-315）

对照 `scripts/fixtures/refine-golden-d1.json` · `d2.json`（机侧 `test-content-refine-golden.mjs` · 含 g1/g2/g3 + d1/d2）。

| 样例 | 期望 title | 期望 description 结构 |
|------|------------|-------------------------|
| **D1** | `列表页样式错乱` | `【现象】` + `【复现步骤】` |
| **D2** | `支付回调超时` | `【现象】` + `【环境】` |

### CLI

```bash
node "$PACK_ROOT/tools/defect-api.mjs" prepare --text-file "%TEMP%/user-text.txt" --out intent.json
node "$PACK_ROOT/tools/defect-api.mjs" apply-refine --intent intent.json --title "标题" --description "描述" [--defect-type 5] [--out intent.json]
node "$PACK_ROOT/tools/defect-api.mjs" execute --intent intent.json
```

## 4. 缺陷类型自动判定（v0.6 · Agent 语义）

> 机侧：`tools/lib/defect-type.mjs` · 创建解析仅认**显式口令** · 语义判定由 **Agent** 经 `apply-refine --defect-type` 写入（`defectTypeSource=agent_infer`）  
> **禁止**把关键词正则命中当作创建默认自动类型（旧 `content_infer` 规则仅遗留工具函数，默认关闭）。

### 优先级

1. **显式**：用户口令 `缺陷类型` + 码 `1`～`8` / 完整标签 / 简称（`设计`/`编码`/…）→ `explicit`
2. **Agent 语义判定**：读标题 + 描述（现象/复现/预期实际）→ 选唯一码，经 `apply-refine --defect-type <码>` → `agent_infer`
3. **无把握**：不传 · 确认表「（未选）」——**禁止**硬猜；**禁止**仅因出现某词就定类型

### Agent 语义口径（必遵）

根据**问题本质**归类（不是扫关键词）：

| 码 | 标签 | 语义要点（举例） |
|----|------|------------------|
| 1 | 预研问题 | 预研/POC/可行性验证阶段暴露的问题 |
| 2 | 需求问题-版本范围内 | 实现与已定需求/验收不符、需求遗漏（本版本应覆盖） |
| 3 | 需求问题-版本范围外 | 超出版本约定范围 |
| 4 | 设计问题 | 交互/视觉/布局/样式/原型设计不当 |
| 5 | 编码问题 | 实现逻辑/赋值/接口/异常/数据未按预期落库或展示 |
| 6 | 合入引发 | 合并/合码引入 |
| 7 | 历史遗留 | 长期存在的老问题 |
| 8 | 改动引发 | 本次改动/发版后新引入的回归 |

**示例**：正文写「负责人赋值未带上工号」→ 实现赋值不完整 → **`5` 编码问题**（即使未出现「报错/异常」等词）。

### 确认展示

- 显式：`设计问题`
- Agent：`编码问题（自动判定）`（`defectTypeSource=agent_infer`）
- 用户可在确认选 **2** 后改类型；完整轨仍可 M11 点选

### CLI（Agent 判定后写入）

```bash
node "$PACK_ROOT/tools/defect-api.mjs" apply-refine --intent intent.json --title "标题" --description-file desc.txt --defect-type 5 --out intent.json
```

## 需求解析

同 `intent-routing.md`；解析后 **必须** R02 `detail` 校验（`prepare` 内完成）。

## 完整轨触发

用户说「完整创建」「自定义严重性」「逐步创建」→ `create_mode: full` → `create-phase` 完整轨。

## 修改记录

| 日期 | 说明 |
|------|------|
| 2026-08-05 | v0.6 创建类型改为 Agent 语义判定；机侧关键词默认关闭 |
| 2026-08-04 | v0.5 缺陷类型按正文自动判定 · 显式优先 · 无信号不传 |
| 2026-08-04 | 修复人默认：用户指定 > 需求开发人员工号 > 令牌；依赖 R02 developer* |
| 2026-07-13 | v0.4 内容提炼轨 · 标题 ≤40 字 · golden-case（P-315/P-320） |
| 2026-07-10 | v0.3 NL 自由文本 · `autoDefectTitle` · 取消关键词强制 |
