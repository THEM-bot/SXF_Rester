# create-phase · 创建需求（R01）

> 契约：`open-api-contract.md` §R01 · 进度：`ui/progress-display.md` · 后端：`OpenRequirementController#create`  
> **基于原始需求**：`create-defaults.md` · 机侧 `parse-create --text`

## 进入条件

- 父包 token 已通过；`operation: create`
- 六必填齐备前**禁止**调用 R01
- 用户 `@` **需求文档目录**（路径含 `REQ-` 与 `前端` 或 `后端` 子目录）→ **先发 T-DOC-FOLDER-ACK**；用户选 **1** 后方可读文档提取标题/描述，**仍须**用户确认后再 R01
- **首句已 `@` 单篇/单目录（P-211）**：用户**首句**即给出 `@` 文档（含 `REQ-` 或 `.md`）→ **跳过步骤 2 的 T-CREATE-TITLE-ASK / T-CREATE-DESC-ASK**，走 **T-DOC-FOLDER-ACK → T-DOC-CONTENT-CONFIRM**
- **一次 `@` 多个文档（≥2）或口令含「批量创建」/「自创」（P-212）**：进入 **批量创建分支**（见文末）；**禁止**只创建第一条
- **「在 OR / 原始需求 … 下」新建/创建需求（快捷轨）**：同轮 `parse-create --text` → 有 `original_ref` 则拉原始需求详情取 `data.id`（提炼用）→ body 可写 id / `OR-` / URL / `originalNo` → **按 create-defaults §3 自动提炼标题/描述** → **必须**以 **T-CREATE-CONFIRM** 表格展示参数（含关联原始需求）
  - **口令壳等价**：`创建需求 原始需求为: OR-xxx` / `原始需求是 OR-xxx`（无「在…下」）同样进快捷轨；机侧须剥净路由壳，**禁止**标题写成「原始需求为」
  - 若首轮提炼结果仅为路由壳 → **同轮** `parse-create --or-json` / `refine-create --or-json` 重提炼后再往下走

## 步骤

0. **（可选）OR 快捷轨**：口令命中 `create-defaults.md`  
   - `requirement-api.mjs parse-create --text "用户句"`  
   - `needs_original_resolve` → `original-requirement-api.mjs detail --id {OR|id}` → 取 `data.id` / `originalNo` / `title` / 正文  
   - body.`originalRequirementId` 可为 detail 的 `data.id`，或直接写可靠的 `OR-` 编号 / 详情 URL（后端解析）；可选同义 `originalNo`  
   - **禁止**猜不存在的 id；提炼标题/描述仍须有实质正文或 OR detail  
   - **提炼**：用户有实质说明 → `refine-create --text` / `parse-create --or-json` 从用户输入提炼；**否则**从原始需求正文提炼（`refine_source: original`）  
   - 提炼后 title+description 齐备 → **跳过**步骤 2 询问，直接进确认表；缺描述 → **T-CREATE-DESC-ASK**（**禁止跳过**）  
   - OR 含领域时可预填并跳过步骤 3 的 M01（确认表仍展示）
1. **归属预填（SC-260802-005 · 优先级 SSOT：`upload-defaults.md`）**  
   - **同轮**先跑 `resolve-upload-defaults --match`（可 `--yml` / `--doc-root`）  
   - **按字段**：yml 唯一命中 → 直接采用（来源 `yml`）→ 缺项静默带入会话 `last_create_defaults`（来源 `会话`，须有名称）→ 仍缺再 M 点选（来源 `手选`）  
   - `feature_team_name`：**先 M06 再 M02**（双义）；仅命中小组时 `projectId` 仍须会话/手选补齐  
   - **禁止**在已按上序补齐（或即将点选）时再发 **T-SESSION-REUSE-ASK**；勿复述「读到 yml 名但未命中」后又问是否沿用  
   - **层级 / 优先级 / 分类**：不在 yml 段内；有会话则静默带入 `requirementLevel` / `priority` / `requirementType`（若曾保存）；无则步骤 5/7 补齐  
   - **口令 `沿用`（P-214）**：显式口令时仍可整组带入会话默认；**口令 `重新选择`/`自选`** → 强制走点选  
   - 仅 id 无名称的会话字段 → 视为不可用，回退点选，**禁止**只展示裸 id
