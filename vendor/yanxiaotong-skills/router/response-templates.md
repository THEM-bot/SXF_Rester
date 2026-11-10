# 父包 · 用户可见话术模板（Agent SSOT · 强制）

> **何时查阅**：`@yanxiaotong-skills` 无意图首屏、路由澄清。  
> **子包**业务话术见 `packages/demo/reference/ui/response-templates.md`（子包**禁止**引用本文件）。

## 通用规则

> **§0 优先**：须先完成 `router/boot.md` **§0a 环境自动解析** + **§0b token 门禁**。**禁止**每轮 `@` 先发 **T-ENV-ASK**（Q22）；路由卡须含 `selected_env`。无 token 时**禁止** T-FIRST-SCREEN。以下规则仅在 **env 已解析 + token 已通过** 后适用。

1. **入口固定（P-411）**：凡 `@yanxiaotong-skills`（**@ 后无论有无输入**）须先执行 `node tools/entry-bootstrap.mjs --text "完整首句"`；§0c 扫描更新在本命令内完成；**禁止**因带描述/意图跳过。按 `mode` **原样贴** `user_visible_text`（`first_screen` = **T-FIRST-SCREEN**；`handoff` 非空时 = **T-DAILY-SYNC-BANNER**）。若 JSON `self_update_pending` → **同轮先**跑 `self_update_apply_cmd`（P-412）；apply 成功 → **T-SYNC-SELF-UPDATE** 并**停本轮**（禁止再贴菜单/handoff）。
2. **选项必带序号**：凡让用户选择/确认，须 `1.` `2.` … + 结尾 **「请回复序号（如 `1`）。」**；**禁止**「逗号分隔」「或输入 xxx」等与序号并存的自由文本收参（路径 / token / plaza 链接等业务必填除外）。
3. **确认菜单须完整**：同类场景（更新确认 / 重试 / 取消）菜单须含**全部**可执行项；**重新比对**须为显式序号项，**禁止**仅在正文提示而无菜单项（P-269）。
4. **列表字段统一**：跨子包表格列名、语气一致；skill-sync 列表**不含**「本地版本」列，说明列**不写**版本号（P-270）。
5. **禁止**自由改写首屏结构（不得删「说明」段、不得合并为一段话）。
6. **禁止目录导览**：仅 `@` 未说明意图时，**不得**用 Read 扫 `router/` 后输出结构总结；**必须**原样贴 `entry-bootstrap` 的 `user_visible_text`（env 已解析 + token 已通过）。
7. **路由至 demo 后**：在路由卡之后**紧接** **T-ROUTER-DEMO-HANDOFF**（或子包 T-QUICK-START-ACK），**同轮进入**收项目路径。
8. **需用户提供的信息须突出**：自由输入用独立一行 `**请提供 …**` + 说明 + 示例；**不得**把核心字段埋在进度句 `当前正在…` 里。
9. **模板原文优先**：用户可见回复须套用对应 `T-*` 模板全文；**禁止**省略段落、合并选项、或用自由发挥替代 SSOT 话术（P-272）。
10. **CLI 输出原样贴**：`entry-bootstrap` 的 `user_visible_text` / `first-screen.mjs` stdout **禁止** paraphrase、删段或改写；须完整原样呈现（P-297）。

---

## T-FIRST-SCREEN（无意图首屏 · 必用 · P-273）

> **何时**：`@yanxiaotong-skills` 无意图 · env + token 已通过。  
> **生成**：`node tools/entry-bootstrap.mjs --text "…"` → `mode=first_screen` → **原样贴** `user_visible_text`（兼容：`first-screen.mjs` stdout）。

