# 环境配置 · Agent SSOT（Q19 · Q22 · Q24 · Q25）

> **何时读**：父包 §0a 环境解析后、requirement 子包执行前。  
> **子包纪律**：requirement **继承父包已选 env**，**禁止**在子包内再问环境（Q19）。

## 默认环境（Q25 · 生产全量部署后由 UAT 切生产）

| 常量 | 当前值 | 说明 |
| --- | --- | --- |
| `DEFAULT_ENV_SLUG` | 见 `tools/lib/env-registry.json` | 当轮首句**未指定**环境时使用；三环境已全量部署（Q25，原默认 UAT 见 Q22） |

**地址唯一维护处**：`tools/lib/env-registry.json`（`base_url` / `web_origin` / 各 API ready）。  
代码加载：`tools/lib/open-api-token.mjs` · `ENV_REGISTRY` · `resolveEntryEnv()`。  
打印：`node tools/env-session.mjs list` · 单字段：`node tools/env-session.mjs lookup --environment UAT --field base_url`

## 环境注册表

| env_slug | env_label | requirement_api | original_requirement_api | task_api | defect_api | org_todo_api |
| --- | --- | --- | --- | --- | --- | --- |
| `local` | 本地 | **ready** | **ready** | **ready** | **ready** | **ready** |
| `uat` | UAT | **ready** | **ready** | **ready** | **ready** | **ready** |
| `prod` | 生产 | **ready** | **ready** | **ready** | **ready** | **ready** |

> `base_url`（开放 API，无尾斜杠、不含 `/doc.html`）与 `web_origin`（Web 前端 · 创建成功详情链接）**只改 JSON**；文档入口 = `{base_url}/doc.html`。

## 创建成功 · Web 详情链接（与 Demo `accessUrl` 对齐）

> 代码 SSOT：`tools/lib/web-detail-url.cjs` · `buildWebDetailUrl`（`web_origin` 来自 `env-registry.json`）。  
> **Demo**：仍用上传响应 `data.accessUrl`（UAT/生产预览源站重写见 demo 包）。  
> **其余创建成功**：Agent / `--human` **必须**交付可点击 **详情链接**；**禁止**编造 id 或猜路径。

| kind | 路径模板（拼在 `web_origin` 后） | id 来源 |
| --- | --- | --- |
| `requirement` | `/app/requirements/pool/requirement/{id}` | `requirementId` |
| `original-requirement` | `/app/requirements/original/requirement/{id}` | `id` |
| `task` | `/app/iterations/task/{id}` | `taskId` |
| `defect` | `/app/iterations/defect/{id}` | `defectId` |
| `org-todo` | `/app/portfolio/org-todos?id={orgTodoNo}` | `orgTodoNo`（OT 编号） |
| `problem-ticket` | `/app/ops/problem-tickets?id={problemNo}` | `problemNo`（或响应 `shareUrl`） |

Agent 纪律：

1. **`web_origin` / 详情路径只读 `env-registry.json` + `web-detail-url.cjs`**；禁止手写其它域名。
2. 创建成功话术（`T-CREATE-DONE` / 批量交付）须含 **详情链接** 行；优先 `--human`（display-humanize 已拼装）。
3. 缺 id → 写「（响应未返回 ID，无法生成链接）」；**禁止**用编号字符串冒充路径 id（除非 API 明确以编号作路由参数）。

## 父包入口（§0a · Q24 · Q25）

1. **禁止**每轮 `@` 先发 **T-ENV-ASK**；路由卡须**当轮**含 `selected_env` + `env_source`。
2. **解析优先级**（仅当轮首句 / `@` 入口 · 实现：`resolveEntryEnv` / `parseEnvFromUserText`）：
   - 用户显式环境词（本地 / UAT / 生产 等）→ `env_source: user_text` → **write**
   - **环境词仅认意图前缀**（`extractIntentPrefix`：先展平平台「标题+链接」复制块，再截断于故事卡 `标题:` / `内容:` / Markdown `###`；无标记则首行）：**禁止**用粘贴正文中的「本地目录」等词覆盖前缀已写的 `uat环境`
   - 平台 Web 复制块（`标题：…` + `链接：https?://…`）由 `tools/lib/platform-titled-link.mjs` 展平为裸 URL，再参与路由与子包解析；**兼容**旧版直接粘贴裸 URL
   - 前缀内多个环境词 → **最早出现**者胜出
   - 前缀无环境词 → **不**再扫正文 → **一律默认生产**（`env_source: default` · Q25）→ **write**
   - **禁止**用 `selected-env.json` / 上一轮环境作为本轮依据；UAT 或本地**必须当轮明确写出**
