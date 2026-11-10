# problem-ticket · Step Completion Gate

- [ ] 已继承父包 `selected_env`，未再问环境
- [ ] `operation` 为 `metadata` 或 `create` 后再进对应 phase
- [ ] 创建：`title` + `description` + 提单人齐备；已带 `Idempotency-Key`
- [ ] 创建：未指定提单人/二线/处理人时均用 `tokenUser`；未把环境默认二线写入人员字段
- [ ] 创建：`description` 为 Agent 业务总结（非用户素材整卡原文搬迁）
- [ ] 创建：已 `prepare --out prepared.json --human`，确认表原样贴 prepare 输出；`create` 使用同一 prepared 文件（确认描述=落库正文）
- [ ] 创建：`description` 经 CLI 规范化后为 HTML
- [ ] 已用 `problem-ticket-api.mjs` 执行，并用 `verify-problem-ticket-response.cjs` 校验
- [ ] 成功话术含问题单号与详情链接（`shareUrl` 或拼装链接）
- [ ] 失败已人话化，未伪造成功