```text
研效通技能助手 · 当前环境：{env_label}{env_source_suffix}

{若本轮执行了 §0c · compact 单行：}
—— 今日自动同步 —— {daily_sync_block}

{若 selfUpdate（apply 已成功）：主技能包已更新… 另起一段；本轮应停业务勿再选菜单}

—— 请选择要做的事 ——
1. Demo 打包上传
2. 原始需求 — 创建 / 查询 / 修改
3. 需求池 — 创建 / 查询 / 修改 / 作废
4. 任务 — 创建 / 查询 / 修改 / 取消
5. 缺陷 — 创建 / 查询 / 修改 / 流转 / 关闭
6. 技能包 — 安装 / 更新
7. 组织待办 — 创建 / 查询 / 修改 / 追加进展
8. 问题单 — 创建 / 获取元数据

环境：{env_label}{env_source_suffix}
须令牌：序号 1、2、3、4、5、6、7、8

请回复序号（如 `1`）。

> 若当前默认「生产」非你所用环境，可说「换 UAT」「改本地」切换（Q25）。
```

> **换行纪律**：环境行、同步行、菜单标题之间须有**空行**（`\\n\\n`），禁止挤成一行；聊天 Markdown 会把单换行折叠为空格。

> **§0c 展示（菜单上）**：compact 必须为**单行** `—— 今日自动同步 —— {结果}`（与「请选择要做的事」同款分隔）；detail 可为标题行 + 下表。非每日首次 → 省略该段。

> **Agent**：**禁止**拆分两条消息；**禁止**改写菜单或说明结构；**原样贴**时保留空行。

---

## T-DAILY-SYNC-BANNER（有输入/意图 · §0c 横幅 · P-411）

> **何时**：`entry-bootstrap` 的 `mode=handoff` 且 `user_visible_text` 非空。  
> **生成**：即 JSON 字段 `user_visible_text`（**原样贴**，禁止改写）。

```text
—— 今日自动同步 —— {daily_sync_block}
{若 self_update（apply 已成功）：主技能包已更新，建议重新 @yanxiaotong-skills 后再选菜单。}
```

> 若仅 `self_update_pending`（尚未 apply）：**禁止**贴本横幅后继续 handoff；须先跑 `self_update_apply_cmd`。  
> apply 成功后发 **T-SYNC-SELF-UPDATE** 并停本轮；**仅**非自更新的日常同步横幅之后才可继续业务 handoff。

---

## T-DAILY-SYNC-COMPACT（§0c · 全成功 / 无异常 · P-273）

```text
技能包已自动更新：扫描 {scanned} 项 · 更新 {update_success} 项 · 成功 {update_success} 项
```

或 `技能包已是最新（扫描 {scanned} 项）` · `技能包：本地未发现已安装技能`

---

## T-DAILY-SYNC-DETAIL（§0c · 有失败或跳过异常 · P-273）

```text
技能包自动同步结果：

目录 `{skillsRoot}`

| # | 技能 | skillId | 比对 | 状态 | 更新结果 | 说明 |
{rows}

合计：扫描 {scanned} 项 · 可更新 {updatable} · 已尝试更新 {attempted} · 成功 {success} · 失败 {failure} · 跳过 {skipped}
```

---

> **已废止（P-273）**：**T-DAILY-SYNC-DONE**、独立 **T-INTENT-MENU** 首屏 → 一律使用上文 **T-FIRST-SCREEN**（`first-screen.mjs` 一条消息输出）。

---

## T-ENV-SWITCH（用户主动切环境 · 可选 · Q22）

> **何时**：用户说「切换环境」「换环境」「改传」等，且句中**无法解析**目标环境。**非**每轮门禁。

```text
请选择要切换的环境：

1. 本地
2. UAT
3. 生产

请回复序号（如 `1`）。
```

**Agent**：用户选序号后 → `node tools/env-session.mjs write --index {n}` → 复述新环境 → 继续业务或 token 门禁。

---

## T-TOKEN-ASK（父包门禁 · 所选环境无 token）

