# 研效通 skills · 意图路由

> **何时查阅**：`router/boot.md` token 门禁通过后。路径均相对于 `yanxiaotong-skills/` 根目录。

## 子包注册表

| package | 目录 | skill 名 | 状态 | 场景 |
|---------|------|----------|------|------|
| `demo` | `packages/demo/` | `yanxiaotong-demo` | **ready** | mock 出 zip + D03/D04 上传 |
| `original-requirement` | `packages/original-requirement/` | `yanxiaotong-original-requirement` | **ready** | 原始需求 OR01/OR02/OR06/OR07 + M01 |
| `requirement` | `packages/requirement/` | `yanxiaotong-requirement` | **local:ready** | 需求池 R01～R05 + M01/M02/M03/M09 |
| `task` | `packages/task/` | `yanxiaotong-task` | **local:ready** | 迭代任务 T01～T06 + M10 + R03 联调 |
| `defect` | `packages/defect/` | `yanxiaotong-defect` | **local:ready** | 迭代缺陷 D01～D06 + M11 + NL 直达 |
| `org-todo` | `packages/org-todo/` | `yanxiaotong-org-todo` | **local:ready** | 组织待办 OT01～OT05 + M01/M02 |
| `problem-ticket` | `packages/problem-ticket/` | `yanxiaotong-problem-ticket` | **local:ready** | 问题单 P-META / P01（元数据 + 创建） |
| `skill-sync` | `packages/skill-sync/` | `yanxiaotong-skill-sync` | **ready** | **安装**（plaza 链接/skillId）+ **更新**（manifest 扫描比对） |

**独立运行**：复制 `packages/<子包>/` 整目录 → `{Agent根}/skills/<skill名>/`，无需父包。

## 无意图 / 首屏菜单

用户**仅** `@yanxiaotong-skills`、未说明要做哪类业务时：

| 步骤 | 动作 |
|------|------|
| 0a | **环境自动解析**（`boot.md` §0a · Q22 · Q25 默认生产） |
| 0b | **token 门禁**（`boot.md` §0b） |
| 0c | **每日首用 skill-sync**（`boot.md` §0c · `entry-bootstrap` · @ 后无论有无输入 · P-271/P-273/P-411） |
| 1 | 门禁通过后读 `router/intent-menu.md`，执行 `first-screen.mjs` 并**原样贴** **T-FIRST-SCREEN** + `status: pending_intent` |
| 2 | **禁止**加载子包 `instructions` |
| 3 | 用户选序号或自然语言后 → 按下表路由 |

## 意图 → 子包

| 用户意图（关键词） | package | 说明 |
|--------------------|---------|------|
| 选 **1** / Demo 打包上传 / D03 / D04 | `demo` | `status: ready` → **T-ROUTER-DEMO-HANDOFF**（含当轮 env） |
| 选 **2** / 原始需求 / 创建原始需求 / OR / 需求受理 | `original-requirement` | `ready` → **T-ROUTER-OR-HANDOFF**（**带「原始」** · P-413） |
| 选 **3** / 需求 / 创建需求 / 需求池 / REQ- / 池内需求 | `requirement` | `local:ready` → **T-ROUTER-REQ-HANDOFF**（**不带「原始」**= 需求池 · P-413） |
| 选 **4** / 任务 / TASK / 迭代任务 / 创建任务 | `task` | `local:ready` → **T-ROUTER-TASK-HANDOFF** |
| 选 **5** / 缺陷 / TD- / BUG / 提缺陷 / 迭代缺陷 | `defect` | `local:ready` → **T-ROUTER-DEFECT-HANDOFF** 或 NL 直通 |
| 选 **6** / 技能包安装 / 技能包更新 / 安装技能 / 技能同步 / skill-sync | `skill-sync` | `ready` → **T-ROUTER-SYNC-HANDOFF**（见 §skill-sync operation） |
| 选 **7** / 组织待办 / OT- / 组织级待办 | `org-todo` | `local:ready` → **T-ROUTER-OT-HANDOFF** |
| 选 **8** / 问题单 / PRB- / 创建问题单 / 问题单元数据 | `problem-ticket` | `local:ready` → **T-ROUTER-PT-HANDOFF** |
| 仅说 **CRUD**（无 Demo/原始/需求池/任务/缺陷/组织待办/问题单/技能同步上下文） | — | **T-REQ-CLARIFY**（勿默认 2/3/4/5/6/7/8） |
| 仅 @、无说明 | — | token 后 **T-FIRST-SCREEN**（`first-screen.mjs`） |
| 误 `@yanxiaotong-demo` 等 | — | **T-SUBPKG-REDIRECT** |

