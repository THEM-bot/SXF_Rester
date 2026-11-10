# 研效通 Demo 开放 API 上传（契约 SSOT）

> **何时查阅**：用户**确认上传**且类型（D03/D04）已明确后、curl **执行前**加载。  
> **速查优先**：[`open-api-upload-quickref.md`](./open-api-upload-quickref.md)（执行顺序 + 命令 · P-363）  
> **本文件即离线契约 SSOT**；工作区含 `efficiency-hub-java` 且参数存疑时，以 Java Controller/Model 为准。

## 执行前（schema-first）

**先读本文件再 curl**。常见错误：

| 错误 | 正确 |
|------|------|
| 整段 `application/json` body 传 metadata | `multipart/form-data`：`metadata` 表单字段 + `file` part |
| `Authorization: Bearer` | `X-Open-Api-Token` |
| D04 仍传 metadata | 路径 `demoId` + **仅** `file` |
| 未询问即假定 D03 | 须用户显式选择 D03/D04（见 `phases/upload-phase.md` §8.2） |
| 用用户自带 zip 跳过出包 | zip **必须**为本次 build 后新打（见 `instructions.md` 执行优先级 §7） |
| D03 手填领域/服务名 | **禁止**手填 FID；选 **D03** 后口语名后台匹配进 **§8.15 预览表**确认，否则列表点选（见 `phases/upload-phase.md`） |

## 环境与 URL

> **收参顺序、本地会话沿用**：见 `reference/phases/upload-phase.md` **§8.3**（SSOT）。  
> **地址唯一维护处**：父包 `tools/lib/env-registry.json`（经 `selected_env` / `env-session lookup`）。**禁止**在本文件再写一套 host。

| 项 | 说明 |
|----|------|
| `base_url` | 所选环境 `base_url`；**含** context-path，**不含** `/doc.html`，无尾斜杠 |
| 文档入口 | `{base_url}/doc.html` |
| 完整 API | `{base_url}/api/open/...` |
| 预览源站 | 所选环境 `web_origin` |

打印当前值：`node "$SKILL_ROOT/tools/env-session.mjs" list`

### 开放 API 部署现状（Agent 话术依据）

| 环境 | D03/D04 上传 · M01/M03 | Agent 对用户说明 |
|------|------------------------|------------------|
| **生产** | ✅ **已部署**（Q25） | **默认环境**；可正常上传与查元数据 |
| **UAT** | ✅ **已部署** | 可正常上传与查元数据；预发验证 |
| **本地** | ✅（需本机网关，见 JSON `local.base_url`） | 开发自测 |

> 预览链接（`accessUrl`）源站见下节；与上表 API 是否部署无关。

### 预览链接（`accessUrl` · 仅交付用户时）

> **上传 / 元数据查询**仍用所选环境 **`base_url`**，**不变**。  
> API 返回的 `data.accessUrl`（常为 `…&exp=1&pv=…&f=1` 全屏体验链）交付前须：  
> 1. 重写为用户可访问的 **预览源站**（`web_origin`）；  
> 2. **删除** `f` / `expFs`（全屏）——从对话打开带 `f=1` 的深链时 iframe 资源未就绪易显整页空白；  
> 3. 另附 **详情页链接** `{预览源站}/app/requirements/demos?d={demoId}`。  
> `upload-demo.mjs` 已自动处理（`normalizeAccessUrlForDelivery` + `buildDemoDetailShareUrl`）；手写 curl 时 Agent 须同样处理后再交付。

重写规则：`{web_origin}{pathname}{search}{hash}` → 再剔 `f`/`expFs`（当 `exp=1`）。

统一响应包裹：`Result<T>` — 成功时 `success: true`，`data` 为业务体；失败时 `success: false`，`code` + `message`。

## 鉴权

```http
X-Open-Api-Token: ehub_live_<plain>
```

- 不走 Sa-Token / Cookie 登录
- **禁止** `Authorization: Bearer ...`
- 日志须脱敏 token

## 上传类型判定

| 场景 | ID | 方法 | 路径 |
|------|-----|------|------|
| **仅新建草稿** | D03b | POST | `/api/open/demos`（JSON，无 file；缺省 sourceType=IMAGE） |
| **新增上传** | D03 | POST | `/api/open/demos/package-upload` |
| **更新上传** | D04 | POST | `/api/open/demos/{demoId}/package-upload` |

**D03b**：`node tools/create-demo.mjs`；成功返回 `demoCode` 供捆包技能写库。出包后默认走 **D04**。  
**demo-docker-deploy 主路径**：须 `--source-type IMAGE --require-binding`，并带齐 `business-domain-*` / `app-service-*`（禁止空壳创建）。  
**D04 校验**：捆包主路径上传须 `--expect-source-type IMAGE`；响应 `sourceType` 不一致时脚本打印 `SOURCE_TYPE_MISMATCH=` 并以 **非 0** 退出。  
**须先显式选择** D03 或 D04（见 `phases/upload-phase.md` §8.2），**再**按类型收参（D03 可 §8.15 预览；D04 只收标识）；**禁止**在未询问时默认 D03（①已建壳除外，默认 D04）。

