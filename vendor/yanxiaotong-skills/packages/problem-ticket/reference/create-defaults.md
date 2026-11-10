# 问题单创建 · 默认与收参（Agent SSOT）

## 用户口语 → API 映射

| 用户说 | 写入字段 |
|--------|----------|
| 标题 | `title`（必填；剥 HTML） |
| 描述 / 问题描述 | `description`（必填；**Agent 业务总结**，见下节；提交前须为 HTML） |
| 提单人 | `submitterName` 或 `submitterEmployeeId`（必填；未指定 → **metadata.tokenUser**） |
| 问题类型 | `problemType` / `problemTypeId`；未传默认 `线上缺陷` |
| 二线跟进人 | `secondLineFollower`；未指定 → **同令牌用户**（`tokenUser`）；**禁止**再填环境默认二线工号 |
| 处理人 | `handler`；未指定 → **同令牌用户**（与 `handlerStrategy=submitter` 一致） |
| 特性组 / 领域 / 应用 | `featureTeam` / `businessDomain` / `appOrService` 或对应 Id；未传走 defaults |

> **人员默认 SSOT**：提单人 / 二线 / 处理人未指定时一律 `tokenUser`。  
> **归属默认 SSOT**：问题类型 / 特性组 / 业务领域 / 应用服务未传时，CLI `prepare`/`create` 从 metadata `defaults` 回填名称（确认表不应再是 —）。  
> 环境默认二线工号**禁止**写入人员字段。

## 问题描述 = 对用户输入的业务概况（不是原文，也不是「全文约 N 行」）

`description` = Agent 用自己的话概括**用户要解决什么问题**（做完什么、关键约束、价值），约 **80～400 字**。  
写入 draft → `prepare --human`（确认表原样贴）→ `create` 同一 prepared；**详情页与确认表必须同文**。

### 概况写什么

1. 用户能完成什么（闭环）
2. 关键约束（权限范围、预览确认、不回退等）
3. 一句话价值

### 禁止（CLI 会拒）

- 故事卡/长文原文；「标题须是」「切片声明+切片自检+用户故事」堆砌
- **伪概况**：`（全文约 146 行，含切片声明…）`、只交代文档形态不交代业务
- 确认表一套、draft 另一套；手写确认表却把二线填成环境默认二线

### 正确 / 错误例

```text
# 正确
Demo 权限选人支持批量粘贴加人并在确认前预览；搜索仅显示当前账号可见人员，降低误授与越权风险；兼容已有单选能力。

# 错误
增量卡：批量粘贴加人与搜索可见范围收紧…（全文约 146 行，含切片声明、闭环、用户故事等）
```

### 二线跟进人

未指定或误填环境默认二线（含其姓名/工号/**userId**）→ CLI 一律改为 **tokenUser**。  
确认表二线必须来自 `prepare --human`，**禁止**手填 metadata「默认二线工号」。

## 描述 HTML（P01 强制 · 详情页富文本）

详情页按 HTML 渲染；纯文本 `\n` **会被收成一段**。写入 draft 可用纯文本总结；`prepare`/`create` 会转 HTML。

| 情形 | 处理 |
|------|------|
| 已含块级标签（`<p>` / `<ul>` / `<ol>` / `<br>` 等） | **原样**（勿再包一层） |
| 纯文本总结 | CLI 转换；Agent 也可用 HTML 直接写好总结 |

纯文本转换规则（最小集）：空行 → `<p>`；`-`/`*` 列表 → `<ul><li>`；小节标题行 → `<p><strong>`。

## 确认表 = 落库正文（硬一致）

1. Agent 先把**最终总结**写入 `draft.json` 的 `description`（这就是将要落库的内容）。
2. **必须** `prepare --json draft.json --out prepared.json --human`，确认表**原样贴** stdout（描述列来自同一 prepared body）。
3. 用户选确认后 **仅** `create --json prepared.json`；**禁止**确认后再改描述、另存 body、或手写另一套概况。
4. 若用户要改描述 → 改 draft → **重新 prepare** → 再确认。

## 创建前元数据

1. 调 `metadata`，缓存 `version` 与 `defaults`
2. 确认表展示将使用的类型与归属名称（从 metadata 列表反查）
3. **禁止**手猜雪花 ID

## Idempotency-Key

- 用户未给 → CLI 生成 UUID（8～128 合法字符）
- 同一 Key + 相同规范化内容 → 重放首次结果
- 换内容须换新 Key