```text
当前环境「{env_label}」下还没有可用的开放 API 令牌。

**请提供 X-Open-Api-Token**

在研效通 Web「开放 API / 令牌管理」申请；对话中不回显完整令牌。

若暂时没有令牌：
1. 先去申请后再 @yanxiaotong-skills
2. 或回复 **浏览** — 仅查看能力说明（不调用 API、不执行业务菜单）
3. 或首句指定 **UAT** / **本地** 环境后重试（默认生产须生产令牌 · Q25）

请回复序号（如 `1`），或直接粘贴令牌。
```

---

## T-TOKEN-SAVED

```text
令牌已保存到本地（环境：{env_label}，按环境加密存储），后续将静默使用。
```

---

## T-TOKEN-MISS-STOP

```text
没有开放 API 令牌无法调用接口，本轮先到这里。

下次 @yanxiaotong-skills 时会自动使用默认环境（生产）并确认令牌，再问你具体要做什么。
```

---

## T-SUBPKG-REDIRECT（误 @ 子包 · Q15）

```text
请改用 @yanxiaotong-skills 进入研效通技能（选 Demo 或需求等能力），不要直接 @ 子包技能名。
```

---

## T-ROUTER-DEMO-HANDOFF（路由至 demo · ready · **紧接路由卡**）

> **何时**：用户选 **1** / 说「demo 打包」「上传」等，路由卡 `package: demo`、`status: ready` 之后。**同一条或紧接一条**发出；**禁止**以 router 文件总结结束。

```text
已路由至 Demo 打包上传（yanxiaotong-demo）。

当前环境：{env_label}。
base_url：`{base_url}`

**请提供项目路径**

要检查并出包的目录，须含以下之一：
- `package.json`（如 Vite / Vue 项目）
- `index.html`（纯静态页面）

示例：`D:\work\demo-test\my-app`

可直接回复路径，或 @ 项目文件夹。
```

> **Agent**：若用户**首句已给**项目路径 + 上传意图 → 可改发子包 **T-QUICK-START-ACK** 并进入检查（见 `packages/demo/reference/instructions.md` 速查）。**禁止**只输出本模板后停止。  
> **同轮下一步（P-407）**：加载 `packages/demo/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-REQ-HANDOFF（路由至 requirement · local:ready · **紧接路由卡**）

```text
已路由至需求池操作（yanxiaotong-requirement）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建需求（需求池）
2. 查询需求
3. 修改需求
4. 作废需求

请回复序号（如 `1`）。
```

> **Agent**：用户首句已说明**创建 / 修改 / 作废**时可复述跳过本菜单，**同轮**将内部路由卡 `operation` 设为 `create`/`update`/`cancel`（见 `router/operation-resolution.md` · P-220）；**仅说「查询」**（无 `REQ-`）**不得**视为已明确操作类型——进入子包后**必须**先发 **T-QUERY-TYPE-ASK**（再选详情/列表），`operation` 暂保持 `null`。**禁止**只输出本模板后停止。  
> **同轮下一步（P-407）**：加载 `packages/requirement/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-TASK-HANDOFF（路由至 task · local:ready · **紧接路由卡**）

```text
已路由至任务操作（yanxiaotong-task）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建任务
2. 查询任务
3. 修改任务
4. 取消任务

请回复序号（如 `1`）。
```

> **Agent**：用户首句已说明**创建 / 修改 / 取消**时可复述跳过本菜单，**同轮**将内部路由卡 `operation` 设为 `create`/`update`/`cancel`（见 `router/operation-resolution.md`）；**仅说「查询」**（无 `TASK-`）**必须**先发子包 **T-QUERY-TYPE-ASK**（再选详情/列表）。**禁止**只输出本模板后停止。  
> **同轮下一步（P-407）**：加载 `packages/task/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-DEFECT-HANDOFF（路由至 defect · local:ready · **紧接路由卡**）

```text
已路由至缺陷操作（yanxiaotong-defect）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建缺陷
2. 查询缺陷
3. 修改缺陷
4. 流转状态
5. 关闭缺陷