## 执行方式

> **路径**：脚本与校验均用 **本技能包绝对路径**（见 `instructions.md` Agent 工具选择表）。

| 方式 | 说明 |
|------|------|
| **首选** | `node <技能包>/tools/upload-demo.mjs` · D03 元数据 `fetch-metadata.mjs`；见 `phases/upload-phase.md` §8.4 |
| **无 Node** | `upload-demo.ps1` / `.sh`（`-File` 绝对路径）或下文 curl |
| 手写 | curl 示例 + **校验** `verify-upload-response.cjs`（**勿**用 `.js`） |
| 无 Node 校验 | **人工核对 JSON**（见下节） |

**收参与本地会话**：`phases/upload-phase.md` §8.3 · `session-store.md`。

### 无 Node 时人工核对响应

`verify-upload-response.cjs` 不可用时，上传后**必须**对照响应 JSON：

| 字段 | 成功要求 |
|------|----------|
| `success` | `true` |
| `data.accessUrl` | 非空，**须来自响应** |
| `data.demoId` 或 `demoCode` | 存在 |

HTTP 非 2xx、`success: false` 或缺 `accessUrl` → **禁止**向用户输出可点击链接。

---

## D03 · 新增上传

| 项 | 值 |
|----|-----|
| Content-Type | `multipart/form-data` |

| 参数名 | 绑定 | 类型 | 必填 | 说明 |
|--------|------|------|------|------|
| metadata | 表单字段 | string（JSON） | 是 | 见下表 |
| file | 文件 part | binary | 是 | zip 等静态包 |

### metadata JSON 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| name | **是** | Demo 名称 |
| sourceType | **是** | `UPLOAD` / `IMAGE`（或中文「上传包」「镜像」）；缺省或非法 → FAIL |
| businessDomainId | **是**（D03 标准路径） | 业务领域 FID；**须**经 M01 列表点选，**禁止**手填 |
| businessDomainName | **是**（与 id 成对） | 领域展示名；来自 M01 选中项 |
| appServiceId | **是**（D03 标准路径） | 应用/服务 FID；**须**经 M03 列表点选，**禁止**手填 |
| appServiceName | **是**（与 id 成对） | 应用/服务展示名；来自 M03 选中项 |

**责任人（服务端写入，metadata 不传）**：取 Token 对应用户，落库 `ownerName` 为 **姓名+工号**（与站内列表一致；姓名已含工号则不重复拼接）。技能包侧无需也不应手填责任人。

