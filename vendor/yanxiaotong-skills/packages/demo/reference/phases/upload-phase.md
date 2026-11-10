# yanxiaotong-demo · 上传阶段（Upload Phase）

> **何时读**：zip 已生成（pack-phase 步骤 3b 完成）且用户意图含上传 / D03 / D04。  
> **深读**：`reference/upload/open-api-upload.md`（D03/D04 契约与 curl）。  
> **禁止**：zip 未就绪时进入；**禁止**未经 §8.2 确认即假定 D03/D04；**禁止** D03 未齐 name/领域/服务就 curl。  
> **进度**：各子步 **`当前正在…`**（`progress-display.md`）。  
> **话术**：对用户消息 **须套用** `response-templates.md`；**一次一问**。合并序号 → **T-UPLOAD-MULTI-REJECT**。

## 简化矩阵（可跳过 vs 仍须分条）

| 条件 | 可跳过 | 仍须（单独一条消息） |
|------|--------|----------------------|
| 首句含路径+上传 | T-ZIP-DONE「是否上传」 | **§8.2 T-UPLOAD-TYPE** → 再按类型收参 |
| 开篇已明确 D03/D04 | T-UPLOAD-TYPE 二选一 | 复述类型后进 §8.3（D03 再 §8.15 / 逐项；D04 收标识） |
| D03 + 已有名称/口语领域/会话可展示 | 空表预览 | **§8.15 预览**确认/修改；未齐再 §8.3.3 |
| D03 + 名称与领域/服务均空 | §8.15 空预览表 | **直接 §8.3.3** 一次一项（名称 → M01 → M03） |
| 预览后用户选修改 | — | **T-DEMO-PREVIEW-EDIT** 一次改一项；改完 **重新跑预览** |
| D04 + token +（用户已给标识或会话有 id/code） | T-SESSION-REUSE-D04 | 类型确认后进 8.4（**D04 快径**；**跳过** §8.15） |
| D03 + 预览/点选已齐 name/领域/服务 | T-SESSION-REUSE-D03、分条 T-M01/M03 确认 | 可直接 8.4 |

**禁止**：为省轮次在同条并列多道序号题。  
**禁止**：在 **T-UPLOAD-TYPE 之前**向用户抛出预览表 / T-M01 / T-M03 / 名称收集（先定新增或更新，再收对应参数）。  
**禁止**：对 **D04** 强制收集或预览业务领域/所属服务。  
**禁止**：用户本轮已明确给出的字段被会话旧值覆盖（P-SESSION-USER-OVR）。

## 8.1 询问是否上传（**必须** · 有条件简化）

zip 已生成后：**默认**发 **T-ZIP-DONE**（**必须原样粘贴**模板全文，含 `1.` `2.` 序号 · P-193）。

**可简化**：用户开篇已明确上传 → **跳过** T-ZIP-DONE，**同轮进入 §8.2**（先问 D03/D04，**不要**先出预览表）。

| 用户选择 | 动作 |
|----------|------|
| **2** | **T-ZIP-ONLY-END** |
| **1** | 进入 **§8.2**（**不是**直接 §8.15） |

## 8.2 上传类型（**选上传之后 · 收参之前 · 强制**）

**默认**：发 **T-UPLOAD-TYPE**（**单独一条**；**不要**再塞参数表或预览表）。

**可跳过二选一**：开篇已明确 D03/D04 → 复述类型后进 §8.3：

```text
按您先前说明：本次为 <D03 新增 / D04 更新>，继续收集参数。
```

**禁止**静默假定 D03 或 D04。

| 用户选择 | 动作 |
|----------|------|
| **1** 新增（D03） | 进入 **§8.3**（D03 支路：有底稿则 **§8.15**，否则逐项 §8.3.3） |
| **2** 更新（D04） | 进入 **§8.3**（D04 支路：收标识；**跳过** §8.15） |

## 8.15 Demo 信息预览（**仅 D03 · 选类型之后**）

> **目标**：D03 场景下，把已有名称/口语领域/会话底稿在**后台**模糊匹配后，用**一张预览表**确认或修改，再上传。  
> **不适用于 D04**（更新只需 Demo 标识）。

### 8.15.0 是否出预览表

