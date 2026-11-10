# Step Completion Gate（yanxiaotong-original-requirement）

- [ ] 已继承父包 `selected_env` + token；`original_requirement_api` 为 ready（或已如实告知不可用）
- [ ] 已发 **T-ROUTER-OR-HANDOFF** / 操作类型已明确；内部 `operation` 与 phase 一致
- [ ] 创建：六必填齐备；领域为 M01 点选；未猜 id；用户明示提出人/验收人时已分别 M05 点选并写入对应字段，未提则未传；二者独立未错误联动；有可提炼正文时标题已解析/提炼（未无故先问标题）；**原始需求描述与价值已自动提炼/生成**（未无故追问；描述非痛点整段复贴）；交付日为当天或用户显式日期（未无故追问）；**T-CREATE-CONFIRM** 含三正文 + 人员 + 交付日
- [ ] **T-CREATE-DONE** 含可点击 **详情链接**（`web-detail-url` · 禁止编造）；优先原样贴 `create --human`（含环境行）
- [ ] create 成功后 **未**再手写/覆盖 session（依赖 CLI `writeSessionFile`）
- [ ] M05：已拉元数据；仅 1 条已直采复述（未多余追问序号）；≥2 已点选；未手填
- [ ] 确认后若改口径：已重发确认，未跳过确认直接写操作
- [ ] 更新：路径为 OR 编号；白名单字段（含 `proposer` / `requirementAcceptancePerson` 时须经 M05 拼装；改其一不自动改另一）；终态未强改
- [ ] 已调用 `original-requirement-api.mjs` 且 `verify-original-requirement-response.cjs` 通过
- [ ] 失败已走 `error-humanize.md`；**未**伪造成功
- [ ] 交付话术为中文模板（`--human` 或 `response-templates.md`）
- [ ] **未**声称受理状态/关联/不采纳已通过开放 API 完成
- [ ] Windows 下未用失效的 `&&` 串联导致漏跑 verify；含中文 body **未**用 `node -e` 内联写入（已用 Write/`fs.writeFileSync` 落盘后再 `--json`）
