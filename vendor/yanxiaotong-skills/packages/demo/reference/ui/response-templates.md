# 用户可见话术模板（Agent SSOT · 强制）

> **用途**：对用户回复须**优先套用本文件模板**；仅替换 `{占位符}`，**不得**自由发挥结构。  
> **关联**：执行优先级 §11～§13 · `progress-display.md` · `instructions` §3 · `phases/upload-phase.md` §8。

## 通用规则

1. **选项必带序号**：凡让用户选择，须 `1.` `2.` … 列表，结尾 **「请回复序号（如 `1`）。」**
2. **一次一问（上传 §8）**：**禁止**在同一消息里并列多个序号题（如同时问 D03/D04 + 环境 + 沿用）；须**逐条**发模板，等用户回复后再发下一题。
3. **进度首句**：各步开始前首句 **`当前正在…`** 见 `progress-display.md`；**本文件**管「问用户 / 交付」的**固定正文**。
4. **改代码硬停**：发出 **T-FIX-ASK** 后 **禁止** `Write`/`StrReplace`/`build`/打 zip，直至用户回复 **`1`** 或明示同意。
5. **令牌对用户不可见（默认）**：**禁止**在 T-SESSION-REUSE-*、上传进度、交付摘要中展示令牌（含脱敏末四位）。Agent **静默**从 token-store 解析。**仅** (a) 本地无 token → **T-DEMO-TOKEN-ASK**；(b) API 明确令牌无效/缺失 → **T-TOKEN-FAIL-ASK**。
6. **需用户提供的信息须突出**：自由输入 → 独立一行 `**请提供 …**` + 一行说明 + **示例**；选择题 → `**请选择 …**` + 序号列表 +「请回复序号」。进度句 `当前正在…` 可前置，但**不得**替代或遮住需用户回复的核心字段。

---

## A. 出包前 · 路径与检查

## T-PATH-ASK（缺路径时）

```text
**请提供项目路径**

要出包的目录，须含 `package.json` 或 `index.html`。

示例：`D:\work\my-app`

可直接回复路径，或 @ 项目文件夹。
```

## T-CHECK-DONE（可选 · 仅当须用户确认暂停时）

> **默认（YXT-DEMO-06）**：检查通过且无阻塞项 → **跳过本模板**，直接发 `当前正在执行构建（…）…`（见 `progress-display.md` 序 8）。  
> **有阻塞** → 发 **T-FIX-ASK**（硬停），**不得**用本模板代替。

```text
出包前检查已通过，无需修改代码。

请回复序号确认是否继续构建：
1. 继续构建并出包
2. 暂停

请回复序号（如 `1`）。
```

---

## B. 修复确认（**硬停** · 执行优先级 §12）

## T-FIX-ASK（发现须改目标项目代码时 · **必用**）

```text
当前正在汇总检查结果…

出包前检查项：<通过项摘要>
构建/检查阻塞：<错误摘要>

拟最小改动：
- {文件1}：{改动说明}
- {文件2}：{改动说明}

**请确认是否同意修复**

1. 同意按以上方案修改并继续出包
2. 暂不修改（中止出包；您可自行修复后重新开始）

请回复序号（如 `1`）。

[AGENT-GATE] 本条发出后：禁止 Write / StrReplace / Shell(build|npm|pack-mock-zip|vite) 直至用户回复 1 或同条明示「同意/直接改」。
```

**硬停**：本条发出后 **不得**改文件、不得 `npm run build`、不得打 zip，**直到**用户回复 **`1`**（或明示「同意/直接改」）。

> **典型违规**（demo_upload 实跑 A）：发出「拟最小修复」后**同轮**执行 `build` — **禁止**。

## T-FIX-WAIT

```text
当前正在等待您确认修复方案…

请回复序号：
1. 同意按以上方案修改并继续出包
2. 暂不修改（中止出包）

请回复序号（如 `1`）。
```

## T-FIX-DO（**仅**用户选 1 之后）

```text
当前正在按已确认方案修复代码…
```