| 条件 | 动作 |
|------|------|
| 类型 **不是** D03 | **禁止**跑预览 |
| D03 且 name、领域、服务在用户指定/会话中**均无可用值** | **跳过**空预览表 → 直接 §8.3.3 一次一项 |
| D03 且至少一项有值（用户指定 / 会话 / 口语可匹配） | 跑 `preview-upload-params.mjs` → 贴 **T-DEMO-PREVIEW** |

### 8.15.1 后台组装（对用户静默细节）

发进度句：**当前正在整理 Demo 信息预览（后台匹配领域/所属组）…**  
**同轮**执行（**禁止**只发进度句停手）：

```bash
node <技能包>/tools/preview-upload-params.mjs \
  --environment <环境> \
  --project-root "<§1 项目路径>" \
  --zip "<zip_path>" \
  [--name "<用户指定名称>"] \
  [--domain-keyword "<业务领域口语>"] \
  [--service-keyword "<所属组/服务口语>"]
```

| 输入优先级 | 规则 |
|------------|------|
| Demo 名称 | 用户本轮指定 > 会话 `d03.name` > 待填写 |
| 业务领域 | 有口语 → M01 `--match` 取最相近；无口语 → 可沿用会话领域 id+name |
| 所属服务 | 领域已有候选 id 后拉 M03；有口语则匹配；无口语可沿用会话服务 |

- **stdout**：预览表 + 确认序号（**T-DEMO-PREVIEW**）→ Agent **原样贴**  
- **stderr**：`preview_json=…`（含 id，供后续上传；**禁止**贴给用户）  
- 网关失败 → **T-META-UNREACHABLE**（可附 zip 路径）；**禁止**手填 id  

### 8.15.2 用户确认 / 修改

| 用户选择 | 动作 |
|----------|------|
| **1** 确认 | 采用预览中的 name / domain / service（及 stderr ids）→ 仍缺则 §8.3.3，已齐则 **§8.4** |
| **2** 修改 | 发 **T-DEMO-PREVIEW-EDIT** → 一次只改一项 → 改完**重新**跑 `preview-upload-params.mjs` 再贴预览表 |

修改领域/服务时：可用 `fetch-metadata.mjs` 无 `--match` 的 **T-M01-PICK** / **T-M03-PICK**，或带 `--match` 的候选确认；**改完必须回到预览表**，不得跳过预览直接上传。

**禁止**：把分条「已匹配到：xxx」当作 **T-UPLOAD-TYPE 之前**的主界面；类型未定时不得收集 D03 领域/服务。

## 8.3 收集参数（**确认类型后**）

> **会话 SSOT**：`session-store.md` · **令牌 SSOT**：`token-store.md`

**顺序**：① 环境（继承 `selected_env`）→ ② 类型已确认 → ③ 按类型收参（D03：预览或逐项；D04：标识）→ ④ 本次 `zip_path` → ⑤ 回写会话。

| 阶段 | 公共 | D03 追加 | D04 追加 |
|------|------|----------|----------|
| ① 环境 | **继承**；用户显式改环境才 **T-UPLOAD-ENV** | — | — |
| ③ 底稿 | — | 有值 → §8.15；全空 → §8.3.3 | **跳过**预览；收 demoId/code |
| ③′ 沿用 | 已确认/已指定字段**不再**发 T-SESSION-REUSE-* | 仅未覆盖且会话有值的缺口 | 未指定的 demoId/code |
| ④ 仍缺 | **T-DEMO-TOKEN-ASK** | 缺 name → **T-DEMO-NAME-ASK**；缺领域/服务 → §8.3.3 | **T-D04-ID-TYPE-ASK** |
| ⑤ zip | 本次构建产出 | — | — |

### 8.3.1 环境（Q19 · **默认继承父包**）

**默认**：复述「上传环境：{env_label}」（预览表已展示则可不再单独提问）。  
**仅当用户显式改环境**时发 **T-UPLOAD-ENV**。

### 8.3.2 本地会话 · 是否沿用（类型确认后）

读 `readSession(<当前环境>, <§1 项目路径>)`。

- 预览已确认或用户本轮已指定的字段 → **禁止**再发 T-SESSION-REUSE-* 询问同一字段。  
- 仅当预览未含、用户未指定、会话仍有值时，才发 **T-SESSION-REUSE-***（少见）。  
- **D04 快径**：类型为 D04 且 token +（用户已给标识或会话有 id/code）→ 可跳过沿用问，进 8.4。

#### 用户已指定字段（本轮优先 · P-SESSION-USER-OVR）

