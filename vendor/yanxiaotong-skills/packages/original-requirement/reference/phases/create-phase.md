# create-phase · 创建原始需求（OR01）

> 契约：`open-api-contract.md` §OR01 · 默认：`create-defaults.md`

## 进入条件

- `operation: create`
- 六必填齐备前**禁止**调用 OR01

## 步骤

1. 有会话默认 → **T-SESSION-REUSE-ASK**；选 1 则带入 `businessDomainId` / 名称
2. **解析首轮正文**（读 `create-defaults.md` §标题解析）：
   - 已有可提炼 `nl_remainder` → Agent **同轮**写出 `title`、能分段/生成的痛点，以及 **`userNeedDesc` / `valueDescription`（均强制自动提炼）**；**跳过** **T-CREATE-TITLE-ASK** / **T-CREATE-NEED-ASK** / **T-CREATE-VALUE-ASK**
   - 无法推断 `title` → **T-CREATE-TITLE-ASK**
3. 缺 `businessPain`（仅无实质正文可提炼时）→ **T-CREATE-PAIN-ASK**；**有实质正文时禁止本步无故追问**
4. 缺 `userNeedDesc`（仅无实质正文可提炼时）→ **T-CREATE-NEED-ASK**；**有实质正文时禁止本步**
5. 缺 `valueDescription`（仅无实质正文可提炼时）→ **T-CREATE-VALUE-ASK**；**有实质正文时禁止本步**
6. **`expectedDeliveryDate`**：默认当天（`yyyy-MM-dd`）；用户已显式给出则采用；**禁止**默认 **T-CREATE-DATE-ASK**
7. **提出人**：用户已明示要指定/修改提出人 → **当前正在**拉 M05 → 按 §M05 点选规则拼 `proposer`；**未提则跳过**（不传字段）
7b. **验收人**：用户已明示要指定/修改验收人 → **当前正在**拉 M05 → 按 §M05 点选规则拼 `requirementAcceptancePerson`；**未提则跳过**（不传字段）。与提出人**独立**，禁止因改提出人而自动改验收人
8. **当前正在**拉 M01 → **T-META-PICK** 点选 `businessDomainId`（已沿用则可跳过）
9. 提交前复述：当前环境：{env_label}；base_url：`{base_url}`
10. **T-CREATE-CONFIRM**（须含标题、三正文全文、人员说明、计划交付；`| 项目 | 内容 |` 表格样式；若标题来自提炼填 `{contentSourceHint}`；提出人/验收人按是否指定分别展示）→ 用户选 1
10b. **确认后改口径**（用户选 2，或确认预览后改标题/三正文/领域/人员/交付日）：收齐变更后**重发** **T-CREATE-CONFIRM**，**禁止**未再确认即 OR01；改提出人/验收人仍走 §M05（彼此独立）
11. **当前正在**创建 → 先按 `boot.md` §Windows JSON 将 body 落到 `%TEMP%`（**首选 Write**；**禁止** `node -e` 内联中文）→ `original-requirement-api.mjs create --json body.json --out resp.json --human`（仅当用户指定时 body 含对应人员字段）
12. **当前正在**校验 → `verify-original-requirement-response.cjs`
13. **T-CREATE-DONE**（优先原样贴 `create --human`）；**session 已由 create CLI 自动写入** → Agent **禁止**再手写/覆盖（见 `boot.md` §会话）

### M05 点选规则（提出人 / 验收人）

| 命中数 | Agent 行为 |
|--------|------------|
| **1** | **直接采用**：拼 `姓名+工号`，口头复述后进入下一步（确认表或下一缺槽）；**免再问序号** |
| **≥2** | **T-META-PICK**（或等价序号列表）点选后再拼装 |
| **0** | 告知未找到，请换关键词或改手写意图（仍**禁止**手填工号/姓名拼串） |

> 仍须 `m05 --keyword … --pick` 拉元数据；**禁止**跳过 M05 手填。唯一命中免的是「再问一轮序号」，不是免 M05。

## 禁止

- 有可提炼正文时仍先问标题
- 有实质正文时仍追问原始需求描述、价值描述或计划交付日期
- 有实质正文时把痛点原文整段复贴为 `userNeedDesc`（须概括期望能力/范围/对象）
- 手填领域 id / 提出人 / 验收人；未提却传对应字段；传其余服务端托管字段；未调 CLI 报成功
- 改提出人时自动改写验收人（或反之）
- 为解析标题而新增/调用本子包外 parse / content-refine CLI（本版走 **`content_refine_agent`** · P-381）
- 受理状态 / 关联需求池 / 不采纳等未开放能力 → **T-BOUNDARY-WEB**（P-387）
- 写操作失败后**自动重试**
- **T-CREATE-CONFIRM** 省略三正文或人员/交付而只列标题与领域；或以 `- 字段：` 列表代替 `| 项目 | 内容 |` 表格
- create 成功后用 JSON/`Set-Content` 等**覆盖** session（破坏 `readSessionFile`）
- Windows 下用 `node -e`/`--eval` **内联**写含中文的 `body.json`（须 Write 或 `fs.writeFileSync` 落盘）