3. 用户说「切换环境」→ **T-ENV-SWITCH** 或解析后 `write` → `env_source: switched`。
4. 首句已含环境名 → **直接 resolve**，**禁止**二次追问。
5. **每轮 `@` 必须重新 resolve**；同轮内子包沿用本轮结果。禁止凭记忆沿用上一轮 UAT/本地。
6. **首屏后续（与各子包「继承 selected_env」对齐 · 全菜单 1～7 同规）**：
   - 已对 `@` 首句跑过 `entry-bootstrap` 且已展示 **T-FIRST-SCREEN** 后，用户**仅**回复菜单序号（如 `7`）或自然语言选能力 → 属**同轮续聊**，**不是**新一轮 `@`。
   - **须**继承该次 `@` 已解析的 `selected_env`（`env-session read` 此时即为当轮快照）。
   - **禁止**再对纯序号跑 `entry-bootstrap` / `resolveEntryEnv`（无环境词会被写成默认生产，覆盖用户已指定的本地/UAT）。
   - **禁止**「先写成生产再 `env-session write` 改回」或向用户叙述环境翻转；handoff 直接用首屏环境。
   - **禁止**仅为 ASCII 序号去写 `%TEMP%/user-text.txt` 再 bootstrap（临时文件纪律只服务**真正需要跑入口且含中文**的 `@` 首句 · 见 `PLATFORM.md`）。
   - 用户**再次** `@yanxiaotong-skills`（新一轮入口）→ 仍按本条 2～5 重新 resolve；无环境词则默认生产。

### `env_source` 与话术

| env_source | 含义 | T-FIRST-SCREEN / handoff 后缀 |
| --- | --- | --- |
| `default` | 未指定，用生产 | `（默认生产）` |
| `user_text` | 首句含环境词 | `（您本次指定）` |
| `switched` | 当轮切换环境 | `（已切换）` |

## Agent 纪律

1. **`base_url` 只读 `tools/lib/env-registry.json` + `selected_env`**；禁止手写其它地址。
2. Token：`tools/token-store.mjs resolve --environment {selected_env.env_label}`。
3. 会话路径：`~/.yanxiaotong/sessions/{env_slug}/requirement`（requirement）或 `…/original-requirement` 或 `…/task` 或 `…/defect` 或 `…/org-todo` 或 `…/problem-ticket`。
4. `selected-env.json`：仅作**当轮** CLI 快照（`env-session read`）；**不**作为下一轮环境记忆。无环境词的新一轮 `@` 仍默认生产。
5. handoff 与创建提交前须复述 **`selected_env.env_label` + `base_url`**。
6. 所选环境 `requirement_api`、`original_requirement_api`、`task_api`、`defect_api` 或 `org_todo_api` **非 ready** → 如实告知，禁止伪造成功（Q1）。
7. **默认生产且无 token**（Q25）：**T-TOKEN-ASK** 须提示可首句指定 **UAT** 或 **本地** 后重试 `@yanxiaotong-skills`（见 `router/response-templates.md` **T-TOKEN-ASK**）。

## Demo 上传（Q19 · Q22）

- **默认继承**父包当轮 `selected_env`。
- 用户显式改环境 → **T-ENV-SWITCH** 或 `env-session write`。

## CLI（P-205 · 入口首选一条）

```bash
node "$SKILL_ROOT/tools/entry-bootstrap.mjs" --text "用户当轮首句"
```

等价拆分（**非 Windows 链式**；PowerShell **禁止** `&&`）：

```bash
node "$SKILL_ROOT/tools/env-session.mjs" resolve --text "用户当轮首句"
node "$SKILL_ROOT/tools/token-store.mjs" resolve --environment 生产
```

**禁止**入口 `write` + `read` + `token resolve` 三连（`resolve` / `entry-bootstrap` 已 write）。
