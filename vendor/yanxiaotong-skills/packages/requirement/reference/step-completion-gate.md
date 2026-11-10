# Step Completion Gate（yanxiaotong-requirement · local:ready）

## 通用

- [ ] 已读 `reference/boot.md`；**继承**父包 `selected_env`（子包内不再问环境）
- [ ] 父包 token 已通过；对话未回显 token
- [ ] 固定话术 + 序号选项；进度句含 **当前正在…**
- [ ] **T-OP-TYPE-ASK** 用户回复序号后，内部路由卡 `operation` 已同轮写入（P-220）；进入 phase 前 `operation` 与 phase 一致

## API 执行（铁律）

- [ ] 已执行 `requirement-api.mjs` 并得到 JSON 响应
- [ ] 已执行 `verify-requirement-response.cjs`（成功路径）或 400 已转人话
- [ ] **未**在未调工具时声称创建/修改/作废成功
- [ ] Windows JSON（**P-239 可勾选项**）：
  - [ ] body 由 **Write / `write-json-body` / temp `.mjs`（命令行无中文）** 之一写出（`fs.writeFileSync` 无 BOM）
  - [ ] **未**使用 `node -e`/`--eval` 内联中文或拼 `body.json`
  - [ ] **未**使用 `Set-Content`/`Out-File`/`>` 写 API JSON
  - [ ] `create`/`update` 使用 `--json <已落盘文件>` + `--out <已落盘文件>`（**禁止** PS 管道 + `--json -` + `--out` · P-206）
- [ ] `@` 文档目录已 **T-DOC-FOLDER-ACK**；session 审计用 Node UTF-8 读（P-208/P-209）
- [ ] 用户可见交付无英文字段名（含修改摘要、黑名单、M09 选项）

## 创建

- [ ] M01/M02/M09/M03 点选；六必填齐备
- [ ] R01 id 字段按 string 传递；session 写入领域/项目/服务名称
- [ ] R01 提交前已复述「当前环境：{env_label} · base_url」（selected_env）
- [ ] **T-CREATE-CONFIRM** 已用 `| 项目 | 内容 |` 表格预览，用户确认后再调 R01
- [ ] 若基于原始需求创建：body 含 `originalRequirementId`（id / OR 编号 / URL）和/或 `originalNo`；确认/成功展示「关联原始需求」；标题/描述已按用户输入或 OR 正文提炼并以表格确认
- [ ] 描述必填：未提供「跳过」；空描述未调用 R01
- [ ] 描述经 CLI 规范化后为 HTML（P-241；文档全文上传、确认表不预览正文）
- [ ] 文档轨：R01 来自 `create-from-doc`/`description-file` 全文，**未**用确认摘要/截断预览当 `description`
- [ ] M09 与 M03 分别进度展示；M03/M01 多页有翻页或搜索指引
- [ ] verify 通过；已交付需求编号 + 需求 ID（中文，无英文字段名）+ **详情链接**（可点击；禁止编造）

## 查询/列表

- [ ] 仅说「查询」且无 `REQ-` → **T-QUERY-TYPE-ASK**（详情 vs 列表）；**禁止**直猜 list/detail
- [ ] R03 列表：未给筛选且未说查全部 → **T-LIST-FILTER-ASK**（含序号 1/2/3）；禁止无序号自由列举
- [ ] R03 size=5；多条命中已选唯一
- [ ] `total=0` → **T-LIST-EMPTY-DONE** → **T-LIST-EMPTY-RETRY-ASK**（禁止编造列表项）
- [ ] 详情/修改/作废缺编号 → **T-REQ-ID-ASK**；修改缺字段 → **T-UPDATE-FIELD-ASK**；需求分类 → **T-REQUIREMENT-CATEGORY-PICK**
- [ ] 指定优先级未给档位 → **T-PRIORITY-PICK**；绝对优先级 → **T-ABSOLUTE-PRIORITY-ASK**
- [ ] 详情交付后 → **T-DETAIL-THEN-ACT**（除非用户已明示只查不改）

## 验收留库（非回归脚本）

- [ ] 用户明示「页面验证」「保留不作废」→ **跳过** R05；勿为自动化回归强制作废

## 修改

- [ ] 黑名单已拦截；白名单字段已 verify；**T-UPDATE-DONE** → **T-UPDATE-CONTINUE-ASK**；修改字段为中文摘要（对齐 Web 文案）

## 作废

- [ ] **T-CANCEL-CONFIRM** 后执行 R05
- [ ] 交付 **T-CANCEL-DONE**

## 维护例行（改规则后）

- [ ] 包根执行 `node scripts/check.js`（结构探针 + 子包 self-check）

## 留库 / 作废

## 失败

- [ ] 400 已转人话；未伪造成功
