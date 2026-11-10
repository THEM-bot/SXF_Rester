# skill-sync · Step Completion Gate

| 阶段 | 完成条件 |
|------|----------|
| mode | 已判定 install / update；或已发 T-SYNC-MODE-ASK 并获用户选择 |
| parse-ref | install 前已解析 skillId；失败则 T-SYNC-INSTALL-REF-INVALID |
| check-all | 更新模式：已展示列表；或空列表已引导安装 |
| install | 用户已确认（含覆盖确认）；已执行 CLI 且 exit 0 / 成功 JSON；已发 OK/FAIL |
| update | 用户已确认 skillId 列表；已执行 CLI 且 exit 0 / 成功 JSON；已汇报结果 |
| self_update_pending | 已执行 `self_update_apply_cmd`（或 `apply-self-pending`）且成功 JSON |
| selfUpdate | 已发 T-SYNC-SELF-UPDATE；本轮已停止业务 |

未完成确认前 **禁止** install（覆盖）与 update。  
**伪造成功红线（P-386）**：**未**调 `sync.mjs` 或 CLI 失败时**禁止**发安装/更新成功话术；错误人话见 `error-humanize.md`。
