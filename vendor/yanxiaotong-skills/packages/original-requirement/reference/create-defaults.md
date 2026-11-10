# 创建默认值与托管字段

> 契约：`open-api-contract.md` §OR01  
> **与 task / defect 对齐**：标题优先从用户输入解析/提炼；**无**独立 parse CLI（本版仅 Agent 规程）。  
> **同名对照（P-381）**：task/defect 的轨名 `content_refine` = **工具+golden**；本包轨名为 **`content_refine_agent`**（仅 Agent，禁调外包 CLI）。

## 客户端须收齐（六必填）

| 字段 | 收参方式 |
|------|----------|
| `title` | **优先** §标题解析；无法推断时 **T-CREATE-TITLE-ASK** |
| `businessPain` | 可从多段正文预填；缺则 **T-CREATE-PAIN-ASK** |
| `userNeedDesc` | **须**由 Agent 从用户输入自动提炼（见下节）；**禁止**默认 **T-CREATE-NEED-ASK**。仅无实质正文可提炼时才追问 |
| `valueDescription` | **须**由 Agent 从用户输入自动提炼（见下节）；**禁止**默认 **T-CREATE-VALUE-ASK**。仅无实质正文可提炼时才追问 |
| `expectedDeliveryDate` | **默认当天**（`yyyy-MM-dd`，按会话本地日历日）；**禁止**默认 **T-CREATE-DATE-ASK**。用户首句/后续已显式给出日期则采用用户值 |
| `businessDomainId` | M01 **T-META-PICK** |

## 服务端托管（不问 · 创建请求体勿传下列字段）

**创建（OR01）**：提出渠道（企微）、优先级（中）、绝对优先级（0）、价值类型（提升效率）、业务接口人、IT 产品规划、频次/年收益估算等。

**提出人 / 验收人（可选；彼此独立）**：

| 用户意图 | Agent 行为 |
|----------|------------|
| 首句/确认前**提到**提出人（如「提出人为刘朋举」「创建人改成…」） | **须** `m05 --pick`（禁止手填）。命中 **1** 条 → 直接采用并复述；**≥2** → 序号点选。拼 `proposer`（姓名+工号）写入创建 body；确认表展示具体人 |
| **未提**提出人 | **不传** `proposer`；确认表写「当前 Token 对应用户（服务端自动写入）」 |
| 首句/确认前**提到**验收人（如「验收人为高欢鑫」「验收人改成…」） | 同提出人：须 M05；1 条直采 / ≥2 点选；拼 `requirementAcceptancePerson`；与提出人独立 |
| **未提**验收人 | **不传** `requirementAcceptancePerson`；确认表写「当前 Token 对应用户（服务端自动写入）」 |

> **禁止**手填姓名/工号。提出人与验收人**彼此独立**（均：未指定→Token，已指定→指定人）；改其一**禁止**自动改写另一。  
> **修改（OR02）**：`proposer` / `requirementAcceptancePerson` 均可改（均须 M05，命中规则同上）；其余托管字段不可改。  
> 细则见 `phases/create-phase.md` §M05 点选规则。

## 会话沿用与写入

- **沿用**：有 `last_create_defaults.businessDomainId`（及名称）时 → **T-SESSION-REUSE-ASK**；选 1 则跳过 M01。
- **写入**：**仅** `original-requirement-api.mjs create` 成功后的 `writeSessionFile`；Agent **禁止**在 **T-CREATE-DONE** 后再手写/覆盖 session。
- **格式**：缩进 YAML 形（`last_create_defaults:` / `last_original:` 下各 2 空格字段），**不是** JSON；应急修复须与 `tools/lib/original-requirement-tools.mjs` · `writeSessionFile` 同形。

---

## 标题解析（对齐 task / defect · Agent 规程）

剥离创建动词、环境词、「原始需求」等路由词后，得到 `nl_remainder`。

| 优先级 | `title` 来源 | 说明 |
|--------|--------------|------|
| 1 显式关键词 | `标题` / `名称` 后片段 | 原样采用（截断至合理长度） |
| 2 内容提炼 | 见下节 **`content_refine_agent`** | Agent 概括，**≤ 40 字** |
| 3 NL 短文本 | 首段 / 首句作标题 | 单段且较短时可整段作标题 |
| 4 兜底 | `missing` → **T-CREATE-TITLE-ASK** | 仅「新建/创建原始需求」无实质正文时 |

**禁止**：有可提炼正文时仍默认先发 **T-CREATE-TITLE-ASK**。

### 内容提炼轨（`content_refine_agent` · 仅 Agent · P-381）