---

## C. 出包结果

## T-PACK-EMPTY-INDEX（`pack-mock-zip` 拒绝空/缺失 `index.html` · **必用**）

> **触发**：`pack-mock-zip.mjs` / `.ps1` / `.sh` exit ≠ 0，且 stderr 含「index.html 为空」或「缺少 index.html」。**禁止**改用手搓 zip / 跳过门禁。

```text
无法打 zip：源目录的 index.html 缺失或为空（无可见内容）。

- 路径：{source_dir}
- 要求：目录根下须有非空 index.html（去掉 BOM/空白后仍有内容）

你可以：
1. 补全页面内容后回复「继续出包」
2. 更换项目路径
3. 中止本轮

请回复序号（如 `1`）。
```

## T-ZIP-DONE

```text
zip 已生成：{zip_path}

**请选择是否上传**

1. 上传到研效通
2. 暂不上传（仅保留 zip）

请回复序号（如 `1` 或 `2`）。
```

**Agent（P-193 · 硬纪律）**：**必须原样粘贴**上文全文发出；**禁止**省略 `1.` `2.` 序号、改写选项文案或合并为无序号 bullet。

## T-ZIP-ONLY-END（用户选 2）

```text
流程结束。zip 路径：{zip_path}
```

---

## D. 上传 · 一次一问（§8 · 逐条发送）

## T-UPLOAD-MULTI-REJECT（用户合并回复 · **必用**）

> 当用户回复 `1,3,1`、`1 3 1` 或 Agent 欲在同条并列多道序号题时，**须先发本模板**，再**只重问当前缺的第一项**。

```text
上传参数须逐项确认，无法一次回复多个序号。

我将逐条询问；请先回答当前这一题：

{重发当前单题模板正文}

请回复序号（如 `1`）。
```

## T-QUICK-START-ACK（开篇已含路径+上传+环境 · **可选**）

```text
按您说明：项目 {project_path} · 环境 {环境} · {已解析参数摘要}

当前正在执行出包前检查…

说明：已跳过「是否上传」确认；zip 就绪后**先选上传方式**（新增 / 更新），再按类型收集参数。
```

## T-DEMO-PREVIEW（§8.15 · **仅 D03 · 选类型之后 · 原样贴 CLI stdout**）

> **触发**：用户已确认 **D03 新增**，且存在可展示底稿（名称/口语领域/会话）时。  
> **跳过**：D04；或 D03 且名称与领域/服务均空 → 直接 **T-DEMO-NAME-ASK** / M01/M03，**禁止**贴全空预览表。  
> **命令**：`preview-upload-params.mjs`（后台 M01/M03 模糊匹配）。  
> **Agent**：**原样粘贴** stdout；id 以 stderr `preview_json` 为准（禁止外露）。  
> **禁止**在 **T-UPLOAD-TYPE 之前**发本模板。

```text
zip 已生成：{zip_path}

已在后台整理 Demo 信息预览（领域/所属组已尝试模糊匹配）：

| 项目 | 内容 |
|------|------|
| 上传环境 | {环境} |
| Demo 名称 | {name}（{备注}） |
| 来源类型 | {sourceTypeLabel}（UPLOAD=压缩包 · IMAGE=镜像） |
| 业务领域 | {domainName}（{备注}） |
| 所属服务/组 | {serviceName}（{备注}） |
| 压缩包 | `{zip_path}` |

**请确认以上 Demo 信息**

1. 确认，继续上传
2. 修改某项信息

请回复序号（如 `1`）。
```

> **Agent**：预览表 **必须**含来源类型；未定时先发 **T-SOURCE-TYPE-ASK**，不得带着空 `sourceType` 上传。

## T-DEMO-PREVIEW-EDIT（§8.15.2 · 用户选「修改」· **单独一条**）

```text
**请选择要修改的项**

1. Demo 名称
2. 来源类型
3. 业务领域
4. 所属服务/组
5. 取消，返回预览

请回复序号（如 `1`）。
```