### 歧义澄清：「需求」一词

> **口令约定（P-413）**：**带「原始」** → 原始需求（OR）；**不带「原始」**的「需求 / 创建需求 / 新建需求」→ **需求池**（REQ）。Agent **禁止**对裸「创建需求」再发 **T-REQ-CLARIFY**。

| 用户表述 | 路由 | 反例（勿误判） |
|----------|------|----------------|
| 原始需求 / 创建原始需求 / OR / 需求受理 | `original-requirement` | — |
| 需求 / 创建需求 / 需求池 / REQ- / 故事点 / 池内需求 | `requirement` | 勿因「需求」二字改走原始需求 |
| 仅说 **CRUD** / **增删改查**（无上下文） | **T-REQ-CLARIFY** | 勿默认 2/3/4/5/6 |

> **T-REQ-CLARIFY**（仅 CRUD 等仍无对象时）：选项 `1` = **原始需求**（带「原始」· OR）；`2` = **需求**（不带「原始」= 需求池 · REQ）。任务/缺陷不进序号，改用说明行引导改口。

### 禁止跳过菜单（须全部满足才可跳过 T-FIRST-SCREEN / T-ROUTER-REQ-HANDOFF 内菜单）

| 场景 | 允许跳过条件 |
|------|----------------|
| 父包 **T-FIRST-SCREEN** | 用户首句关键词**唯一命中**上表「意图→子包」某一行，且**非**歧义行（仅 **CRUD** / **增删改查** 等） |
| **T-ROUTER-REQ-HANDOFF** 内四选一 | 用户已明确 **创建 / 修改 / 作废**之一，或已给 `REQ-` + 查/详情/改/废；**仅说「查询」**（无 `REQ-`）**不算**已明确——须进子包后 **T-QUERY-TYPE-ASK**（详情 vs 列表） |
| 其它 | **禁止**推测；不满足则发对应菜单或 **T-REQ-CLARIFY** |

### 判定优先级

0. **原始需求 URL + 创建/新建** → `requirement` · `or_url_create`（优先于泛化「创建需求」）
0b. **意图前缀「创建需求」类动词**（优先于正文需求池 URL /「关联缺陷」；**不带「原始」= 需求池**）：
   - 前缀含 **创建需求 / 新建需求 / …**（无论有无后续正文）→ `requirement` · `operation: create`
   - **禁止**对裸「创建需求」发 **T-REQ-CLARIFY**（P-413）
0c. **需求池 URL + 对象类型**（对象类型**只认意图前缀**；粘贴正文「关联缺陷：无」**不**构成提缺陷）：
   - 前缀含 **任务/TASK/迭代任务** → `task` · `operation: create`
   - 前缀含 **提缺陷/创建缺陷/新建缺陷/BUG**（**不含**裸词「缺陷」）→ `defect` · `operation: create`
   - 仅含 **创建/新建** 无对象类型 → **T-REQ-CLARIFY**（任务还是缺陷？）
0d. **意图前缀「创建/新建原始需求」**（**带「原始」**；优先于正文主题词「Demo」）：
   - 前缀含 **创建原始需求 / 新建原始需求 / …** → `original-requirement` · `operation: create`
   - 实现允许「原始」与「需求」间单字符笔误（如「原始i需求」）；**禁止**因正文「Demo演示…」改判 `demo`
1. Demo / zip / 上传包 → `demo`（**只认意图前缀**的 Demo/打包/出包，或全文 **D03/D04**；**禁止**仅因正文出现「Demo」命中）
2. **原始需求** / OR → `original-requirement`
3. 需求池 / REQ- / 已明确池内需求 → `requirement`
4. 任务 / TASK / 迭代任务 / 创建任务（已明确非需求池）→ `task`
5. 缺陷 / TD- / BUG / 提缺陷 / 迭代缺陷 → `defect`
6. 组织待办 / OT- / 追加进展（含 OT-） → `org-todo`
7. 问题单 / PRB- / 创建问题单 / 问题单元数据 → `problem-ticket`
8. 技能包安装 / 更新 / skill-sync / plaza 链接 → `skill-sync`
9. 仅 **CRUD** / **增删改查**（仍无对象）→ **T-REQ-CLARIFY**
10. 多意图（Demo + 需求池 + 任务 + 缺陷 + 组织待办 + 问题单 + 技能同步等同句）→ **T-MULTI-INTENT-SPLIT**；**单会话单包**，完成后再 `@` 做下一类

## 路由卡

**通用字段**：`skill`、`package`、`sub_skill`、`status`、`natural_summary`

**token 未就绪**：

