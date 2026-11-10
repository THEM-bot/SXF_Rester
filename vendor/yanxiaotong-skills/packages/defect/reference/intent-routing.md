# 缺陷 · NL 直达路由（Agent SSOT · v0.3）

> **原则**：能解析就不问菜单；菜单是兜底。  
> **机侧**：`tools/parse-intent.mjs` · `tools/defect-api.mjs prepare`  
> **v0.3**：创建时 NL 自由文本识别 `title`/`description`，**取消**关键词强制（见 `create-defaults.md` §2）。

## 流程

```text
用户句 → parse-intent [--prepare]
  → missing 空 → T-*-CONFIRM → execute
  → missing 非空 → 只问缺失项 → 再 confirm → execute
  → confidence low / 用户说「逐步」→ 完整轨 phase
```

## 六操作触发词

| operation | 触发示例 |
|-----------|----------|
| create | 创建缺陷、提 BUG、需求 URL + 缺陷 |
| detail | 查 TD-xxx、刚才创建的缺陷 |
| list | 查需求 xxx 下的缺陷、列出处理中的缺陷 |
| update | 改 TD-xxx 严重性/标题/描述/修复人/缺陷类型/回归人 |
| status | TD-xxx 状态改为 处理中 |
| close | 关闭/解决关闭/非问题关闭 TD-xxx |

## 需求引用优先级

URL → REQ 编号 → `在需求{id}下` → 会话沿用 → R03 关键词点选

## 创建 · NL 字段识别（v0.3）

剥离 URL/REQ/创建动词/`severity`/显式 `缺陷类型` 后得 `nl_remainder`：

- **无关键词**时：`autoDefectTitle(nl_remainder)` → `title`；余段 → `description`
- **显式关键词**（`标题`/`描述` 等）仍向后兼容覆盖
- 仅无 `nl_remainder` 且无关键词 → `missing: [title]`
- **缺陷类型**：显式口令优先，否则按正文自动判定（`create-defaults.md` §4）

细则 → `create-defaults.md` §2 · §4

## 确认硬停

create · update · status · close 均须用户选 **1 确认** 后方可 `execute`。

## 纪律

- 禁止在 NL 已解析字段后再发点选菜单
- **发现阶段**不可通过 D04 修改（创建时自动取需求状态）→ **T-BLACKLIST-FIELD**
- 多条 R03/M05 命中 → `--pick` 编号
- Agent 禁止手填 snowflake id