2. 收 `title`（≤200 字）→ **T-CREATE-TITLE-ASK**；收 `description`（缺则问 → **T-CREATE-DESC-ASK**，**一次一问**；**描述必填，禁止跳过**）
   - **文档驱动（P-211 / P-213）**：用户 `@` 文档 → **跳过**本步问答，读文档后发 **T-DOC-CONTENT-CONFIRM**（只确认元数据；描述**一律全文上传**，确认表**不**预览正文、**不**问摘要/完整）；确认后再进入步骤 3；文档无描述须补问，**禁止**空描述提交
   - **描述 HTML（P-241）**：R01 前由 CLI 将 Markdown/纯文本转 HTML；**禁止**依赖 Agent 手写 `<p>`；已是块级 HTML 则原样 + P-240 中和
   - **防摘要进库（硬 · 对应「不完整 / 纯文本摘要」）**：文档轨 R01 **须** `create-from-doc --path` 或 `description-file` 指向**原文档全文**；**禁止**把确认预览、对话摘要、前 N 字截断写入 `description`
   - **文档驱动创建命令（SC-260827-001）**：六必填齐后优先  
     `requirement-api.mjs create-from-doc --path {md} --reuse-defaults`（或 `--json defaults.json`）  
     自动解析属性并写入 `implementationType` + `generateModeName`；**禁止**只拼六必填、丢弃文档模式属性
   - **序号 + 补充（P-216）**：用户回复形如 `{序号} {补充}`（如 `1 标题改为X`）→ **先取序号**，余下作补充修正 `title`/`description`/`priority`/`requirementType`/`generateModeName`；**禁止**把整句当序号
   - **OR 快捷轨**：已提炼齐备 → **跳过**本步；仅缺项才问（描述无「跳过」）
   - **故事点**：`parse-doc` 已解析则带入 body.`storyPoint`；确认表展示；未解析不阻断
3. **当前正在**拉 M01 → **T-META-PICK** 点选 `businessDomainId`（步骤 1 已预填则**跳过**）
   - **CLI（P-223）**：须 `requirement-api.mjs m01 --with-project-hints`（**禁止** Windows 下用复杂 `node -e` + `execSync` 批量探测 M02）
   - **空列表**：说明该环境无领域数据，勿猜 id；请用户联系管理员或换环境
   - **无项目脚注（P-099 / P-116）**：`projectHint` 为空表示有项目；`（暂无关联项目）` / `（未能探测关联项目，请慎选）` 追加到选项名后
   - **分页（P-136）**：M01 数量 ≤ 20 可拉全量展示；>20 须用 **T-META-PICK-PAGE** 分页或关键词筛选，禁止静默输出超长列表
   - 用户选中后若 M02 仍空 → **T-M02-EMPTY-REPICK**
   - **OR 预填领域**：已从原始需求带出且用户未改 → **跳过**本步点选
4. **当前正在**拉 M02（`--businessDomainId {id}`）→ 点选 `projectId`（步骤 1 已预填则**跳过**）
   - **空列表**：发 **T-M02-EMPTY-REPICK**，**禁止**猜 `projectId`、**禁止**收 M09/M03；须重新 **T-META-PICK** 选其它领域
   - **400 不属于领域**：`error-humanize.md` → 重新 M02 点选
5. **当前正在**拉 M09 → 点选 `requirementLevel`（**Epic** / **Feature** / **Story**，对齐 `RequirementOpenValidationSupport`；步骤 1 已带会话层级则**跳过**）
6. **当前正在**拉 M03 → 点选 `appServiceId`（步骤 1 已预填则**跳过**）
   - **空列表**：如实说明，勿手填 id
   - **分页（P-135）**：M03 超过 10 条须用 **T-META-PICK-PAGE** 提供下一页/上一页/关键词搜索；禁止只展示第一页后无指引
7. 可选字段按需；**不主动收** `priority`（Q7，默认「中」；步骤 1 已带会话优先级则用会话值）；若用户指定且未给档位 → **T-PRIORITY-PICK**
7b. **AI-Coding 生成模式（对齐 m01 拉领域 · SC-260827-001）**：实现方式为 AI-Coding（或文档驱动且非传统）时  
   - **当前正在**拉生成模式 → `requirement-api.mjs generate-modes --human`（别名 `gm`）  
   - **T-META-PICK** 点选；写入 `generateModeName`（**精确** `modeName`，禁止臆造）  
   - 文档已解析到有效名且在列表中 → 确认表可预填，仍允许改选  
   - `[待确认]` / 缺失 / 列表无匹配 → **禁止** R01，须先点选  
   - **传统开发**：跳过本步  