> **Agent**：改完一项后须**重新**跑 `preview-upload-params.mjs` 并再发 **T-DEMO-PREVIEW**，不得跳过预览直接上传。改「来源类型」时改完发 **T-SOURCE-TYPE-ASK**（或直接确认后回预览）。

## T-DEMO-NAME-ASK（§8.3.3 · D03 缺名称 · **单独一条**）

```text
**请提供 Demo 名称**

将作为研效通中的 Demo 显示名。

示例：`研效通技能包手册`
```

## T-SOURCE-TYPE-ASK（§8.3.3 · D03 缺来源类型 · **单独一条**）

```text
**请选择 Demo 来源类型**

1. 上传包（UPLOAD · 压缩包 / 前端 mock · 默认）
2. 镜像（IMAGE · Docker 捆包 · demo-docker-deploy）

请回复序号（如 `1`）。
```

> **Agent**：静态 HTML / Vite mock zip → 选 **1**；`demo-docker-deploy` 镜像捆包 → 选 **2**。写入 `session.d03.sourceType` 并在 `upload-demo.mjs` 传 `--source-type UPLOAD|IMAGE`。**禁止**漏传（生产报「来源类型不能为空」）。

## T-UPLOAD-TYPE（§8.2 · **选上传之后、收参之前**）

```text
**请选择上传方式**

1. 新增 Demo（首次上传 · API-D03）
2. 更新已有 Demo（换包 · API-D04）

请回复序号（如 `1`）。
```

## T-UPLOAD-ENV（§8.3.1 · **单独一条**）

```text
**请选择上传环境**

1. 生产（默认 · 已部署）
2. UAT（已部署 · 预发验证）
3. 本地（开发自测，需本机网关）

请回复序号（如 `1`）。
```

> **Agent**：三环境均已部署（Q25），用户选任一序号后按常规流程上传；上传前复述所选环境与 `base_url`。

## T-SESSION-REUSE-D03（§8.3.2 · **单独一条**）

> **前置**：已选环境；读 **当前环境 + 当前项目** `readSession(env, projectRoot)`。  
> **用户已指定优先（P-SESSION-USER-OVR）**：本轮用户已给出的槽位（如 Demo 名称）**不得**出现在下方列表；无「可沿用且未指定」字段时 **跳过本模板**。  
> **`{reuse_field_lines}`**：仅含未指定字段，例如只余领域/服务时不要输出「Demo 名称」行。若用户已指定名称，可在列表上方用一行复述：`本轮 Demo 名称已按您指定：{user_name}`（**不是**沿用选项）。

```text
检测到本地已保存的上传参数（新增 Demo · D03 · {current_environment} 环境 · 项目 {project_label}）：
- 项目：{project_root}
- 环境：{current_environment}
{reuse_field_lines}

是否沿用以上**尚未由您指定**的参数？（zip 仍使用本次新打的包 {zip_path}；您已指定的字段保持不变）

**请确认是否沿用**

1. 沿用
2. 不沿用，重新提供

请回复序号（如 `1`）。
```

**`{reuse_field_lines}` 示例（用户已指定名称，仅沿用领域/服务）**：

```text
- 业务领域：{d03.businessDomainName}（id: {d03.businessDomainId}）
- 所属服务：{d03.appServiceName}（id: {d03.appServiceId}）
```

## T-SESSION-REUSE-D04（§8.3.2 · **单独一条**）

> **前置**：已选环境；读 **当前环境 + 当前项目** 会话文件。  
> 用户本轮已给 `demoId` / `demoCode` / `?d=` → **跳过本模板**（走 D04 快径），**禁止**再问是否沿用会话标识。

```text
检测到本地已保存的上传参数（更新 Demo · D04 · {current_environment} 环境 · 项目 {project_label}）：
- 项目：{project_root}
- 环境：{current_environment}
- Demo 编号：{d04.demo_id}
- Demo 编码：{d04.demo_code}

是否沿用以上参数？（zip 仍使用本次新打的包 {zip_path}）

**请确认是否沿用**

1. 沿用
2. 不沿用，重新提供

请回复序号（如 `1`）。
```