请回复序号（如 `1`）。
```

> **Agent**：用户首句 NL 已解析 `operation` 时可跳过本菜单，直进子包 `parse-intent` → 对应 phase（见 `router/operation-resolution.md`）。**仅说「查询」**（无 `TD-`）**必须**先发 **T-QUERY-TYPE-ASK**（再选详情/列表）。  
> **同轮下一步（P-407）**：加载 `packages/defect/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-OT-HANDOFF（路由至 org-todo · local:ready · **紧接路由卡**）

```text
已路由至组织待办操作（yanxiaotong-org-todo）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建组织待办
2. 查询组织待办
3. 修改组织待办（含改状态）
4. 追加进展

请回复序号（如 `1`）。
```

> **Agent**：用户首句已说明 **创建 / 修改 / 追加进展** 或 `OT-` + 查/详情/改/进展 时，**同轮**将内部 `operation` 设为 `create`/`update`/`append-progress`/`detail`/`list`（见 `router/operation-resolution.md` **§8**）。**仅说「查询」**（无 `OT-`）**必须**先发 **T-QUERY-TYPE-ASK**。  
> **同轮下一步（P-407）**：加载 `packages/org-todo/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-PT-HANDOFF（路由至 problem-ticket · local:ready · **紧接路由卡**）

```text
已路由至问题单操作（yanxiaotong-problem-ticket）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建问题单
2. 获取问题单元数据

请回复序号（如 `1`）。
```

> **Agent**：用户首句已说明 **创建问题单** 或 **获取元数据** 时，**同轮**将内部 `operation` 设为 `create` / `metadata`（见 `router/operation-resolution.md` **§9**）。  
> **同轮下一步（P-407）**：加载 `packages/problem-ticket/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-SYNC-HANDOFF（路由至 skill-sync · ready · **紧接路由卡**）

> **分支**：见 `routing-rules.md` §skill-sync operation。有安装意图或 plaza 链接 → **T-SYNC-INSTALL-PROGRESS**；明确更新 → 下文；否则 → **T-SYNC-MODE-ASK**。

```text
已路由至技能包安装与更新（skill-sync）。

当前环境：{env_label}。
```

> **Agent（更新模式）**：同轮 `check-all` → **T-SYNC-LIST**；空列表 → **T-SYNC-NO-MANIFEST-INSTALL-ASK**。  
> **Agent（安装模式）**：解析 skillId → **T-SYNC-INSTALL-PROGRESS** → `install`。**禁止**未确认即写盘。  
> **同轮下一步（P-407）**：加载 `packages/skill-sync/reference/boot.md` → `instructions.md`。

---

## T-ROUTER-OR-HANDOFF（路由至 original-requirement · ready · **紧接路由卡**）

```text
已路由至原始需求操作（yanxiaotong-original-requirement）。

当前环境：{env_label}。
base_url：`{base_url}`

请说明要做哪一种：
1. 创建原始需求
2. 查询原始需求
3. 修改原始需求

请回复序号（如 `1`）。
```

> **Agent**：用户首句已说明**创建 / 修改**时可复述跳过本菜单，**同轮**将内部路由卡 `operation` 设为 `create`/`update`（见 `router/operation-resolution.md`）；**仅说「查询」**（无 `OR-`）**不得**视为已明确——进入子包后**必须**先发 **T-QUERY-TYPE-ASK**。**禁止**只输出本模板后停止。受理状态 / 关联 / 不采纳 → 子包 **T-BOUNDARY-WEB**。  
> **同轮下一步（P-407）**：加载 `packages/original-requirement/reference/boot.md` → `instructions.md`。

---

## T-PLANNED-NOTIFY（保留 · 仅其它暂未开放能力时可复用）

```text
您选择了：{capability}

说明：该能力开放 API 暂未对接，当前无法执行。请改用其它序号或结束本轮。

请回复序号：
1. 返回首屏菜单
2. 结束

请回复序号（如 `1`）。
```