| 槽位 | 典型用户表述 |
|------|----------------|
| D03 `name` | 「名称为 IT研效通-测试」 |
| D03 领域/所属组口语 | 「业务领域平台组」「所属组平台组」→ **进预览后台匹配**，不以手填 snowflake 上传 |
| D04 标识 | `demoId=120` / `DEMO-…` / `?d=` URL |

### 8.3.3.0 元数据 API 不可达

发 **T-META-UNREACHABLE**；**禁止**手填 domain/service id。

### 8.3.3 逐项补齐（**D03 · 无预览底稿或预览未齐 · 一次一项**）

| 顺序 | D03 | D04 |
|------|-----|-----|
| 1 | `token` | `token` |
| 2 | `name`（仅缺省 → **T-DEMO-NAME-ASK**） | **T-D04-ID-TYPE-ASK**（仅缺标识） |
| 3 | **`sourceType`**（仅缺省 → **T-SOURCE-TYPE-ASK**；静态/mock zip 选 **UPLOAD**；Docker 镜像捆包选 **IMAGE**） | — |
| 4 | M01 点选/匹配（仅领域未齐） | — |
| 5 | M03 点选/匹配（仅服务未齐） | — |

**D03 强约束**：**禁止**手填 FID；id+name 须来自预览确认或 M01/M03 API。  
**D03 `sourceType` 强约束**：上传前 **必须**有 `UPLOAD` 或 `IMAGE`（会话 / 预览确认 / **T-SOURCE-TYPE-ASK**）；**禁止**漏传（生产会报「来源类型不能为空」）。

#### 8.3.3.1 D03 · 业务领域（API-M01）

**有口语/会话时可先 §8.15**；否则或补齐/修改时：

```bash
node <技能包>/tools/fetch-metadata.mjs --kind domains --environment <环境> [--match "<口语>"]
```

| 场景 | Agent |
|------|--------|
| 修改项=领域且有口语 | `--match` → 确认或列表 → **重跑预览**（若走预览路径） |
| 无口语 / 未命中 / 跳过空预览 | **T-M01-PICK** 完整列表 → 记下 id+name → 继续 M03 或重跑预览 |

**禁止**手填 snowflake。遇 **T-DEMO-NO-DEPLOY-ROOT** → 换领域重试。

#### 8.3.3.2 D03 · 所属服务（API-M03）

同 §8.3.3.1；须带 `--business-domain-id`。**勿**用 M02。

```bash
node <技能包>/tools/fetch-metadata.mjs --kind app-services --environment <环境> \
  --business-domain-id <id> [--match "<口语>"]
```

### 8.3.4 回写本地会话（**必须**）

`writeSession` 写入当前环境+项目（**不含 token**）。

## 8.4 执行上传

```bash
node <技能包>/tools/upload-demo.mjs --mode d03 --environment 本地 --project-root "<§1 项目路径>" --zip "<zip_path>" \
  --token "<token>" --name "<Demo名称>" --source-type UPLOAD \
  --business-domain-id "..." --business-domain-name "..." \
  --app-service-id "..." --app-service-name "..." --save-session
```

D03：`--source-type` **必填**（`UPLOAD`=压缩包/前端 mock；`IMAGE`=Docker 镜像捆包）。  
D04：`--mode d04` + `--demo-id`。  
demo-docker-deploy（镜像主路径）须追加 `--expect-source-type IMAGE`；`SOURCE_TYPE_MISMATCH` 时脚本非 0 退出，勿当成功。

**响应校验**：

```bash
node <技能包>/scripts/verify-upload-response.cjs /path/to/response.json
```

鉴权失败 → **T-TOKEN-FAIL-ASK**。  
无部署根 → **T-DEMO-NO-DEPLOY-ROOT**。  
领域/服务不匹配 → **T-DEMO-DOMAIN-SERVICE-MISMATCH**。

## 8.5 终态交付（**必须**）

| 结果 | 输出 |
|------|------|
| **上传成功** | 非全屏 `accessUrl` + 详情页链接 + `demoId`/`demoCode`；流程结束 |
| **上传失败** | `message`；**禁止**编造 `accessUrl` |
| **未上传** | `zip_path`；流程结束 |

## 8.6 清除会话 / 令牌（用户主动 · 非主路径）

| 意图 | 动作 |
|------|------|
| 清除会话 | **T-SESSION-CLEAR-ASK** → `session-store.mjs clear` |
| 删除令牌 | `token-store.md` + `token-store.mjs delete` |
