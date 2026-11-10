# operation 解析（父包 + 子包 · SSOT · P-333）

> **范围**：内部路由卡字段 `operation` 的写入时机与取值。**禁止**向用户展示路由 JSON（P-218）。  
> **子包**：original-requirement / requirement / task / defect 进入 `*-phase.md` 前须与本页一致。

---

## 1. 通用纪律

| 纪律 | 说明 |
|------|------|
| 写入时机 | 用户选定操作类型后**同轮**、进入 phase **之前**写入；handoff 后仍为 `null` 时**禁止**进 phase |
| 外露 | 用户只见 `T-*` 话术；`operation` 仅 Agent 内部维护 |
| 查询歧义 | 用户**仅说「查询」**且无 `REQ-`/`OR-`/`TASK-`/`TD-` → `operation: null` → **T-QUERY-TYPE-ASK** |
| phase 一致 | `create-phase` 要求 `operation: create`；不一致则违规 |

---

## 2. original-requirement（选 2）

| 时机 | `operation` |
|------|-------------|
| 刚发 **T-ROUTER-OR-HANDOFF**（仅选 2） | `null` |
| 首句已明示 创建/修改 | `create` / `update`（handoff **同轮**） |
| **T-OP-TYPE-ASK** 序号 | 1→`create` · 2→`null`（再 **T-QUERY-TYPE-ASK**）· 3→`update` |
| **T-QUERY-TYPE-ASK** | 1→`detail` · 2→`list` |

**关键词直通**：创建/新建原始需求→`create`（父包 `route-hint` reason=`create_original_requirement`；正文含「Demo」主题词**不**改判 demo · P-412）；修改/更新→`update`；`OR-`+查/详情→`detail`；`OR-`+改→`update`。

---

## 3. requirement（选 3）

| 时机 | `operation` |
|------|-------------|
| 刚发 **T-ROUTER-REQ-HANDOFF**（仅选 3） | `null` |
| 首句已明示 创建/修改/作废 | `create` / `update` / `cancel`（handoff **同轮**） |
| **T-OP-TYPE-ASK** 序号 | 1→`create` · 2→`null`（再 **T-QUERY-TYPE-ASK**）· 3→`update` · 4→`cancel` |
| **T-QUERY-TYPE-ASK** | 1→`detail` · 2→`list` |

**关键词直通**：创建/新建→`create`；修改/更新→`update`；作废/关闭→`cancel`；`REQ-`+查/详情→`detail`；`REQ-`+改→`update`；`REQ-`+废→`cancel`。

---

## 4. task（选 4）

同 requirement 四选一 + **T-QUERY-TYPE-ASK** 纪律。

| **T-OP-TYPE-ASK** | 1→`create` · 2→`null` · 3→`update` · 4→`cancel` |
| **T-QUERY-TYPE-ASK** | 1→`detail` · 2→`list` |

**关键词直通**：创建/新建任务→`create`；修改/更新→`update`；取消→`cancel`；`TASK-`+查/详情→`detail`。

**需求 URL + 创建直通**：首句含 `/requirement/{id}` 且含创建意图 → `operation: create` · 跳过 handoff 四选一 · 见 `packages/task/reference/phases/create-phase.md`。

---

## 5. defect（选 5 · NL-first）

| **T-OP-TYPE-ASK** | 1→`create` · 2→`null` · 3→`update` · 4→`status` · 5→`close` |
| **T-QUERY-TYPE-ASK** | 1→`detail` · 2→`list` |

**关键词直通**：创建/新建缺陷/BUG→`create`；修改/更新→`update`；流转/改状态→`status`；关闭/解决关闭→`close`；`TD-`+查/详情→`detail`。

**NL 直通**：`parse-intent.mjs` 已解析 `operation` 且 `missing` 可补 → 跳过 handoff 与 T-OP-TYPE-ASK。

---

## 6. skill-sync（选 6）

| 时机 | `operation` |
|------|-------------|
| 仅选 6、无安装/更新词 | `null` → **T-SYNC-MODE-ASK** |
| plaza 链接 / 安装语境 | `install` |
| 更新/同步/比对 | `update` |

---

## 8. org-todo（选 7）

| 时机 | `operation` |
|------|-------------|
| 刚发 **T-ROUTER-OT-HANDOFF**（仅选 7） | `null` |
| 首句已明示 创建/修改/追加进展 | `create` / `update` / `append-progress`（handoff **同轮**） |
| **T-OP-TYPE-ASK** 序号 | 1→`create` · 2→`null`（→ **T-QUERY-TYPE-ASK**）· 3→`update` · 4→`append-progress` |
| **T-QUERY-TYPE-ASK** | 1→`detail` · 2→`list` |

**关键词直通**：创建/新建组织待办→`create`；修改/更新/改状态/闭环→`update`；追加进展/写进展→`append-progress`；`OT-`+查/详情→`detail`；按负责人/列待办→`list`。

**改状态**：并进 `update`（PATCH `status`），**无**独立 `status` operation。

---

## 9. problem-ticket（选 8）

| 时机 | `operation` |
|------|-------------|
| 刚发 **T-ROUTER-PT-HANDOFF**（仅选 8） | `null` |
| 首句已明示 创建 / 元数据 | `create` / `metadata`（handoff **同轮**） |
| **T-OP-TYPE-ASK** 序号 | 1→`create` · 2→`metadata` |

**关键词直通**：创建/新建问题单→`create`；获取问题单元数据/元数据→`metadata`。

---

## 10. 引用

各文件**只链本页**，勿重复展开表格：`router/routing-rules.md` · `router/response-templates.md` handoff 脚注 · 子包 `instructions.md`。