---

## T-REQ-CLARIFY（对象类型歧义 · 非首屏）

> **何时**：仅 **CRUD** / **增删改查**，或需求池 URL + 创建却未指明任务/缺陷等，仍无法判断对象类型。  
> **口令约定（P-413）**：**带「原始」** = 原始需求；**不带「原始」**的「需求」= 需求池。裸「创建需求」**不得**再走本模板（应直进 `requirement`）。

```text
请明确要操作的对象类型，请回复序号：

1. 原始需求（口令须带「原始」· 编号 OR-…）
2. 需求（不带「原始」= 需求池 · 编号 REQ-…）

说明：登记业务诉求/痛点 → 选 1；进需求池排期交付 → 选 2。
若要建任务或提缺陷，请直接说「创建任务」/「提缺陷」。

请回复序号（如 `2`）。
```

---

## T-MULTI-INTENT-SPLIT（多意图 · Demo + 原始需求等 · **必用** · P-379）

> **何时**：用户**同一句**或**同轮**同时命中多个子包（如「打包 demo 并创建原始需求」「上传 zip 再改 REQ-xxx」）。**禁止**在同一子包会话内串行完成另一子包业务。  
> **序号与首屏 1～6 对齐**；末项为「先不做」。

```text
您同时提到了多类操作，本轮只能先做其中一件。

请回复序号，选择本轮要先完成的：

1. Demo 打包上传
2. 原始需求操作（创建 / 查询 / 修改）
3. 需求池操作（创建 / 查询 / 修改 / 作废）
4. 任务操作（创建 / 查询 / 修改 / 取消）
5. 缺陷操作（创建 / 查询 / 修改 / 流转 / 关闭）
6. 技能包安装与更新
7. 先不做，我分开说明

请回复序号（如 `1`）。
```

> **Agent**：用户选 **1～6** → 路由对应子包并完成全流程后**结束本轮**；选 **7** → 结束本轮待用户分句说明。若仍要做其它能力，请用户**再次** `@yanxiaotong-skills`。**禁止**在单个子包内串行另一子包 API。**禁止**把「原始需求」误路由到「需求池」。

---

## T-API-UNREACHABLE（服务/网关不可达 · 通模 · P-409）

> **何时**：HTTP 502/503/504、网络超时、ECONNRESET，或整体服务不可达。Demo 元数据场景可优先 **T-META-UNREACHABLE**。

```text
当前环境「{env_label}」暂时无法访问研效通服务（网络超时或网关错误）。

请回复序号：
1. 稍后重试同一操作
2. 改用其它环境后重试（请回复：本地 / UAT / 生产）
3. 结束本轮

请回复序号（如 `1`）。
```

> **Agent**：**禁止**伪造成功编号；写操作失败后**禁止**自动重试。选 2 → `env-session write` 或请用户重新 `@` 并带环境词。

---

## 跨包模板等价表（P-403 · 维护备忘）

| 场景 | 父包 / 公共 | demo | original-requirement | requirement | task | defect | skill-sync |
|------|-------------|------|----------------------|-------------|------|--------|------------|
| 门禁无 token | **T-TOKEN-ASK** | **T-DEMO-TOKEN-ASK** | — | — | — | — | — |
| 创建前确认 | — | — | **T-CREATE-CONFIRM** | 多用 **T-DOC-CONTENT-CONFIRM** 等 | **T-CREATE-CONFIRM** | **T-DEFECT-CREATE-*** / QUICK 兼容 | — |
| 去重/歧义澄清 | **T-REQ-CLARIFY**（OR vs 需求池） | — | — | — | **T-TASK-DEDUP-CLARIFY** | — | — |
| 服务不可达 | **T-API-UNREACHABLE** | **T-META-UNREACHABLE**（元数据） | 套父通模 | 套父通模 | 套父通模 | 套父通模 | 套父通模 |