```json
{
  "skill": "yanxiaotong-skills",
  "package": null,
  "status": "pending_token",
  "selected_env": {
    "env_slug": "prod",
    "env_label": "生产",
    "base_url": "http://yanxiaotong.sangfor.com/efficiency-hub"
  },
  "gate": "open-api-token"
}
```

**requirement 示例**（env 已解析 + token 已通过）：

```json
{
  "skill": "yanxiaotong-skills",
  "package": "requirement",
  "sub_skill": "yanxiaotong-requirement",
  "status": "local:ready",
  "auth_track": "open-api",
  "selected_env": {
    "env_slug": "prod",
    "env_label": "生产",
    "base_url": "http://yanxiaotong.sangfor.com/efficiency-hub",
    "requirement_api": "ready"
  },
  "operation": "create",
  "natural_summary": "需求池操作"
}
```

`operation`：`create` | `detail` | `list` | `update` | `cancel` | `install` | `update` | `status` | `close` | `null`（待用户选择）

### skill-sync operation（P-221 · **内部路由卡**）

| 时机 | 内部 `operation` |
| --- | --- |
| 仅选菜单 **6**、无链接、无安装/更新词 | `null` → **T-SYNC-MODE-ASK** |
| 含 plaza 链接 / open `skill-zip` / `skill=\d+` / 「安装技能」/ 「再用它安装」 | `install` |
| 「更新」「同步」「比对」或模式菜单选 **2** | `update` |

**安装关键词直通**（可跳过 T-SYNC-MODE-ASK）：`安装技能`、`安装技能包`、`从社区安装`；句中含 `plaza?skill=`、`…/imported/{id}/skill-zip`、或「再用它安装 / 用它依次安装」。

**解析**：`install` 前须 `parse-skill-ref` 得到 skillId（**优先「再用它安装」之后**，避免误装自举包）；多目标用 `parseInstallSkillIds`；失败 → **T-SYNC-INSTALL-REF-INVALID**。

**示例**：

```text
@yanxiaotong-skills 安装技能 https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109
```

```text
本地环境。…直接下载安装 …/1132/skill-zip（勿扩大查找）；再用它安装 …/1130/skill-zip。
```

→ `package: skill-sync`，`operation: install`，目标 `skillId: 1130` → 同轮 install。

### operation 解析（P-220 · **SSOT** → `router/operation-resolution.md`）

> **禁止**在本文件维护完整映射表。original-requirement / requirement / task / defect / skill-sync 的 `operation` 写入时机、T-OP-TYPE-ASK / T-QUERY-TYPE-ASK 序号、关键词直通、NL 直通 → **只读** [`operation-resolution.md`](./operation-resolution.md)（P-376）。

| 子包 | SSOT 章节 |
| --- | --- |
| original-requirement（选 2） | `operation-resolution.md` **§2** |
| requirement（选 3） | `operation-resolution.md` **§3** |
| task（选 4） | `operation-resolution.md` **§4** |
| defect（选 5） | `operation-resolution.md` **§5** |
| org-todo（选 7） | `operation-resolution.md` **§8** |
| problem-ticket（选 8） | `operation-resolution.md` **§9** |
| skill-sync（选 6） | `operation-resolution.md` **§6**（+ 上文 §skill-sync；通用纪律 §1） |

**纪律**：进入任一 `*-phase.md` 时，内部路由卡 `operation` **必须**与该 phase 一致。skill-sync 的 `update` 语义为**更新技能包**（可写作 `skill_sync.update`），与业务 CRUD `update` 不同包不同义（P-402）。

### status 语义对照（P-389）

| 字段 / 说法 | 含义 | 勿混淆 |
| --- | --- | --- |
| 路由卡 `status: ready` / `local:ready` | 路由层判定**可进入该子包执行**（历史命名；二者对 Agent **等价可执行**） | 不是环境是否部署好 |
| `selected_env.*_api: ready` | 该环境下该 API **已开放**；非 ready → **禁止**伪造业务成功 | 与路由卡 status 独立 |
| 「三环境 ready」 | 本地/UAT/生产的各 `*_api` 均为 ready（见 `public-env.md`） | 不消去 `local:ready` 路由卡写法 |

## 加载指令

```text
packages/{package}/reference/boot.md
packages/{package}/reference/instructions.md
```

**Demo 上传**：curl 执行前必读 `packages/demo/reference/upload/open-api-upload-quickref.md`（细则 `open-api-upload.md`）。

## 共享约定（仅父包）

`router/public-env.md` · `router/token-store.md` · `tools/token-store.mjs` · `tools/env-session.mjs`

**子包禁止**引用 `router/response-templates.md`（父包话术）。
