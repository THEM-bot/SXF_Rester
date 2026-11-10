# 组织待办操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "local:ready",
  "operation": "create | detail | list | append-progress | update | null"
}
```

## 执行优先级

1. **父包 env + token 已通过**；**继承 selected_env**，**禁止**再问环境。
2. **一次一问**；选择题带序号（`response-templates.md`）。
3. **进度**：每步 **当前正在…**（`ui/progress-display.md`）。
4. **创建必填**（对齐 Web）：待办描述→`descriptionHtml` + `owners`（≥1）+ `proposedBy` + `plannedCloseAt` 齐备方可 OT03；提出人/负责人未指定可静默 Token；计划闭环未指定默认今天+1月；进展说明**可选**（有则 OT03 后 OT04）。**禁止**收标题 / `--title-file`。
5. **创建状态**：固定待处理；**禁止**创建改状态 / body 传 `status`。
6. **人员回显**：一律 `姓名工号`（工号**无**括号）；点选 M01/M02 **只展示名称**（id 仅 `--out` 给 Agent）。
7. **领域/项目**：有会话可用缓存 → **T-OT-SESSION-DOMAIN-REUSE-ASK**；无缓存不问；用户直给或 M01/M02（见 `create-defaults.md`）；**禁止**手猜 id。
8. **列表默认 5 条**（Q9）；多条改/写进展须选唯一编号。
9. **写操作须 T-*-CONFIRM** 后调 CLI。
10. **工具首选** `org-todo-api.mjs`；**须** `verify-org-todo-response.cjs` 方可报成功。
11. **400/404 人话** `error-humanize.md`；**禁止**伪造成功。
12. **用户可见中文**；优先 `--human` · `field-labels.md`。
13. **禁止向用户展示路由 JSON**（P-218）。

## 禁止跳过菜单

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 **T-FIRST-SCREEN** | 首句唯一命中组织待办（选 7 / OT- / 组织待办 + 动词） |
| **T-ROUTER-OT-HANDOFF** 四选一 | 用户已明确 创建/修改/追加进展，或 OT- + 查/详情/改/进展 |
| 仅说「查询」无 OT- | **必须** **T-QUERY-TYPE-ASK** |
| 首句含 OT- + 查/详情 | 直进 `detail-phase` |
| 首句含 OT- + 追加进展 | 直进 `append-progress-phase` |

## 阶段路由

| 操作 | 文件 |
|------|------|
| 创建 | `phases/create-phase.md` |
| 详情 | `phases/detail-phase.md` |
| 列表 | `phases/list-phase.md` |
| 追加进展 | `phases/append-progress-phase.md` |
| 修改（含改状态） | `phases/update-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| OT01～OT05 | `org-todo-api.mjs` |
| M01/M02 | `m01 --pick --out` / `m02 --businessDomainId … --pick --out` |
| M05 人员 | `m05 [--keyword …] [--pick --out]` |
| Token 用户 | `resolve-token-user [--human] [--out]` |
| 安全写 body | `write-json-body`（仅 `--description-file`；创建禁 `--title-file`） |
| 创建+首条进展 | `create --json body.json [--progress-file p.txt]` |
| 校验 | `verify-org-todo-response.cjs` |
| token | 父包 `token-store.mjs` |

## 会话

`~/.yanxiaotong/sessions/{selected_env.env_slug}/org-todo`（无扩展名）