## T-D04-ID-TYPE-ASK（§8.3.3 · D04 · **单独一条** · 取代旧 T-D04-ID-ASK）

缺 `demo_id` / `demo_code` 且无法从链接解析时**必须**先发：

```text
**请选择 Demo 标识类型**（更新已有 Demo）

1. Demo 编号（纯数字，如 `65`）
2. Demo 编码（如 `DEMO-20260701-009`）
3. 研效通访问链接（自动解析 URL 中 `?d=` 为编号）

请回复序号（如 `1`）。
```

**Agent**：
- 选 **1** → **T-D04-ID-NUMBER-ASK**
- 选 **2** → **T-D04-ID-CODE-ASK**
- 选 **3** → **T-D04-ID-URL-ASK**
- 用户已直接给出编号/编码/链接 → **跳过**本菜单

## T-D04-ID-NUMBER-ASK

```text
**请提供 Demo 编号**（纯数字）

示例：`65`
```

## T-D04-ID-CODE-ASK

```text
**请提供 Demo 编码**

示例：`DEMO-20260701-009`
```

## T-D04-ID-URL-ASK

```text
**请提供研效通访问链接**

将自动解析 URL 中 `?d=` 为 Demo 编号。

示例：`http://localhost:5173/app/requirements/demos?d=65&exp=1`
```

## T-D04-ID-ASK（§8.3.3 · **已废止**）

已由 **T-D04-ID-TYPE-ASK** + **T-D04-ID-*-ASK** 分步取代；**禁止**再发无序号 bullet 版。

## T-META-UNREACHABLE（§8.3.3.0 · M01/M03 网关不可达 · **必用**）

```text
无法连接开放元数据网关，无法自动生成业务领域/服务编号列表。

- 环境：{environment}
- base_url：{base_url}
- 错误：{error_snippet}

禁止手填 businessDomainId / appServiceId。

请回复序号：
1. 启动或切换到可达环境后重试 M01/M03
2. 从 {base_url}/doc.html 抄录领域/服务，由我整理编号供您点选
3. 暂停上传，保留 zip：{zip_path}

请回复序号（如 `1`）。
```

## T-DEMO-TOKEN-ASK（本地无 token · **单独一条** · P-393）

> 与父包门禁 **T-TOKEN-ASK**（含 env_label）分离；本模板用于 Demo 上传子包收 token。

```text
**请提供开放令牌**

请求头 `X-Open-Api-Token`（非 Bearer）。

示例：`ehub_live_xxxxxxxx`
```

## T-TOKEN-FAIL-ASK（API 返回令牌无效/缺失 · **必用**）

> **触发**：上传或 M01/M03 响应 `message` 含「令牌」「token」「401」「403」等，或 `success: false` 且明确为鉴权失败。**禁止**展示已保存令牌的任何片段。

```text
开放令牌无效或已失效，无法继续上传。

**请提供新的开放令牌**

请求头 `X-Open-Api-Token`（非 Bearer）。收到后将替换本地保存并重试。

示例：`ehub_live_xxxxxxxx`
```

## T-TOKEN-SAVED（用户提供 token 后 · **自动保存 · 通知**）

> **不询问**：用户在对话中提供 token 后，**立即**执行 `node $PACK_ROOT/tools/token-store.mjs write --token "…" --environment <当前已选环境>`，**且 exit 0** 后，再发本模板（**禁止** write 失败仍发本模板）。

```text
开放令牌已保存到本地（{当前环境} 环境），供该环境后续上传复用。

保存位置（按您的系统）：
- macOS / Linux：~/.yanxiaotong/tokens/{local|uat|prod}
- Windows：C:\Users\{用户名}\.yanxiaotong\tokens\{local|uat|prod}

