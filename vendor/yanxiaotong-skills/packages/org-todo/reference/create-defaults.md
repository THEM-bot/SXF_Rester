# 组织待办创建 · 默认与收参（Agent SSOT）

> **对齐 Web 新建**：仅「待办描述」（必填）+「进展说明」（选填，写入首条进展）；**无标题字段**。

## 用户口语 → API 映射

| 用户说 | 写入字段 |
|--------|----------|
| 描述 / 内容 / 正文 / 待办描述 | `descriptionHtml`（纯文本转 `<p>…</p>`）；**创建唯一正文必填** |
| 进展说明 / 首条进展 | OT03 成功后 OT04 `bodyHtml`（**可选**）；开放 API 创建体**无** `progressHtml`，技能用 OT04 对齐 Web |
| 标题 / 主题 | **禁止**单独收参；若用户口语带「标题：」→ 并入待办描述正文，**勿**拆成独立字段 |
| 提出人 | `proposedBy`（工号）；未指定 → **技能静默**填 Token 用户工号；用户给工号/姓名 → 覆盖（姓名走 M05） |
| 负责人 / 责任人 | `owners`（工号数组）；未指定 → **技能静默**填 Token 用户工号 |
| 计划闭环 / 截止日期 | `plannedCloseAt`（`yyyy-MM-dd`）；未指定 → **默认今天 + 1 个月**（确认表可改） |
| 领域 / 业务领域 | `businessDomain`（名称或 id） |
| 关联项目 / 项目 | `projectIds`（至多 1 个 id；点选只对用户展示名称） |

**确认表**：展示「待办描述」「进展说明」「提出人」「负责人」；**状态**固定「待处理（新建默认，不可改）」；人员回显 **`姓名工号`**（工号**无**括号）。**禁止**确认表出现「待办标题」行。

## 待办描述 → descriptionHtml

1. 描述非空 → `descriptionHtml =` 纯文本转 HTML（`<p>…</p>`）
2. **禁止**空描述提交；描述询问 **无跳过**
3. **禁止** `--title-file`；**禁止**把虚构标题拼进 `descriptionHtml`
4. 落盘前去掉 `\r`，避免脏 HTML

CLI：`write-json-body --json meta.json --description-file desc.txt --out body.json`

## 进展说明（可选 · 对齐 Web）

1. **T-OT-PROGRESS-NOTE-ASK**；用户说跳过 / 空 / 「无」→ 不写进展
2. 有实质内容 → 确认表展示摘要；提交时：
   - 首选：`create --json body.json --progress-file progress.txt --out resp.json`（OT03 成功后同命令内 OT04）
   - 或：OT03 后再 `append-progress --id {orgTodoNo} --text-file progress.txt`
3. OT03 成功但 OT04 失败 → **如实**告知编号已创建、首条进展写入失败（禁止整单伪造成功/失败）

## 提出人 / 负责人（技能静默 Token）

优先级（**提出人**与**负责人**各自独立，规则相同）：

1. 用户当轮给**工号** → 写入对应字段；M05 补姓名用于回显
2. 用户给**姓名** → `m05 --keyword … --pick`（多命中点选）→ 工号 + 姓名
3. 未指定 → `resolve-token-user` 静默填 Token 工号；确认表标注「默认：当前令牌用户」
4. `resolve-token-user` 失败 → **T-OT-PROPOSED-BY-ASK** / **T-OT-OWNERS-ASK** 追问

回显格式统一：`姓名工号`（工号**禁止**用括号；多负责人顿号连接）。姓名已含工号时不重复拼接。

CLI：`create` 在 body 缺 `proposedBy` / `owners` 时分别静默补 Token 工号。

## 状态（创建）

- 新建固定 `PENDING` / 展示「待处理」
- **禁止**创建 body 传 `status`；**禁止**创建改参改状态（改状态仅 `update-phase`）

## 计划闭环日

- **默认**：未指定时取 **今天 + 1 个月**（`yyyy-MM-dd`），写入确认表；**不必**先发 **T-OT-PLANNED-CLOSE-ASK**
- 用户当轮已给日期 → 采用用户值
- 用户要改 → 确认选「修改参数」或 **T-OT-PLANNED-CLOSE-ASK**
- CLI：body 缺 `plannedCloseAt` 时同样默认今天 + 1 个月
- 齐备条件含 `plannedCloseAt`（可来自默认）

## 领域 / 项目预填优先级

1. 用户当轮直给名称或 id → 直接采用（来源：用户输入）
2. 会话 `last_create_defaults` **有可用缓存**（领域或项目至少一组 **id + 名称** 成对）→ 发 **T-OT-SESSION-DOMAIN-REUSE-ASK**  
   - 选 **1 沿用** → 自动填充确认表  
   - 选 **2 不沿用** → 不带入；可随后 M01/M02 或确认表改参  
   - **禁止**有缓存时静默带入且不问  
3. **无可用缓存** → **禁止**发沿用询问；领域/项目可空，或走 M01/M02 点选
4. M01 点选领域 → M02 点选项目（来源：手选）

**禁止**在已点选或用户直给后再重复追问。  
**禁止**仅有 id、无名称时当作可用缓存（勿对用户朗读 id）。

## M01 / M02 点选

- `m01 --pick --out picks.json` → 用户可见**仅名称**；Agent 用 picks.json 的 `index→id`
- `m02 --businessDomainId {id} --pick --out picks.json` 同上
- **禁止**向用户朗读 id
- M02 空列表 → 说明该领域无项目，可跳过或换领域
- 写入 body 时可附带会话字段 `businessDomainName` / `projectName`（CLI **提交前剥离**，仅用于写入 `last_create_defaults`）

## 确认与提交

- 齐备：`descriptionHtml`（仅描述）+ `owners`（≥1）+ `proposedBy` + `plannedCloseAt`（后三者均可默认）
- **T-OT-CREATE-CONFIRM** → 用户选 **1**
- 选 **2** → **T-OT-CREATE-EDIT-MENU**（**无状态项、无标题项**）→ 改单项后重回确认
- 提交：`write-json-body`（仅描述）→ `create`（可选 `--progress-file`）→ verify → **T-OT-CREATE-DONE**
