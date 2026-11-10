# 缺陷操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。  
> **与其它章节冲突时以「执行优先级」为准。**

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "local:ready",
  "operation": "create | detail | list | update | status | close | null"
}
```

## 执行优先级

1. **父包 env + token 已通过**；**继承 selected_env**，**禁止**再问环境。
2. **NL 优先**：首句 `parse-intent.mjs` / `defect-api.mjs prepare`（Windows 含中文用 `--text-file`）；`confidence: high` 且 `missing` 空 → **跳过** T-OP-TYPE-ASK 与逐步菜单。
3. **只问 missing**：已解析字段**禁止**重复 ASK。
4. 写操作须 **T-*-CONFIRM** 一次确认（create/update/status/close）。
5. 创建默认快捷轨；读 `create-defaults.md`（含 **内容提炼轨** §3、**缺陷类型 Agent 语义** §4）+ `intent-routing.md`。
5a. **创建确认前**：未显式缺陷类型时，Agent **须**按正文语义判定并 `apply-refine --defect-type`（`agent_infer`）；禁止只靠关键词；无把握可「未选」。
6. **禁止猜 id**：完整轨 M11/M05/R03 须 **--pick**。
7. D04 **禁止**改 `status` → **T-STATUS-VIA-D05**；**禁止**改 `discoveryPhase`（只读）→ **T-BLACKLIST-FIELD**。
8. **工具首选** `defect-api.mjs`；**须** `verify-defect-response.cjs` 方可报成功。
9. **400 人话** `error-humanize.md`；**禁止**伪造成功。
10. **long id 字符串**：`requirementId` 等须 string。
11. **用户可见中文**；优先 `--human` · `field-labels.md`。
12. **禁止向用户展示路由 JSON**（P-218）。

## 禁止跳过菜单（本子包 SSOT）

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 **T-FIRST-SCREEN**（首句直通） | 首句唯一命中缺陷域 + 动词可解析 |
| T-ROUTER-DEFECT-HANDOFF | `parse-intent` 已得出 `operation` |
| 需求 URL + 创建缺陷 | `operation: create` · 直进 **T-DEFECT-CREATE-QUICK-CONFIRM** |
| 仅说「查询」 | **必须** **T-QUERY-TYPE-ASK**（无 TD- 时） |
| 首句含 `TD-`+查/详情 | 直进 `detail-phase` |

## 阶段路由

| 操作 | 文件 |
|------|------|
| 创建 | `phases/create-phase.md` + `create-defaults.md` |
| 详情 | `phases/detail-phase.md` |
| 列表 | `phases/list-phase.md` |
| 修改 | `phases/update-phase.md` |
| 状态 | `phases/status-phase.md` |
| 关闭 | `phases/close-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| NL 解析 | `parse-intent.mjs` · `defect-api.mjs prepare` |
| 执行 | `defect-api.mjs execute` · 或分命令 D01～D06 |
| M11 / R03 / M05 / M06 / M08 | 子命令 + `--pick` |
| 校验 | `verify-defect-response.cjs` |

## 会话

`~/.yanxiaotong/sessions/{env_slug}/defect`；沿用前 **T-SESSION-REUSE-ASK**。