说明：
- 不同环境令牌分开存放，切换环境不会误用其他环境令牌
- 不会在对话中展示令牌内容
- 若上传失败提示令牌无效，请按提示更换
- 删除已保存 token 须二次确认
```

## T-TOKEN-PATH-INFO（用户问存在哪）

```text
开放 API 令牌按环境单独存放在本地（与会话参数分开）：

- 目录：~/.yanxiaotong/tokens/（Windows：C:\Users\{用户名}\.yanxiaotong\tokens\）
- 本地环境：tokens/local
- UAT 环境：tokens/uat
- 生产环境：tokens/prod
- 环境变量（可选，覆盖用）：YXT_OPEN_API_TOKEN

读取优先级（须已知当前环境）：
1. 命令行 --token（当次）
2. 环境变量 YXT_OPEN_API_TOKEN
3. 当前环境对应的 tokens/{local|uat|prod} 文件

说明：不同环境令牌互不相同；切换环境不会自动混用其他环境的令牌。
```

## T-SESSION-CLEAR-ASK（清除上传会话 · **单独一条**）

```text
您要求清除已保存的上传参数（Demo 名称、领域/服务、demoId 等）。

将删除本地会话文件（不含令牌）：
- 范围：{当前环境|全部环境} · 项目 {project_label}（路径：{project_root}）
- 目录：~/.yanxiaotong/sessions/{env_slug}/（按项目分文件）

请回复序号：
1. 确认清除
2. 取消

请回复序号（如 `1`）。
```

> **Agent**：用户选 **1** → `node $PACK_ROOT/tools/session-store.mjs clear --environment <环境> --project-root <§1 项目路径>`（默认仅本项目）；清该环境全部项目 → 省略 `--project-root`；清全部 → `clear` → 发 **T-SESSION-CLEARED**。删令牌 **不**走本模板。

## T-SESSION-CLEARED（清除成功）

```text
已清除本地上传会话参数（{当前环境|全部环境}）。令牌文件未改动。

如需删除已保存的开放令牌，请说明「删除令牌」。
```

## T-TOKEN-DELETE-ASK（第一次确认）

```text
您要求删除已保存的开放 API 令牌文件。

请回复序号确认是否继续：
1. 继续删除
2. 取消

请回复序号（如 `1`）。
```

## T-TOKEN-DELETE-CONFIRM（第二次确认 · 用户选 1 后）

```text
请再次确认：将删除已保存的令牌文件（不可恢复）：
- 目录：~/.yanxiaotong/tokens/（含 local、uat、prod 各环境文件）

请回复序号：
1. 确认删除
2. 取消

请回复序号（如 `1`）。
```

## T-M01-CONFIRM（**仅 D03 预览「修改业务领域」补路径** · `--match` 有命中 · 原样贴 CLI stdout）

> **主路径**：选类型为 D03 后可用 **T-DEMO-PREVIEW**；本模板**不得**在 **T-UPLOAD-TYPE 之前**作为主界面。  
> **触发**：用户在预览中选择修改领域，且 `fetch-metadata.mjs --kind domains --match` → `mode=confirm`。  
> 确认后须**重跑预览**（预览路径）或继续 M03（逐项路径），**禁止**手填 id。

```text
您指定业务领域：{user_keyword}
已匹配到：{matched_name}

**请确认业务领域**

1. 确认使用「{matched_name}」
2. 不对，从完整列表重新选择

请回复序号（如 `1`）。
```

> 多候选时 CLI 会列出「最相近」+ 逐项「使用「…」」+ 末项「都不对…」；结构以 stdout 为准。

## T-M03-CONFIRM（**仅预览「修改所属服务」补路径** · 原样贴 CLI stdout）

> 同 T-M01-CONFIRM；主路径用预览表。命令：`--kind app-services --business-domain-id <id> --match "<口语>"`。

```text
您指定所属服务：{user_keyword}
已匹配到：{matched_name}

**请确认所属服务**

1. 确认使用「{matched_name}」
2. 不对，从完整列表重新选择