大段粘贴时由 **Agent** 提炼标题，并**强制**预填/生成三正文槽（痛点、原始需求描述、价值）；**不调用** task/defect 的 `content-refine` / `apply-refine` 工具（与同名轨 `content_refine` **执行面不同**）。

**触发（满足任一）**：

1. 口令：`提炼` / `根据以下内容` / `帮我总结` / `帮我提炼`
2. `nl_remainder` **≥ 200 字**
3. `nl_remainder` **≥ 80 字** 且呈多段结构（痛点 / 诉求 / 价值 等可辨段落 **≥ 2**）
4. **原始需求描述（强制）**：只要 `nl_remainder` 有实质正文（非仅路由短句），**必须**同轮写出 `userNeedDesc`（可从痛点**推断**期望能力、范围与使用对象）；**禁止**因「原文无独立诉求段」而改问用户
5. **价值描述（强制）**：只要 `nl_remainder` 有实质正文（非仅路由短句），**必须**同轮写出 `valueDescription`（可从痛点/诉求**推断**业务收益）；**禁止**因「原文无独立价值段」而改问用户

**不触发**：口令 `原样创建`；仅路由短句无正文；已显式给出 `标题：…`（走优先级 1）。  
（**例外**：`userNeedDesc` / `valueDescription` 在有实质正文时仍须强制提炼，不受「不触发」影响。）

| 字段 | Agent 规则 |
|------|------------|
| `title` | **≤ 40 字**；一句话概括**要什么能力/解决什么问题**；禁止整段粘贴或流水账 |
| `businessPain` | **优先**取原文背景/痛点段；若整段皆为痛点叙述可**原文或轻度整理**预填；仅无实质正文时 → **T-CREATE-PAIN-ASK** |
| `userNeedDesc` | **优先**取原文诉求/范围/能力清单段；无独立段时须根据痛点**概括**期望能力、给谁用、解决到什么程度（1～5 句）；**禁止**整段复贴痛点原文当描述；仅无实质正文时 → **T-CREATE-NEED-ASK** |
| `valueDescription` | **优先**取原文价值/收益段；无独立段时须根据痛点与诉求**概括**落地收益（1～3 句）；仅无实质正文时 → **T-CREATE-VALUE-ASK** |

**计划交付默认**：

- 未显式给出日期 → `expectedDeliveryDate =` 当天本地日期（`yyyy-MM-dd`）
- 用户写了 `计划交付` / `期望交付` / 明确 `yyyy-MM-dd` → 采用用户值
- **禁止**创建流程默认发出 **T-CREATE-DATE-ASK**

**Agent 自检（P-385 · 进确认前须全过）**：

- [ ] 标题 ≤40 字且非原文首句堆砌
- [ ] 有实质正文时 **`businessPain` / `userNeedDesc` / `valueDescription` 均已预填或自动提炼**（未无故追问描述或价值）
- [ ] `userNeedDesc` 写的是「期望能力/范围/对象」，**非**痛点原文整段复贴
- [ ] `expectedDeliveryDate` 已为当天或用户显式日期（未无故追问交付日）
- [ ] **禁止**有大段正文时仍先发 **T-CREATE-TITLE-ASK** / **T-CREATE-NEED-ASK** / **T-CREATE-VALUE-ASK**
- [ ] **T-CREATE-CONFIRM** 已展示标题、三正文、人员说明、计划交付（`| 项目 | 内容 |` 表格，见 `response-templates.md`）
- [ ] 有 `proposer` 时确认单展示具体人；未指定时展示 Token 说明且 body **未**带 `proposer`
- [ ] 有 `requirementAcceptancePerson` 时确认单验收人行展示具体人；未指定时展示「当前 Token 对应用户（服务端自动写入）」且 body **未**带该字段
- [ ] 改提出人时**未**自动改写验收人预览（除非用户同时指定）
- [ ] 确认单标注「内容提炼（Agent）」

**示例**（用户首句「新建原始需求」+ 大段「IPD 发布上线卡滞」痛点正文，无独立诉求段）：

- 提炼 `title`：`对齐 IPD 流程与实际交付节奏`（≤40 字）
- 预填 `businessPain`（痛点原文/整理）
- **自动生成** `userNeedDesc`（例：期望打通发布上线与需求评审等前置节点，使线上流程与线下已完成活动一致，消除开发与规划跨角色阻塞）
- **自动提炼** `valueDescription`；`expectedDeliveryDate`=当天 → 再收业务领域 → **T-CREATE-CONFIRM**（标注内容提炼，含全文预览；**禁止**先发 **T-CREATE-NEED-ASK**）
