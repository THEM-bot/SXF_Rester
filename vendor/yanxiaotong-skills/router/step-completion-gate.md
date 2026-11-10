# Step Completion Gate（yanxiaotong-skills · 路由层）

> **与子包 Gate 关系**：子包 `reference/step-completion-gate.md` **未逐项通过** → 本层**不得**勾选「子包交付摘要已输出」。

- [ ] §0a：已对**本轮 `@` 首句**执行 **`entry-bootstrap`**（**未**用 `cd && node`）；无环境词 → **默认生产**；UAT/本地须当轮明确写出；路由卡含 `selected_env`
- [ ] §0c：token 通过后 **@ 后无论有无输入** 已在 `entry-bootstrap` 内触发当日 skill-sync（`should_check` 时）；**未**因带描述/意图而跳过入口（P-411）
- [ ] **P-412**：若 `self_update_pending` → 已同轮执行 `self_update_apply_cmd`；成功则已发 **T-SYNC-SELF-UPDATE** 并停本轮；**未**在未 apply 时贴菜单/handoff
- [ ] 按 `mode`：`first_screen`/`handoff` 已**原样贴** `user_visible_text`（若非空）；`self_update_apply` 时未贴菜单；无意图未拆分 daily+菜单两条消息（P-273）
- [ ] token 未就绪时：已发 **T-TOKEN-ASK**（一次一问，含 `{env_label}`）或 **T-TOKEN-MISS-STOP**；路由卡 `status: pending_token`；**未**收业务参数
- [ ] env 已解析 + token 通过后无意图时：首条为 **T-FIRST-SCREEN**（含环境行 + 菜单 + 说明），`package` 为 `null`，路由卡含 `selected_env`；未预读子包；**未**做 router 目录导览
- [ ] **首屏后仅回序号（1～7）**：已按 `intent-menu` 路由并 handoff；**未**再跑 `entry-bootstrap`/`resolveEntryEnv`；handoff 环境与首屏一致（**未**先写成生产再改回 · `public-env.md` §6）
- [ ] 多意图同句：已发 **T-MULTI-INTENT-SPLIT**（**含「原始需求」· 序号与首屏 1～6 对齐** · P-379），**未**混读子包
- [ ] env 已解析 + token 通过后用户选 2（原始需求）：已发 **T-ROUTER-OR-HANDOFF**（含已选 env + **同轮下一步加载 boot**），**同轮**加载子包 `boot.md` + `instructions.md`（**未**以 router 总结结束 · P-356/P-407）
- [ ] env 已解析 + token 通过后用户选 3（需求池）：已发 **T-ROUTER-REQ-HANDOFF**，**同轮**加载子包 `boot.md` + `instructions.md`
- [ ] env 已解析 + token 通过后用户选 4/5（任务/缺陷）：已发 **T-ROUTER-TASK-HANDOFF** / **T-ROUTER-DEFECT-HANDOFF**，**同轮**加载子包 `boot.md` + `instructions.md`
- [ ] env 已解析 + token 通过后用户选 7（组织待办）：已发 **T-ROUTER-OT-HANDOFF**，**同轮**加载子包 `boot.md` + `instructions.md`；环境与首屏一致
- [ ] env 已解析 + token 通过后用户选 8（问题单）：已发 **T-ROUTER-PT-HANDOFF**，**同轮**加载子包 `boot.md` + `instructions.md`；环境与首屏一致
- [ ] 内部路由卡已维护 `operation`（P-220 · **禁止用户可见 JSON**）；handoff 后待选为 `null`；用户选定操作类型后**同轮**写入（见 `router/operation-resolution.md`；章节：OR§2 / req§3 / task§4 / defect§5 · P-376）
- [ ] 路由至 `demo`（`ready`）后：已发 **T-ROUTER-DEMO-HANDOFF**（含当轮 `env_label` + `base_url`）或子包 T-QUICK-START-ACK，并进入收项目路径 / 检查出包（**未**以 router 总结结束）
- [ ] **仅**展开一个 `packages/<子包>/`，未混读其它子包
- [ ] 所选环境 `requirement_api` / `original_requirement_api` / `task_api` / `defect_api` 非 ready 时：选 2/3/4/5 **未**伪造业务 API 成功（如实告知 · Q1）
- [ ] 服务不可达时已发 **T-API-UNREACHABLE**（或 demo **T-META-UNREACHABLE**），**未**伪造成功（P-409）
- [ ] 子包 gate 已通过，且子包交付摘要已输出