请回复序号（如 `1`）。
```

## T-M01-PICK（无口语名 · 或 `--match` 未命中 · 或用户否认确认 · 原样呈现）

> `--match` 未命中时 CLI 会在列表前附「未匹配到…」说明，**整段 stdout 原样贴**（可不再手工包一层「请选择业务领域」）。

```text
请选择业务领域（回复序号）：
{脚本编号列表}

请回复序号。
```

## T-M03-PICK

```text
请选择所属服务（回复序号）：
{脚本编号列表}

请回复序号。
```

---

## E. 上传执行与交付

## T-UPLOAD-DO

```text
当前正在执行 Demo 包上传（{D03|D04} · {环境}）…
```

## T-VERIFY

```text
当前正在校验上传响应…
```

## T-DELIVER-OK

> **访问链接**：须经 `normalizeAccessUrlForDelivery`（去掉 `f=1`/`expFs` 全屏标志）。API 原始全屏深链从对话打开时易显空白；交付**非全屏**体验链。  
> **详情页链接**：仅 `?d=`，不自动进体验；访问链接内容空白时可先开详情再点体验。

```text
上传成功。流程结束。

| 项目 | 内容 |
|------|------|
| Demo 编号 | {demoId} |
| Demo 编码 | {demoCode} |
| 访问链接 | {accessUrl} |
| 详情页链接 | {detailUrl} |
```

## T-DEMO-NO-DEPLOY-ROOT（D03 · 领域无部署根 · **必用**）

> **触发**：D03 响应 `message` 含「尚未配置部署根目录」「无部署根」等。

```text
上传失败：业务领域「{domainName}」尚未配置部署根目录，无法创建 Demo。

请重新选择**已配置部署根**的业务领域后重试 D03：

1. 重新选择业务领域（我将再次拉 M01 列表）
2. 暂停上传，保留 zip：{zip_path}

请回复序号（如 `1`）。
```

> **Agent**：用户选 **1** → 重新 **T-M01-PICK**（**禁止**手填 id）；选其它领域后重试 `upload-demo.mjs`。参考 `router/open-api-common.md` §M01 跨子包约束。

## T-DEMO-DOMAIN-SERVICE-MISMATCH（D03 · 领域与服务不匹配 · **必用**）

> **触发**：D03 响应 `message` 含「不匹配」「应用/服务不匹配」等。**禁止**复用 requirement M01 人话。

```text
上传失败：业务领域「{domainName}」与所选应用/服务「{serviceName}」不匹配。

请重新选择所属服务（M03 编号点选）或更换业务领域：

1. 重新选择应用/服务（M03 列表）
2. 重新选择业务领域（M01 列表）
3. 暂停上传，保留 zip：{zip_path}

请回复序号（如 `1`）。
```

> **Agent**：**禁止**手填 `appServiceId`；须 `fetch-metadata.mjs` 拉 M03（`--business-domain-id` 为当前领域）。

## T-DELIVER-FAIL

```text
上传失败。流程结束。

原因：{message}

未返回有效 accessUrl，请勿使用猜测链接。
```

---

## F. 禁止

- **禁止**跳过 T-FIX-ASK 直接改代码（**例外**：用户**同条**消息含 `直接改` / `不确认` / `你看着办`）
- **禁止**一条消息里并列多个「请回复序号」选择题（须 **T-UPLOAD-MULTI-REJECT** 纠错）
- **禁止**无序号的选择题（如仅「是否上传？」而无 1/2）
- **禁止**在 T-FIX-ASK 同一条里写「拟修复」却又在同一轮工具调用中执行修复
- **禁止**未 `token-store.mjs write` 成功即发 T-TOKEN-SAVED
- **禁止**在 T-SESSION-REUSE-* / 上传进度 / 交付中展示令牌（含脱敏）
- **禁止**网关不可达时手填 M01/M03 ID（须 T-META-UNREACHABLE）
- **禁止**将用户本轮已指定的 Demo 名称 / D04 标识等列入 **T-SESSION-REUSE-***，或用会话旧值覆盖（P-SESSION-USER-OVR）
