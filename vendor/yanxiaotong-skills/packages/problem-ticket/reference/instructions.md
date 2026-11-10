# 问题单操作 · 执行说明

> **内部模块**：经 `@yanxiaotong-skills` 路由。入口：**先读** `reference/boot.md`。

## 子包路由卡（Agent 内部 · P-218 禁止外露）

```json
{
  "auth_track": "open-api",
  "status": "local:ready",
  "operation": "metadata | create | null"
}
```

## 执行优先级

1. **父包 env + token 已通过**；**继承 selected_env**，**禁止**再问环境。
2. **一次一问**；选择题带序号（`response-templates.md`）。
3. **进度**：每步 **当前正在…**（`ui/progress-display.md`）。
4. **创建必填**：`title` + `description` + `submitterName`（或工号）齐备方可 P01；归属未传可走 metadata `defaults`。
5. **创建确认硬门禁**：先把**完整业务概况**写入 draft.description → `prepare --out prepared.json --human` → **仅当** stdout 含 `【prepare 确认表】` 时原样贴给用户 → 确认后 `create` 同一 prepared。  
   - 禁止手搓确认表；禁止描述里出现 `...` /「全文约 N 行」  
   - 二线由 CLI 固定为令牌用户（勿填杨红卫等环境默认二线）
6. **创建前建议**先 `metadata`（同会话可复用 `version`）。
7. **写操作须确认**后调 CLI；**必须**带 `Idempotency-Key`（CLI 可自动生成）。
8. **工具首选** `problem-ticket-api.mjs`；**须** `verify-problem-ticket-response.cjs` 方可报成功。
9. **400/404 人话** `error-humanize.md`；**禁止**伪造成功。
10. **用户可见中文**；优先 `--human`。
11. **禁止向用户展示路由 JSON**（P-218）。

## 禁止跳过菜单

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包已跳过 **T-FIRST-SCREEN** | 首句唯一命中问题单（选 8 / PRB- / 问题单 + 动词） |
| **T-ROUTER-PT-HANDOFF** | 用户已明确 创建 / 元数据 |
| 仅说「问题单」 | 发 handoff 二选一 |

## 阶段路由

| 操作 | 文件 |
|------|------|
| 元数据 | `phases/metadata-phase.md` |
| 创建 | `phases/create-phase.md` |

## 工具表

| 能力 | 命令 |
|------|------|
| P-META / P01 | `problem-ticket-api.mjs` |
| Token 用户 | `resolve-token-user`（读 metadata.`tokenUser`，非默认二线） |
| 校验 | `verify-problem-ticket-response.cjs` |
| token | 父包 `token-store.mjs` |

## 会话

`~/.yanxiaotong/sessions/{selected_env.env_slug}/problem-ticket`（无扩展名）
