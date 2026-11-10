# yanxiaotong-demo 执行说明

> **内部模块**：`yanxiaotong-skills` 聚合包内 Demo 业务模块；通过 `@yanxiaotong-skills` 路由进入。  
> **Agent 入口**：先读 **`reference/boot.md`**（PACK_ROOT · 最小必读）。

## 执行优先级（严格约束 · 单一真源）

以下为强约束；与其它章节冲突时 **以本节为准**：

1. **主路径顺序**：检查 → 修复 → **（有构建则 build，纯静态 HTML 跳过 build）** → 打 zip → **询问是否上传** →（若上传）**先询问 D03/D04** → **再按类型收参**（D03：有底稿则预览确认/修改，全空则逐项；D04：收标识，跳过预览）→ 上传 → **交付 accessUrl** → 结束。
2. **禁止跳问**：zip 未生成前 **不得** 收 `base_url`/`token`（用户开篇已全部提供除外）。出包阶段 **仅**收集 **项目路径**。
3. **禁止推断上传类型**：**不得**默认 D03；**不得**仅凭 demoId 假定 D04；**须先**发 **T-UPLOAD-TYPE**（开篇已明确类型可复述跳过），**禁止**在选类型前出预览表或收 D03 领域/服务。
4. **缺参一次一问**：类型确认后按支路收参；D03 预览修改一次一项；全空跳过空预览（`upload-phase.md` §8.2 / §8.15 / §8.3）。
5. **终态**：上传成功 → **必须**输出 `accessUrl`；不上传 → 交付 `zip_path` 即结束。
6. **契约**：curl 以 `reference/upload/open-api-upload.md` 为准。
7. **禁止旧 zip**：须先重新检查并打 zip；用户说「只上传」→ 固定回复须先出包并提供项目路径。
8. **令牌与会话分离**：token → 父包 `$SKILL_ROOT/tools/token-store.mjs` + `reference/upload/token-store.md`；会话 → `session-store.md`（按环境+项目路径）。沿用/上传 **禁止展示令牌**。
9. **D03 领域/服务**：**禁止**手填 snowflake；口语名在 **`preview-upload-params.mjs` 后台匹配**并进预览表（**仅 D03、选类型之后**）；无底稿则 M01/M03 点选（见 `upload-phase.md` §8.15 / §8.3.3）。
10. **Agent 工具执行**：**PACK_ROOT** 与 Shell 纪律见 **`reference/boot.md`**（经父包路由时**禁止**用聚合根目录拼 `tools/`）。
11. **进度可见**：每步首句 **`当前正在`**（`progress-display.md`）；预览组装属非提问步，发完进度后**同轮**跑工具并贴表。
12. **改代码须先确认**：**T-FIX-ASK**，用户 **`1`** 后方可改（见 `pack-phase.md` §3）。
13. **固定话术**：选择题/交付须 **`response-templates.md`**；**禁止**同条多题。

## 阶段路由（触发后按序读）

| 阶段 | 文件 | 何时 |
|------|------|------|
| Boot | `reference/boot.md` | 路由进入 demo 后**首先** |
| 出包 | `reference/phases/pack-phase.md` | 收项目路径 → zip 完成前 |
| 上传 | `reference/phases/upload-phase.md` | zip 就绪且用户要上传 |
| 话术/进度 | `response-templates.md` · `progress-display.md` | 与用户交互时 |

**纯静态 HTML**：无 npm 时不要求 build；见 `pack-phase.md` §1.0 与 `notes` 快径。

## Agent 工具选择表（SSOT）

> 路径一律 **`$PACK_ROOT`**（`boot.md`），**禁止**在用户项目 cwd 相对 `tools/`。

| 能力 | 有 Node（首选） | 无 Node（备选） |
|------|-----------------|-----------------|
| 打 zip | `pack-mock-zip.mjs` | `pack-mock-zip.ps1` / `.sh` |
| Demo 预览（后台匹配） | `preview-upload-params.mjs` | — |
| D03 元数据（修改/补齐） | `fetch-metadata.mjs` | `fetch-metadata.ps1` / `.sh` 或 curl |
| 上传 | `upload-demo.mjs` | `upload-demo.ps1` / `.sh` 或 curl |
| 校验响应 | `verify-upload-response.cjs` | 人工核对（`open-api-upload.md`） |

**降级**：PS `ParserError` → `.mjs`；M01/M03 不可达 → `upload-phase.md` §8.3.3.0。

## 速查：按用户意图

| 用户意图 | 读 | 说明 |
|----------|-----|------|
| 标准出包+可选上传 | `pack-phase` → zip 后 `upload-phase` | 默认 |
| 快捷启动 | 同上 + **T-QUICK-START-ACK** | 首句全参 |
| 只要出包 | 仅 `pack-phase` | **不得**读 `upload-phase` |

---

*深读检查项：`notes.md` · 上传契约：`open-api-upload.md`*