**标准 D03 路径**（`phases/upload-phase.md` §8.2→§8.15/§8.3.3→§8.4）：选 D03 → 预览或逐项确认 name/领域/服务/**来源类型** → 上传。metadata 须同时携带 id + name + `sourceType`。

**仅 E2E/烟测**可只传 `name`+`sourceType`（服务端自动补全首个领域/项目）；**对用户对话主路径禁止**跳过 M01/M03 或手填领域/服务名。

```json
{"name":"IDE演示包","sourceType":"UPLOAD","businessDomainId":"1899408351909954560","businessDomainName":"流程 IT","appServiceId":"2424906847371708416","appServiceName":"千流需求管理系统"}
```

### curl 示例

```bash
curl -sS -X POST "${BASE_URL}/api/open/demos/package-upload" \
  -H "X-Open-Api-Token: ${TOKEN}" \
  -F 'metadata={"name":"IDE演示包","sourceType":"UPLOAD","businessDomainId":"1899408351909954560","businessDomainName":"流程 IT","appServiceId":"2424906847371708416","appServiceName":"千流需求管理系统"}' \
  -F "file=@${ZIP_PATH}"
```

`metadata` 为**表单字段** JSON 字符串，不是独立 JSON body。

### 跨平台一键脚本

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File tools/upload-demo.ps1 `
  -Mode d03 -Environment 本地 -ZipPath "..." -Token "..." -Name "..." -SaveSession
```

```bash
# macOS / Linux / WSL
bash tools/upload-demo.sh --mode d03 --environment 本地 \
  --zip "..." --token "..." --name "..." --save-session
```

手写 `curl.exe`（脚本不可用时）：

```powershell
curl.exe -sS -X POST "$BASE_URL/api/open/demos/package-upload" `
  -H "X-Open-Api-Token: $TOKEN" `
  -F "metadata={\"name\":\"IDE演示包\"}" -F "file=@$ZIP_PATH"
```

> 使用 **`curl.exe`**；`-F metadata` 内 JSON 双引号须转义。

### 响应 200 `data` 示例

```json
{
  "demoId": "3001",
  "demoCode": "DEMO-20260630-001",
  "name": "IDE演示包",
  "businessDomain": "流程 IT",
  "status": "草稿",
  "publishVersionId": "4001",
  "accessUrl": "https://demo.example.com/...",
  "createdAt": "2026-06-30T15:00:00"
}
```

关注：`demoId`、`demoCode`、`publishVersionId`、`accessUrl`。

### D03 错误

| HTTP | 场景 | Agent 话术 |
|------|------|------------|
| 401 | Token 缺失/无效 | **T-TOKEN-FAIL-ASK** |
| 400 | name 空、**无部署根**、**领域/服务不匹配**、无可用项目、文件非法/超限 | 无部署根 → **T-DEMO-NO-DEPLOY-ROOT**；不匹配 → **T-DEMO-DOMAIN-SERVICE-MISMATCH**；其余 → **T-DELIVER-FAIL** |

---

## D04 · 更新上传

| Path | 说明 |
|------|------|
| demoId | Demo 主键 ID 或 `demoCode` |

| Part | 必填 | 说明 |
|------|------|------|
| file | 是 | 新版本 zip |

```bash
curl -sS -X POST "${BASE_URL}/api/open/demos/${DEMO_ID}/package-upload" \
  -H "X-Open-Api-Token: ${TOKEN}" \
  -F "file=@${ZIP_PATH}"
```

响应体同 D03；`publishVersionId` 为新版本。

### D04 错误

| HTTP | 场景 |
|------|------|
| 404 | Demo 不存在 |
| 403 | 非负责人且非管理员 |
| 400 | Demo 未关联业务领域、文件非法 |
| 401 | Token 无效 |

---

## D03 · 领域与服务选择（API-M01 / M03 · 必须）

> **执行顺序**：`phases/upload-phase.md` §8.3.3.1～8.3.3.2。curl 上传前 **必须**已有点选得到的 id+name。

### API-M01 · 业务领域

**推荐脚本**（编号列表，供用户点选）：

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File tools/fetch-metadata.ps1 `
  -Kind domains -Environment 本地 -Token $TOKEN
# 用户回复序号 2 后解析选中项：
powershell -File tools/fetch-metadata.ps1 -Kind domains -Environment 本地 -Token $TOKEN -PickIndex 2
```

```bash
# macOS / Linux / WSL
bash tools/fetch-metadata.sh --kind domains --environment 本地 --token "$TOKEN"
bash tools/fetch-metadata.sh --kind domains --environment 本地 --token "$TOKEN" --pick-index 2 --output json
```

手写 GET（脚本不可用时）：

| Query | 说明 |
|-------|------|
| `current` / `size` | 分页；**禁止** `page` |
| `keyword` | 可选；用户要筛选时带上 |
| `fetchAll` | `true` 时全量（上限 2000） |

响应 `data.records[]`：`id` → `businessDomainId`，`name` → `businessDomainName`。

```json
{
  "success": true,
  "data": {
    "records": [{ "id": "1899408351909954560", "name": "流程 IT" }],
    "total": 1,
    "current": 1,
    "size": 50
  }
}
```

**Agent 展示**：编号列表 + 序号点选；**禁止**让用户手填领域名。

### API-M03 · 所属应用/服务

**推荐脚本**：

```powershell
powershell -File tools/fetch-metadata.ps1 -Kind app-services -Environment 本地 `
  -Token $TOKEN -BusinessDomainId $DOMAIN_ID
```

```bash
bash tools/fetch-metadata.sh --kind app-services --environment 本地 \
  --token "$TOKEN" --business-domain-id "$DOMAIN_ID"
```

手写 GET（脚本不可用时）：

```http
GET {base_url}/api/open/metadata/app-services?businessDomainId=<id>&keyword=&current=1&size=50
X-Open-Api-Token: <token>
```

响应 `data.records[]`：`id` → `appServiceId`，`name` → `appServiceName`。

**Agent 展示**：在已选领域下编号列表 + 序号点选；**禁止**手填服务名。

### API-M02 · 项目（D03 不用于用户选择）

| GET | `/api/open/metadata/projects?businessDomainId=&keyword=` |

D03 的 `systemCode` 由服务端按领域自动解析；**勿**用 M02 代替 M03 让用户选服务。

---

## 交付摘要（须输出）

**对用户**：成功时 **必须**给出可点击 `accessUrl` 并标明流程结束（见 `phases/upload-phase.md` §8.5）。  
**对话留证**：须含 curl 退出码与 JSON 片段；禁止编造 `accessUrl`。**上传成功后须跑**（`PACK_ROOT` = 本 demo 子包根，见 `boot.md`）：

```bash
# 通用：响应已落盘为 response.json
node <PACK_ROOT>/scripts/verify-upload-response.cjs response.json
```

```powershell
# Windows PowerShell（禁止 bash << heredoc）
node "$PACK_ROOT/scripts/verify-upload-response.cjs" 'C:\path\to\response.json'
# 或管道：'{"success":true,"data":{...}}' | node "$PACK_ROOT/scripts/verify-upload-response.cjs"
```

```text
[yanxiaotong-demo upload]
- zip: <zip_path>
- API: D03|D04
- curl_exit: <0|非0>
- response_snippet: <JSON 片段>
- demoId / demoCode: ...（来自 JSON）
- accessUrl: ...（来自 JSON，无则写「响应未返回」）
- 状态: 成功|失败（message）
```

## 禁止

- 无有效 `zip_path` 时上传源码目录
- 引用仓库外接口文档代替本文件
