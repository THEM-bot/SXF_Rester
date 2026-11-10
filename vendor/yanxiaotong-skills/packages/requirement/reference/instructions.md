# 需求操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。  
> **与其它章节冲突时以「执行优先级」为准。**

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "local:ready",
  "operation": "create | detail | list | update | cancel | null"
}
```

仅 `open-api` + `X-Open-Api-Token`（Q3）。**禁止**遗留鉴权可执行轨。

### operation 写入时机（P-220）

| 时机 | `operation` |
| --- | --- |
| 刚完成 **T-ROUTER-REQ-HANDOFF**（用户仅选父包 3） | `null` |
| 用户回复 **T-OP-TYPE-ASK** `1`/`3`/`4` | **同轮**设为 `create` / `update` / `cancel` |
| 用户回复 **T-OP-TYPE-ASK** `2` | 暂 `null` → **T-QUERY-TYPE-ASK** |
| 用户回复 **T-QUERY-TYPE-ASK** `1`/`2` | `detail` / `list` |

**纪律**：进入 `create-phase` 等 phase 前，内部 `operation` **须**与 phase 一致；完整映射**只读** `router/operation-resolution.md` **§3**（requirement · P-377）。

## 执行优先级

1. **父包 env + token 已通过**；本子包**继承 selected_env**，**禁止**再问环境（`router/public-env.md`）。
2. **跳过菜单**：须满足下文「禁止跳过菜单」checklist；**禁止**推测 operation。
3. **一次一问**；选择题带序号（`response-templates.md`）。
4. **进度**：每步 **当前正在…**（`ui/progress-display.md`）。
5. **禁止猜 id**：M01/M02/M03/M06/M09 序号点选。
6. **创建六必填**齐备方可 R01。
7. **列表默认 5 条**（Q9）；多条改/废须选唯一。
8. **R05 二次确认**（Q5）。
9. **R04 黑名单**请求前拦截（`update-phase.md`）；`priority` 仅中文 **最高/高/中/低**（对齐后端 `RequirementOpenValidationSupport`）。
10. **工具首选** `requirement-api.mjs`（Q13）。
11. **须调工具报成功**：**未**执行 `requirement-api.mjs` 并得到 JSON **禁止**声称 R01～R05 成功；须 `verify-requirement-response.cjs`（Q12）。
12. **400 人话** `error-humanize.md`（Q18）；**禁止**伪造成功。
13. **R01 long id 字符串**：M01/M02/M03/M06 的 snowflake id 写 JSON 时须为 string；CLI 会兜底，Agent 不得手写 number。
14. **Windows JSON**：优先 `--json -` 或 Node 写无 BOM 文件；禁止向 `packages/` 写临时脚本。
15. **用户可见中文**（Q23）：详情/列表/创建/修改/黑名单/M09 选项**禁止**英文字段名与英文枚举；见 `ui/field-labels.md`；优先 `requirement-api.mjs --human`。
16. **Windows 响应落盘**（P-169～P-171 / P-206 / **P-239**）：**禁止** PowerShell `Out-File`/`Set-Content` 写 API JSON；**禁止** `>` 重定向；**禁止** `$json | node … create --json - --out` 三连；**禁止** `node -e`/`--eval` 内联含中文或拼 `body.json`；**须** `Write` 落盘、或 `write-json-body`、或 temp `.mjs`（命令行无中文）写出 body 后 `create --json body.json --out resp.json`。
17. **文档驱动 / 批量创建**（P-211～P-215）：用户**首句** `@` 文档 → **跳过**要标题/描述，走 **T-DOC-FOLDER-ACK → T-DOC-CONTENT-CONFIRM**；一次 `@` **多个**文档 → **批量分支**（`phases/create-phase.md`），逐条 R01、逐条进度句、**T-BATCH-CREATE-DONE** 交付，**禁止**只创建第一条。
18. **口令解析**（P-214 / P-216 · `ui/response-templates.md` 口令表）：`沿用`=跳过会话询问带默认；`自创`/`批量创建`=进入批量文档创建；`沿用 自创`=沿用默认+批量；`{序号} {补充}`须**先取序号**，余下作补充说明。
19. **基于原始需求创建**（`create-defaults.md`）：口令「在 OR-xxx / 原始需求 URL / 原始需求下新建需求」→ `parse-create --text` → 优先 OR detail 取 `data.id` 并提炼标题/描述；body.`originalRequirementId` 亦可直接写 `OR-`/URL（后端解析）或同义 `originalNo` → 确认表展示关联；**描述禁止跳过**。
20. **描述必填**：全渠道创建缺描述时发 **T-CREATE-DESC-ASK**（无「跳过」）；空描述禁止 R01。
20. **禁止向用户展示路由/调试 JSON**（P-218）：子包路由卡（`operation` 等）仅用于 Agent 内部推理，**禁止**在用户可见回复中输出 `json` 代码块或路由卡字段；用户可见内容仅为固定话术模板。

## 禁止跳过菜单（本子包 SSOT · 勿读父包 `router/` 除 `public-env.md` 与 `operation-resolution.md`）

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 **T-FIRST-SCREEN**（首句直通） | 用户首句关键词**唯一命中**需求池（选 3 / REQ- / 需求 / 创建需求 / 需求池 / 池内需求），且**非**歧义行（仅 **CRUD** / **增删改查** 等） |
| **T-ROUTER-REQ-HANDOFF** 内四选一 | 用户已明确 **创建 / 修改 / 作废**之一，或已给 `requirementNo`/`REQ-` + 动词；**仅说「查询」**（无 `REQ-`）**不算**已明确——**必须**先发 **T-QUERY-TYPE-ASK** |
| 用户仅说「查询」 | **必须**先发 **T-QUERY-TYPE-ASK**（详情 vs 列表）；首句已含 `REQ-` + 查/详情 → 直进 `detail-phase` |
| 页面验收 / 留库 | 用户明示「页面验证」「先保留不作废」→ **跳过** R05；**禁止**为走自动化测试强制作废 |
| 其它 | **禁止**推测；发 **T-OP-TYPE-ASK** 或请用户澄清 |

## 弱模型纪律（内联）

- 每步 **当前正在…** 后**同轮**调 `requirement-api.mjs`
- M01/M02/M03/M06/M09 **序号点选**，禁止手填 id
- R01 提交前复述「当前环境：{env_label} · base_url」（继承 `selected_env`）
- R01 前须 **T-CREATE-CONFIRM**（`| 项目 | 内容 |` 表格，与 task 对齐）
- 每步 **verify**，禁止未调工具报成功
- 强模型可合并相邻问句，但**不得**跳过 token、二次确认作废、CLI；不得向用户暴露 Agent 调试句

## 阶段路由

| 操作 | 文件 |
|------|------|
| 创建 | `phases/create-phase.md` |
| 详情 | `phases/detail-phase.md` |
| 列表 | `phases/list-phase.md` |
| 修改 | `phases/update-phase.md` |
| 作废 | `phases/cancel-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| R01～R05 | `node $PACK_ROOT/tools/requirement-api.mjs` |
| M01/M02/M03/M06/M09 | `m01` / `m02` / `m03` / `m06` / `m09` 子命令 |
| 生成模式列表 | `generate-modes` / `gm`（读 M09.`generateModes`，可 `--human`） |
| M01 脚注 | `m01 --with-project-hints`（P-223） |
| 文档解析 | `parse-doc --path`（P-225/P-226 · P-229 别名；含故事点 / AI-Coding生成模式） |
| 文档驱动创建 | `create-from-doc --path [--reuse-defaults]`（自动带 `generateModeName`） |
| 上传预填 | `resolve-upload-defaults [--yml] [--match]`（SC-260802-005 · `upload-defaults.md`） |
| 安全写 body | `write-json-body --json meta.json --out body.json [--description-file]`（P-239） |
| 创建 NL 解析 | `parse-create --text`（基于 OR 快捷轨 · `create-defaults.md`） |
| 标题/描述提炼 | `refine-create --text [--or-json]` / `parse-create --or-json` |
| 迭代扫描 | `scan-iter --path`（P-230/P-231） |
| 批量创建 | `batch-create --manifest --reuse-defaults --out`（P-232/P-237） |
| 校验 | `node $PACK_ROOT/scripts/verify-requirement-response.cjs` |
| token | `node $SKILL_ROOT/tools/token-store.mjs` |

## 会话（Q8/Q11 · P-221）

`~/.yanxiaotong/sessions/{selected_env.env_slug}/requirement`（**无扩展名** · **禁止** `requirement.json`）。

归属三项预填优先级见 `upload-defaults.md`：**yml → 会话静默带入 → 点选**；默认**不再**为沿用会话发 **T-SESSION-REUSE-ASK**（显式口令 `沿用`/`重新选择` 除外）。确认表为用户纠正入口。

session 中须保存 `businessDomainName` / `projectName` / `appServiceName`；仅有 id 时须补全名称或请用户重新选择。
