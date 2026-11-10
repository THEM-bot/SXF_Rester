# 任务创建 · 速查表（Agent SSOT · v0.9）

> **何时读**：`operation: create` 时，**在** `phases/create-phase.md` **之前或同步**加载。  
> **细则**：`create-defaults-detail.md`（按轨**按需**加载对应 §，**禁止**一次性全读）  
> **v0.9**：速查表与细则拆分（P-319）。

---

## 1. 设计目标（摘要）

| 痛点 | 改法 |
|------|------|
| 阶段/类别/日期每轮点选 | **静默默认值**，仅 API 必填 |
| 需求须关键词搜索 | URL / REQ / 当前页自动解析 |
| 用户已写内容被改写 | **用户输入轨**原样使用 |
| 仅指定需求 | **先双选**手动/自动（P-410）；自动才进需求分析 + 去重 |
| 无任务内容且选手动 | **T-CREATE-MANUAL-INPUT-ASK** 收标题/内容 |

---

## 1.1 三轨分流（互斥）· P-410

| 轨 | 触发 | `create_count` | 去重 | 描述来源 |
|----|------|----------------|------|----------|
| **pending_create_mode** | **仅**需求引用（无 NL、无自动口令） | — | — | **T-CREATE-MODE-ASK** |
| **user_input** | 短 NL / 关键词 / `任务内容如下` / MODE·手动 | 默认 **1** | 否 | 用户原文 → detail §4.1 |
| **content_refine** | 大段 / 口令「提炼」 | **1** | 否 | Agent ≤**40** 字 → detail §4.1.5 |
| **req_analyze** | MODE·自动 / 「自动创建」等口令 | 推断 n | 是 | 分析生成 → detail §4.2 |
| **full** | 「完整创建」等 | 逐步 | 否 | create-phase 完整轨 |

**禁止**：仅 URL 默认 `req_analyze`；用户输入轨调用分析/去重；内容提炼轨在仅 URL 时启动；需求分析轨在用户有 NL 时启动。

---

## 2. 字段静默默认（两轨共用）

| 字段 | 默认 |
|------|------|
| `taskPhase` / `taskCategory` | `开发阶段` / `开发编码` |
| `requirementId` | §3 · **禁止手填** |
| `assigneeId` | **不传**（Token 用户） |
| `plannedStartDate` / `plannedEndDate` | **当日** `Asia/Shanghai` |
| `plannedStartPeriod` / `plannedEndPeriod` | `PM` |
| `estimatedHours` | `1`（**1 人天**，非小时） |

**提交前校验**：需求非「已完成」· 已关联迭代 · M10 默认组合合法（机侧静默校验）。

---

## 3. 所属需求解析（`requirementId`）

**优先级**：需求页 URL → `REQ-\d{8}-\d+` → 数字 id+上下文 → 关键词点选 → 会话沿用（「沿用需求」）。

解析后 **必须** `requirement-api.mjs detail`（R02）。

---

## 4. 按轨加载细则

| 当前轨 | 必读 detail § | 备注 |
|--------|---------------|------|
| `pending_create_mode` | create-phase §创建方式双选 | `--resolve-only` · **T-CREATE-MODE-ASK** |
| `user_input` | §4.1 | `prepare-create` 后直进确认 |
| `content_refine` | §4.1.5 | golden：`scripts/fixtures/refine-golden-*.json` |
| `req_analyze` | §4.2 · §4.2.2 | 不确定去重 → **T-TASK-DEDUP-CLARIFY**；全跳过 → **T-CREATE-DEDUP-EMPTY-DONE** |

批量 §4.3 · 完整轨 §6 → 见 detail。

---

## 5. 交互纪律

**禁止**默认发问 M10/日期/负责人（URL/REQ 已解析且已进创建轨时）。**必须** T01 前 **T-CREATE-CONFIRM**（1 确认 · 2 修改 · 3 取消）；去重后 0 条用 **T-CREATE-DEDUP-EMPTY-DONE**。

仅需求 URL/REQ → **先** **T-CREATE-MODE-ASK**；同句已含任务 NL 或「自动创建」口令可跳过。URL + 创建意图（含任务内容）→ 可跳过 handoff 四选一，直进确认。

---

## 6. CLI（常用）

```bash
node "$PACK_ROOT/tools/task-api.mjs" prepare-create --text "用户句" [--resolve-only] [--force-track user_input|req_analyze] [--out intent.json]
node "$PACK_ROOT/tools/task-api.mjs" apply-refine --intent intent.json --title "…" --description "…"
node "$PACK_ROOT/tools/task-api.mjs" apply-dedup --intent intent.json --skipped-json skips.json
node "$PACK_ROOT/tools/task-api.mjs" create --intent intent.json [--human]
```

完整 CLI 与 `intent.json` 结构 → `create-defaults-detail.md` §7。
