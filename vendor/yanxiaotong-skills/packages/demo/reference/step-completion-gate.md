# Step Completion Gate（yanxiaotong-demo）

## 出包（§1.0 + §1～§6 + 步骤 3/3b，不含 §8）

- [ ] 已读 **`reference/boot.md`**（PACK_ROOT + 最小必读 4 文件）
- [ ] **T-FIX-ASK + [AGENT-GATE]**：改代码前已发模板且用户回复 **1**（§3 · `response-templates.md`）
- [ ] **无阻塞时跳过 T-CHECK-DONE**，直接构建（§1 步骤 2）
- [ ] **固定话术 + 序号选项**；§8 **一次一问**；合并回复已 **T-UPLOAD-MULTI-REJECT**
- [ ] **一步一响应**：各步有 **`当前正在…`**（§5）
- [ ] **非提问步骤发完 `当前正在…` 未停手**（检查/构建/打 zip 同轮继续；仅 T-FIX-ASK 与 §8 提问可等回复 · `progress-display.md` 铁律 5）
- [ ] 已判定项目形态（§1.0）；纯静态 HTML 已跳过 build
- [ ] 项目路径已固定（含 `@文件夹` 已 Glob 确认）；检查项已闭环或书面例外
- [ ] 已生成 `.zip`（**首选** `$PACK_ROOT/tools/pack-mock-zip.mjs`；**须本次流程新打**）
- [ ] Windows Shell 未使用 `cd &&`（PowerShell 用 `Set-Location; …`）
- [ ] 外系统问题已区分记录

## 上传确认（§8.1～8.2 · 若进入上传）

- [ ] zip 就绪后已问是否上传（**快捷启动**可跳过 T-ZIP-DONE）；**T-ZIP-DONE** 须原样含 `1.` `2.` 序号（P-193）
- [ ] 选上传后已问 D03/D04（**T-UPLOAD-TYPE**；**开篇已明确类型**可复述跳过）；**禁止**在选类型前贴预览表或收 D03 领域/服务
- [ ] **D03**：有底稿则已跑 **preview-upload-params.mjs** 并贴 **T-DEMO-PREVIEW**；全空则跳过空表，直接名称/M01/M03；**D04**：已跳过预览

## 上传执行（§8.3～8.5）

- [ ] **令牌**：静默解析（**当前环境** `~/.yanxiaotong/tokens/{slug}`）；**禁止**在 T-SESSION-REUSE-* 等对话展示令牌；write 须 **`--environment`** 且 exit 0 后发 **T-TOKEN-SAVED**；失败 **T-TOKEN-FAIL-ASK**
- [ ] **会话**：**当前环境 + 当前项目** `~/.yanxiaotong/sessions/{env_slug}/{project_slug}`；沿用/回写按 `session-store.md`（**须** `readSession(env, §1 项目路径)`）；清除会话 **T-SESSION-CLEAR-ASK**
- [ ] **用户已指定优先**：本轮已给出的 Demo 名称 / D04 标识等已直接采用，且**未**出现在 **T-SESSION-REUSE-***「请确认是否沿用」列表中（P-SESSION-USER-OVR）
- [ ] **环境**已选；D04 快径或 **T-SESSION-REUSE-***（仅未指定字段）已按 §8 简化矩阵处理；无可沿用未指定字段时已跳过沿用问
- [ ] D04 已收标识（用户给出 / 快径 / **T-D04-ID-TYPE-ASK**）；D03 名称/领域/服务以**预览确认或 M01/M03 点选**为准；D03 **`sourceType` 已齐**（预览确认 / **T-SOURCE-TYPE-ASK** / `--source-type`），**禁止**空来源类型上传
- [ ] zip 命名含 **YYYYMMDDHHmmss**（见 `zip-output.md` · P-192）
- [ ] 网关不可达已发 **T-META-UNREACHABLE**（禁止手填 ID）
- [ ] **沿用或不沿用**后已 **回写**本地会话（`demo_id` + `demo_code` 双字段）
- [ ] `zip_path` 为本次新打 zip
- [ ] 上传已执行；**首选** `$PACK_ROOT/tools/upload-demo.mjs`
- [ ] 响应已校验：`verify-upload-response.cjs` **或** 人工核对 JSON
- [ ] **对用户**已交付真实 `accessUrl` 或失败原因
- [ ] **禁止** verify 失败时编造 `accessUrl`
- [ ] 已标明 **流程结束**

**出包未通过 → 不得 curl 上传** · **禁止**使用用户自带旧 zip
