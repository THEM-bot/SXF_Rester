# 上传会话本地存储（按环境 + 项目 · 与令牌分离 · Agent SSOT）

> **D03/D04 业务参数**与 **令牌**分开存放（参考 `token-store.md`）。  
> **令牌**：按环境全局共享（`~/.yanxiaotong/tokens/{local,uat,prod}`）。  
> **会话**：按 **环境 + 用户 Demo 项目根路径** 隔离（一人多项目互不混用）。  
> **流程**：`phases/upload-phase.md` §8.3 · `open-api-upload.md`「本地会话」。

## 为什么按环境 + 项目分文件

| 维度 | 隔离方式 | 原因 |
|------|----------|------|
| **令牌** | 仅按环境 | 同一人在同一环境通常共用一把开放 API 令牌 |
| **会话** | 环境 **且** 项目根路径 | 不同 Demo 项目的名称、领域/服务、demoId 不同；**禁止** A 项目沿用 B 项目的 D03 参数 |

项目根路径 = §1 步骤 1 已向用户确认并固定的路径（含 `package.json` 或 `index.html` 的目录）。

## 存储位置

| 项 | 值 |
|----|-----|
| **目录** | `~/.yanxiaotong/sessions/`（Windows：`%USERPROFILE%\.yanxiaotong\sessions\`） |
| **路径模式** | `sessions/{local\|uat\|prod}/{project_slug}` |
| **project_slug** | 项目根绝对路径的 SHA-256 前 16 位 hex（Windows 路径先转小写） |

### 示例路径

```text
~/.yanxiaotong/sessions/local/a1b2c3d4e5f67890
~/.yanxiaotong/sessions/uat/a1b2c3d4e5f67890
# 文件头含可读注释：
# project: D:\work\demo-test\resume-test
# project_slug: a1b2c3d4e5f67890
```

## Agent 读写约定

1. **前置**：§1 已固定 **项目根路径**；`phases/upload-phase.md` §8.3.1 **环境已选**。
2. **读取**：`readSession(environment, projectRoot)` — **仅**当前环境 + **当前项目**。
3. **写入**：用户 newly 提供 D03/D04 参数 → `writeSession(data, environment, projectRoot)`；**token 不写本会话**。
4. **沿用**：当前项目会话有可沿用字段 + token 已解析 → **T-SESSION-REUSE-***（须展示 **项目路径**）。**用户本轮已指定的字段排除出沿用列表**（见 `upload-phase.md` §8.3.2 · P-SESSION-USER-OVR）；排除后无字段则**跳过**沿用问。
5. **不沿用 / 用户已指定**：用户已指定 → **直接采用**；选「不沿用」→ 仅对未指定槽位逐项收集；新值覆盖写入 **当前项目** 文件。
6. **清除会话**：默认 `clear --environment <环境> --project-root <路径>`（仅本项目）；用户明确要求清全部项目 → `clear --environment <环境>`。
7. **禁止**写入规则包 `reference/` 或 Git。

## 存储字段（**无 token**）

| 字段 | 说明 |
|------|------|
| `project_root` | 项目根绝对路径（文件头 `# project:` 注释） |
| `last_environment` | 与文件所属环境一致（冗余校验） |
| `d03.name` | D03 Demo 名称 |
| `d03.businessDomainId` / `businessDomainName` | M01 确认或点选（口语名走 `--match`） |
| `d03.appServiceId` / `appServiceName` | M03 确认或点选（口语名走 `--match`） |
| `d04.demo_id` | D04 数字 demoId |
| `d04.demo_code` | D04 demoCode |
| `updated_at` | ISO 8601 |

**沿用判断**（须 **当前环境 token 已解析** + **当前项目** 文件）：

| 类型 | 会话可沿用条件 | 发 **T-SESSION-REUSE-*** 额外条件 |
|------|----------------|-----------------------------------|
| D03 | `d03.name` **或**（领域 id+名与服务 id+名）有值 | 存在**至少一个**会话有值且用户本轮**未**指定的字段 |
| D04 | `d04.demo_id` **或** `d04.demo_code` 非空 | 用户本轮**未**给出 D04 标识（已给则 D04 快径，不问沿用） |

**用户指定覆盖**：本轮「名称为 …」等 → 上传用用户值；沿用问**不得**再展示会话旧名称。

## 文件模板（结构参考 · 勿写入规则包）

```yaml
# yanxiaotong-demo upload session (UAT)
# project: D:\work\demo-test\resume-test
# project_slug: a1b2c3d4e5f67890
# token → ~/.yanxiaotong/tokens/uat

last_environment: UAT

d03:
  name:
  businessDomainId:
  businessDomainName:
  appServiceId:
  appServiceName:

d04:
  demo_id:
  demo_code:

updated_at:
```

## 脚本 API（`demo-tools.mjs` / `session-store.mjs`）

```bash
node <技能包>/tools/session-store.mjs info --environment UAT --project-root "D:\work\my-demo"
node <技能包>/tools/session-store.mjs clear --environment UAT --project-root "D:\work\my-demo"
node <技能包>/tools/session-store.mjs clear --environment UAT   # 该环境下全部项目
node <技能包>/tools/session-store.mjs clear   # 全部环境
```

```javascript
readSession(environment, projectRoot)
writeSession(data, environment, projectRoot)
clearSession(environment?, projectRoot?)
sessionStoreInfo(environment?, projectRoot?)
projectSlugForRoot(projectRoot)
projectLabelForRoot(projectRoot)
```

`upload-demo.mjs --save-session` 须带 `--project-root <§1 已固定路径>`（缺省为 cwd，**Agent 应显式传入**）。

## 与令牌分工

| 路径 | 内容 | 作用域 |
|------|------|--------|
| `~/.yanxiaotong/tokens/{local,uat,prod}` | 各环境开放令牌 | **全局**（按环境） |
| `~/.yanxiaotong/sessions/{local,uat,prod}/{project_slug}` | D03/D04 参数 | **按项目**（同环境内多项目隔离） |