8. **提交前复述环境**（P-139）：当前环境：{selected_env.env_label}；base_url：`{selected_env.base_url}`
9. **T-CREATE-CONFIRM**（`| 项目 | 内容 |` 表格；**有关联时须含「关联原始需求」行**；须含实现方式/生成模式）→ 用户选 **1** 后方可创建；选 **2** → 改参后重回本步（改归属即「用户新增/纠正」入口）
10. **当前正在**创建 → `requirement-api.mjs create --json body.json [--out resp.json]`（或 `create-from-doc`）
   - 有关联时 body 可写 `"originalRequirementId":"<id|OR编号|详情URL>"` 和/或 `"originalNo":"OR-…"`（后端解析；仍推荐 detail 取 id 以便同轮提炼标题/描述）  
   - **P-130**：`businessDomainId` / `projectId` / `appServiceId` 必须为字符串；`originalRequirementId` 若为纯数字 id 亦须字符串；CLI 会兜底 `String()`，Agent 手写 JSON 仍禁止 number
   - **P-206**：Windows **禁止**管道 + `--json -` + `--out`；body/resp **均**落盘后再调 CLI
   - **P-131 / P-138 / P-239**：Windows 禁止用 PowerShell `Set-Content`/`Out-File` 或 `node -e` 内联中文写 JSON；**须**下列之一写出 body 后再 create：① 编辑器/`Write` 直接落 `%TEMP%` body；② `write-json-body --json meta.json [--description-file desc.txt] --out %TEMP%/body.json`；③ temp `.mjs`（命令行无中文）内 `fs.writeFileSync`
   - **SC-260827-001**：body 含 `implementationType`；AI-Coding 须含有效 `generateModeName`（确认表已过闸）；**禁止**无模式调用
11. **当前正在**校验 → 响应写临时文件 → `verify-requirement-response.cjs`（**必做**）；失败 → `error-humanize.md`
   - 可自动修正的 Agent 内部问题（如 id string 化）可同轮静默重试；**禁止**向用户展示「Large ID…」等调试句
12. **T-CREATE-DONE**（P-228：字段与批量行对齐；**有关联时第二表增加「关联原始需求」**）；写 session（Q8）

## 交付

输出 verify 通过后 **T-CREATE-DONE**（含详情链接；有 OR 则展示关联），或 `create --human`（`formatCreateText`）；`mappingKey` 仅写 session。

## 文档解析（P-225 · P-226 · SC-260802-005 · SC-260827-001）

- **主文档路径**：`requirement-api.mjs parse-doc --path {file|dir}`（SSOT：`scripts/lib/parse-requirement-doc.cjs`）
- **目录 @ 选取**：优先 `{目录名}.md` → 根目录唯一 `.md`（排除 README/待办/执行步骤）→ 多篇则 **T-DOC-FOLDER-ACK** 让用户选
- **优先级**：header `**优先级**` > 属性表 `| 优先级 |` > 正文 `优先级:`；**冲突**时在 **T-DOC-CONTENT-CONFIRM** 展示各来源并请用户确认
- **故事点**：属性表 `| 故事点 | N SP |` 或等价写法 → `parsed.storyPoint`（落库为**非负整数**；1 SP = 1 天）；含小数则 **向上取整**（如 `8.5` → `9`），warnings 含 `story-point-ceiled` 并在确认表提示；缺失不阻断，warnings 含 `story-point-missing`，确认表提示「未解析到故事点」
- **AI-Coding生成模式（SC-260827-001）**：属性表 `| AI-Coding生成模式 |` / `| 生成模式 |`，或 `**AI-Coding生成模式**:` / 故事卡列表 `- 生成模式：…`；`[待确认]`→pending；缺省→missing；传统开发豁免。确认表可改选；R01 传 `generateModeName`（已发布精确名）
- **实现方式**：属性表 `| 实现方式 |` 或故事卡列表 `- 实现方式：AI-Coding`；未写且非传统时按 Q6 默认 `AI_CODING`，仍须有效生成模式（D4）
- **product-repos.yml 预填**：`resolve-upload-defaults [--yml|--doc-root] [--match]`（SSOT：`scripts/lib/parse-upload-defaults.cjs` · 说明：`reference/upload-defaults.md` **归属预填优先级**）
  - 优先读 `{doc}/product-repos.yml` 的 `requirement_upload_defaults`
  - 名称 → M01 /（M06 特性小组 **或** M02 关联项目，见 `upload-defaults.md` 双义）/ M03；唯一命中可预填，来源标 `yml`
  - 无效/多义/未命中 → **静默**回退会话或点选；**禁止**静默猜 ID；**禁止**叠发 T-SESSION-REUSE-ASK
  - 确认表须**分开展示**领域、特性小组、关联项目、应用/服务、故事点、生成模式及来源（`yml` / `会话` / `手选` / `故事卡` / `文档属性`）
