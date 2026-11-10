# Demo 上传 · 错误人话（P-375）

> **机检真源**：`scripts/lib/error-humanize-rules.cjs`（与本表同步）  
> **范围**：D03/D04 上传失败；与 requirement / OR 人话分离。

| 触发（message / 场景） | 用户提示 | 推荐模板 |
| --- | --- | --- |
| 尚未配置部署根 / 无部署根 / 部署根目录 | 所选业务领域尚未配置部署根目录，无法创建 Demo。请换已配置部署根的领域后重试。 | T-DEMO-NO-DEPLOY-ROOT |
| 不匹配 / 应用/服务不匹配 | 业务领域与所选应用/服务不匹配，请从 M03 列表重新点选（禁止手填 appServiceId）。 | T-DEMO-DOMAIN-SERVICE-MISMATCH |
| Demo 不存在 / not found | 未找到该 Demo，请核对 demoId、demoCode 或访问链接中的 ?d= 参数。 | T-DELIVER-FAIL |
| token / 令牌 / 401 / 403 | 开放 API 令牌无效或缺失，请更换令牌后重试。 | T-TOKEN-FAIL-ASK |
| 其它失败 | 上传失败：{精简 message}，请检查参数后重试。 | T-DELIVER-FAIL |

Agent：**禁止**回显完整堆栈与 token；**禁止**伪造成功。
