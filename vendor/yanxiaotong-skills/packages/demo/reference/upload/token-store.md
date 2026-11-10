# 开放 API 令牌本地存储（按环境分文件 · 与会话分离 · Agent SSOT）

> **父包公共 SSOT（Q17）**：`router/token-store.md` · `$SKILL_ROOT/tools/token-store.mjs`（**权威实现**，全子包共用）。  
> 本子包 `tools/token-store.mjs` 仅为**兼容包装**，行为须与父包一致；文档口径、令牌读写目录（`~/.yanxiaotong/tokens/{env}`）以父包为准。  
> 下文命令中的 `tools/token-store.mjs` 等价于父包 `$SKILL_ROOT/tools/token-store.mjs`。

> **令牌**与 **D03/D04 业务参数**分开存放。  
> **业务会话**：`session-store.md` → `~/.yanxiaotong/sessions/{env}/{project_slug}`（**按项目**，不在规则包内）。  
> **跨平台**：Windows 与 macOS（及 Linux/WSL）使用同一套优先级与目录名 `.yanxiaotong`。

## 为什么按环境分文件

**不同环境的开放令牌互不相同**。若共用一个全局文件，会出现：UAT 上传后落盘 → 改选生产 → 脚本仍读到 UAT 令牌 → **鉴权失败**。

因此：**每个环境独立文件**；解析令牌时 **必须带当前 `--environment`**，**禁止**跨环境读取。

## 存储位置

| 项 | 值 |
|----|-----|
| **目录** | `~/.yanxiaotong/tokens/`（Windows：`%USERPROFILE%\.yanxiaotong\tokens\`） |
| **本地** | `tokens/local` |
| **UAT** | `tokens/uat` |
| **生产** | `tokens/prod` |
| **环境变量** | `YXT_OPEN_API_TOKEN`（显式覆盖，脚本用） |
| **遗留单文件** | `~/.yanxiaotong/YXT_OPEN_API_TOKEN`（仅迁移用，新写入不再使用） |

### Windows 示例

```text
C:\Users\liu-pj\.yanxiaotong\tokens\uat
C:\Users\liu-pj\.yanxiaotong\tokens\prod
C:\Users\liu-pj\.yanxiaotong\tokens\local
```

### macOS / Linux 示例

```text
~/.yanxiaotong/tokens/uat
~/.yanxiaotong/tokens/prod
~/.yanxiaotong/tokens/local
```

## 读取优先级（脚本与 Agent 一致）

当 **已选定环境** `environment` 时：

1. 命令行 `--token` / `-Token`（当次显式传入）
2. 环境变量 **`YXT_OPEN_API_TOKEN`**
3. **`~/.yanxiaotong/tokens/{local|uat|prod}`**（**仅当前环境**对应文件）
4. **遗留单文件** `~/.yanxiaotong/YXT_OPEN_API_TOKEN`：仅当**无**当前环境 `tokens/{slug}` **且**（可选）规则包内旧 `upload-session.local.md` 的 `last_environment` 与当前环境一致时，**一次性迁移**到 `tokens/{slug}` 并删除遗留单文件
5. **禁止**读取其他环境 `tokens/*` 文件

**Agent 对话额外层**（仅当 1～3 均无当前环境 token 时）：用户**本条消息**提供的 token。

## 写入规则（**默认自动保存 · 必须带环境**）

用户在对话中**提供** token 后（**须已选定 `phases/upload-phase.md` §8.3.1 环境**）：

1. **立即**执行（**首选 Node，跨平台**）：
   - `node <技能包>/tools/token-store.mjs write --token "<token>" --environment <当前环境>`
   - 写入 **`tokens/{local|uat|prod}`**，**不**写入全局单文件
2. **随后**发 **`response-templates.md` · T-TOKEN-SAVED**（不展示令牌内容）。
3. **无 Node 时备选**（同样须 `-Environment` / `--environment`）：
   - Windows：`powershell -File tools/token-store.ps1 write -Token "<token>" -Environment UAT`
   - macOS / Linux：`bash tools/token-store.sh write --token "<token>" --environment UAT`
4. **禁止**把 token 写入会话文件或 Git。

> 用户**明确要求不保存**时：跳过 `write`，仅用当次 token 继续上传。

## 环境切换（Agent 必守）

| 情况 | 行为 |
|------|------|
| 切换环境 | **只读** `sessions/{slug}` 与 `tokens/{slug}` 中 **当前环境** 文件 |
| 当前环境 **无** 已存 token | 发 **T-DEMO-TOKEN-ASK** |
| 当前环境 **有** 已存 token | 静默使用（对话不展示） |
| 鉴权失败 | **T-TOKEN-FAIL-ASK** → `write --environment <当前环境>` 覆盖 |

## 删除规则（**二次确认**）

用户要求删除已保存 token：

1. 发 **T-TOKEN-DELETE-ASK**（第一次确认）
2. 用户确认后发 **T-TOKEN-DELETE-CONFIRM**（第二次确认）
3. 用户再次确认 → `node tools/token-store.mjs delete`（删全部环境）或 `delete --environment UAT`（删单环境）

## Agent 工具

```bash
node <技能包>/tools/token-store.mjs info --environment UAT
node <技能包>/tools/token-store.mjs resolve --environment UAT   # 勿贴对话
node <技能包>/tools/token-store.mjs write --token "<t>" --environment UAT
node <技能包>/tools/token-store.mjs delete --environment UAT
```

`upload-demo` / `fetch-metadata` 的 `.mjs`、`.ps1`、`.sh` 均按 **`--environment`** 解析对应环境令牌。

## 安全

- **禁止** token 入 Git、CHANGELOG、完整贴入用户可见对话
- **禁止**在 T-SESSION-REUSE-*、上传进度、交付摘要中展示令牌
- 鉴权失败 → **T-TOKEN-FAIL-ASK**

## 与会话文件分工

| 文件 | 内容 |
|------|------|
| `~/.yanxiaotong/tokens/{local,uat,prod}` | 各环境 **X-Open-Api-Token** 明文 |
| `~/.yanxiaotong/sessions/{local,uat,prod}/{project_slug}` | 各环境各项目的 D03/D04 字段（**无 token**） |

沿用判断（D03）：**当前环境 token 已解析** + 会话有可沿用字段 → 可问 T-SESSION-REUSE-D03；**用户本轮已指定的字段排除**（详见 `upload-phase.md` §8.3.2）。
