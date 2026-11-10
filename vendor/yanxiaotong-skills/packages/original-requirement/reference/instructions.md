# 原始需求操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。  
> **与其它章节冲突时以「执行优先级」为准。**

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "ready",
  "operation": "create | detail | list | update | null"
}
```

仅 `open-api` + `X-Open-Api-Token`。**无** cancel / intake / links 开放端点。

### operation 写入时机

| 时机 | `operation` |
| --- | --- |
| 刚完成 **T-ROUTER-OR-HANDOFF**（用户仅选父包 2） | `null` |
| 用户回复 **T-OP-TYPE-ASK** `1`/`3` | **同轮**设为 `create` / `update` |
| 用户回复 **T-OP-TYPE-ASK** `2` | 暂 `null` → **T-QUERY-TYPE-ASK** |
| 用户回复 **T-QUERY-TYPE-ASK** `1`/`2` | `detail` / `list` |

完整映射**只读** `router/operation-resolution.md` **§2**（original-requirement · P-378 允许读该文件）。

## 执行优先级

1. **父包 env + token 已通过**；本子包**继承 selected_env**，**禁止**再问环境（`router/public-env.md`）。
2. 若 `selected_env.original_requirement_api !== ready` → 如实告知，禁止伪造成功。
3. **跳过菜单**：须满足下文 checklist；**禁止**推测 operation。
4. **一次一问**；选择题带序号（`response-templates.md`）。已从首轮正文预填的槽位**跳过**追问。
5. **进度**：每步 **当前正在…**（`ui/progress-display.md`）。
6. **禁止猜 id**：业务领域须 **M01 序号点选**（`businessDomainId`）；创建/修改**提出人、验收人**均须先 **M05**（禁止手填），再拼 `proposer` / `requirementAcceptancePerson`（姓名+工号）；**M05 仅 1 条可直采免再问序号**，≥2 须点选（见 `create-phase.md` §M05）；二者**独立**，改其一不自动改另一；**未提则创建 body 不传对应字段**。
7. **创建六必填**齐备方可 OR01（见 `create-defaults.md`）。**标题**优先从用户输入解析/提炼（≤40 字）；有可提炼正文时**禁止**默认先发 **T-CREATE-TITLE-ASK**。**原始需求描述**与**价值描述**有实质正文时须自动提炼/生成（**禁止**默认 **T-CREATE-NEED-ASK** / **T-CREATE-VALUE-ASK**；描述须写期望能力/范围/对象，勿整段复贴痛点）。**计划交付**默认当天（**禁止**默认 **T-CREATE-DATE-ASK**）。确认预览须含三正文 + 人员说明 + 交付日（本版**不**依赖 parse CLI）；确认后改口径须**重发确认**。
8. **列表默认 5 条**；多条待改须选唯一。
9. **工具首选** `original-requirement-api.mjs`。
10. **须调工具报成功**：未执行 CLI 并得到 JSON **禁止**声称 OR01/OR02/OR06/OR07 成功；须 `verify-original-requirement-response.cjs`。
11. **400 人话** `error-humanize.md`；**禁止**伪造成功。
12. **long id 字符串**：`businessDomainId` 写 JSON 时须为 string；CLI 会兜底。
13. **Windows JSON**（P-169 / P-206）：**首选**编辑器/Write 写 `%TEMP%` 下无 BOM `body.json`，再 `create --json body.json --out resp.json`；**禁止** `node -e`/`--eval` 内联写含中文的 JSON；禁止 PS `Out-File`/`Set-Content`/`>` 与管道+`--json -`+`--out` 三连；禁止向 `packages/` 写临时脚本；PS 5.x **勿用** `&&`（见 `boot.md`）。
14. **用户可见中文**：见 `ui/field-labels.md`；交付优先 `--human`（P-398；创建人话须含环境行）；无 CLI 输出时才套模板扩写。
15. **禁止向用户展示路由/调试 JSON**（P-218）。
16. **session**：create 成功后 **CLI 已写**；Agent **禁止**再覆盖（见 `boot.md` §会话 / `create-defaults.md` §会话）。
17. 平台纪律见技能根 `PLATFORM.md`（P-391）。

## 禁止跳过菜单

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 **T-FIRST-SCREEN** | 首句唯一命中原始需求（选 2 / OR- / 原始需求 / 创建原始需求 / 需求受理）；裸「创建需求」按 P-413 走需求池，不进本包 |
| **T-ROUTER-OR-HANDOFF** 内三选一 | 已明确 **创建 / 修改**，或已给 `OR-` + 动词；**仅说「查询」**（无 `OR-`）须 **T-QUERY-TYPE-ASK** |
| 其它 | **禁止**推测；发 **T-OP-TYPE-ASK** |

## 阶段路由

| 操作 | 文件 |
|------|------|
| 创建 | `phases/create-phase.md` |
| 详情 | `phases/detail-phase.md` |
| 列表 | `phases/list-phase.md` |
| 修改 | `phases/update-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| OR01～OR02 / OR06～OR07 | `node $PACK_ROOT/tools/original-requirement-api.mjs` |
| M01 / M05 | `m01` · `m05` 子命令 |
| 校验 | `node $PACK_ROOT/scripts/verify-original-requirement-response.cjs` |
| token | `node $SKILL_ROOT/tools/token-store.mjs` |

## 会话

`~/.yanxiaotong/sessions/{selected_env.env_slug}/original-requirement`（**无扩展名**）；沿用前 **T-SESSION-REUSE-ASK**。写入由 **create CLI** 完成；形态为缩进 YAML（非 JSON），详见 `boot.md`。