- **写入故事点**：R01 body 带 `storyPoint`；若详情未落库再立即 R04；失败不伪造成功

## 禁止

猜不存在的 id；number 型 long id（领域/项目等）；六必填缺一；空描述提交；描述询问提供「跳过」；未调 CLI 报成功；英文 priority/层级枚举；包内临时脚本；向用户暴露 Agent 调试句；**跳过 T-CREATE-CONFIRM 直接 R01**；OR 快捷轨未提炼/未表格确认即创建；yml 匹配失败仍用错误 ID 创建；**yml 已命中或已回退会话后仍发 T-SESSION-REUSE-ASK**；**`node -e`/`--eval` 内联中文或拼 body.json（P-239）**；**AI-Coding 无有效生成模式仍 R01**；**用会话默认填生成模式**；**`--force-conflicts` 绕过生成模式闸**。

## 批量创建分支（P-212 · P-214 · P-215 · P-219 · P-229～P-238 · SC-260802-005 · SC-260827-001）

用户**一次** `@` 多个需求文档（≥2）、口令含「批量创建」/「自创」、或 **`@迭代目录` 下所有 REQ** 时：

0. **迭代目录（P-230）**：`scan-iter --path {迭代目录}` → 得 `items` + `batchWarnings`；**禁止** Agent 自写 `readdir` 临时脚本
   - 路径支持文档仓库别名（P-229）
   - 多 md 目录默认 **`auto-req-md`**：仅拆根目录 `REQ-*.md`（P-231）；`needs-pick` 时 **T-DOC-FOLDER-ACK**
1. 逐个读文档（**parse-doc** / scan 结果），解析 `title` / `description` / `priority` / `storyPoint` / `generateModeName` / `warnings`
2. **整批预填**：默认可共用 yml/会话默认；单条允许覆盖；ACK/确认须标来源
3. **T-BATCH-DOC-CREATE-ACK**：列出 N 条标题 + **生成模式** + 预警（含未解析故事点）+ 问创建方式
   - 口令 **`沿用`** + 目录/多 `@` 批量 → **等同选 1**，**可跳过**本模板（P-233）；沿用**仅**六必填，**不含**生成模式
   - 口令 **`沿用 自创`** = 沿用会话默认 + 逐条创建，**跳过** T-SESSION-REUSE-ASK；**仍受生成模式闸约束**
   - `batchWarnings` / `warnings`（作废、重复标题、**priority-conflict**、**generate-mode-***）须在 ACK 中展示（P-235）
   - **`priorityConflict: true`（blocked）** → **禁止**静默 R01；须 **T-DOC-CONTENT-CONFIRM** 或用户确认后再建（P-236）
   - **`generate-mode-pending|missing|ambiguous`（blocked）** → **禁止**对该条 R01/`batch-create`；须确认表选定模式写回后再建（**不可** `--force-conflicts`）
4. **提交前复述环境**（P-224）：批量**首条** R01 前须一句：当前环境：{env_label}；base_url：`{base_url}`
5. **逐条** R01（P-232）：
   - **须**官方 CLI：`batch-create --manifest scan.json --reuse-defaults --out results.json`（body 自动带各条 `storyPoint` + `generateModeName`）
   - body 含 `implementationType`；AI-Coding 须含有效 `generateModeName`
   - **禁止** `%TEMP%` 自写循环 `.mjs`（P-222）；CLI 逐条 stderr 输出 `{"event":"progress",…}`（P-234）
   - Agent **只读** `--out` 落盘 JSON，**禁止**依赖 PowerShell stdout 中文（P-237）
   - 每条**前**对用户发 **「当前正在创建第 {i}/{N} 条：{title}…」**（读 progress 事件或 results）
   - 单条失败**不**中断整批；`--force-conflicts` 仅用户确认后用于**优先级**冲突
6. 全部完成 → **T-BATCH-CREATE-DONE**（`formatBatchCreateText`）；部分失败须逐条标注
7. 写 session（Q8）：以**最后一条成功**更新 `last_create_defaults`（**不**持久化生成模式为会话默认）；默认清理 CLI 临时目录（`--keep-artifacts` 可保留 · P-238）

**禁止**：只创建第一条即收尾；即兴表格；编造 REQ-；**整批静默脚本连创**（P-222）。

## 失败

400 转人话；网络错误说明原因，勿编造 REQ- 编号。
