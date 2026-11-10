# 开放 API 错误分级（父包 · Agent 指引 · P-338）

> **范围**：聚合层与子包 Agent 共用；人话映射细节仍见各子包 `error-humanize.md`。

---

## 1. HTTP 状态与 Agent 动作

| 状态 / 场景 | 可自动重试？ | Agent 对用户 |
|-------------|--------------|------------|
| **502 / 503 / 504** | **是**（读操作 · `fetchWithRetry` 已有限重试） | **T-API-UNREACHABLE**；可稍后重试同一查询/详情 |
| **网络超时 / ECONNRESET** | **是**（同上，仅幂等读） | **T-API-UNREACHABLE** |
| **400 / 422** | **否** | 引导改参；引用子包 `error-humanize` VR 码 |
| **401 / 403** | **否** | **T-TOKEN-ASK** 或权限说明 |
| **404** | **否** | 编号不存在或环境错误，勿编造 ID |
| **写操作 5xx** | **否** | **禁止**自动重试创建/更新/关闭；汇报已成功条数（批量时） |

---

## 2. 业务 `Result` 失败

`success: false` 或 `code !== 200`：读 `message` / VR 映射；**禁止**伪造 `REQ-`/`TASK-`/`TD-` 编号。

---

## 3. 子包索引

| 子包 | 人话 SSOT |
|------|-----------|
| original-requirement | `packages/original-requirement/reference/error-humanize.md` |
| requirement | `packages/requirement/reference/error-humanize.md` |
| task | `packages/task/reference/error-humanize.md` |
| defect | `packages/defect/reference/error-humanize.md` |
| demo | `packages/demo/reference/error-humanize.md` |
| skill-sync | `packages/skill-sync/reference/error-humanize.md` |

服务整体不可达（网关/连接失败）→ 父包 **T-API-UNREACHABLE**（P-409）；元数据 M01/M03 不可达亦见 demo **T-META-UNREACHABLE**。
