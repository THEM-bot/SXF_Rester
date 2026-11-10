# skill-sync · 话术模板

## T-SYNC-MODE-ASK（进入 skill-sync 未明确安装/更新 · 必用）

> **何时**：用户仅选菜单 **6**，且首句无 plaza 链接、无「安装/更新」关键词。

```text
已进入技能包安装与更新（skill-sync）。

请选择本轮要做的事：

1. 安装技能 — 从研效通社区安装到本地（支持粘贴社区链接）
2. 更新已安装技能 — 扫描本地 manifest、比对版本后更新

请回复序号（如 `1`）。
```

> **Agent**：选 **1** 且无链接 → **T-SYNC-INSTALL-ASK**；选 **2** → `check-all`。

---

## T-SYNC-INSTALL-ASK（安装模式 · 尚无 skill 引用）

```text
**请提供要安装的技能**

可任选一种：

- 社区技能页链接（推荐）  
  示例：`https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109`
- 技能 ID（纯数字）  
  示例：`109`

也可回复「取消」。
```

---

## T-SYNC-INSTALL-PROGRESS（已解析 skillId · 安装执行前）

```text
正在安装社区技能（skillId：{skillId}）…

当前环境：{env_label}。
安装目录：`{skillsRoot}`
```

> **Agent**：同轮执行 `install`；同 `{name}-{skillId}` 路径已存在则直接覆盖（可发 **T-SYNC-INSTALL-OVERWRITE** 提示）。

---

## T-SYNC-INSTALL-REF-INVALID（链接/ID 无法解析）

```text
无法从输入中识别技能 ID。

请提供以下任一格式：

- `https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109`
- 纯数字 skillId，如 `109`

也可回复「取消」。
```

---

## T-SYNC-LIST（check-all 后展示 · 更新模式）

> **铁律**：`items` **每一条**须进下表一行（**含所有跳过项**：已最新、本地改动、接口异常、manifest 无效等）；**禁止**表外再用 bullet 复述跳过原因。

**推荐**：直接贴 `check-all --human` 输出。

```text
已扫描技能目录 `{skillsRoot}`，同步比对结果如下（**含跳过项**）：

| # | 技能 | skillId | 本轮 | 状态 | 说明 |
|---|------|---------|------|------|------|
{rows — items 全部一行不少；本轮=「更新」或「跳过」}

合计 {total} 项：本轮可更新 {updatable} · 跳过 {skipped}（已最新 … · 检测中 … · 接口异常 …）

{若 updatable>0：}

请确认本轮操作：

1. 更新全部可更新项（共 {updatable} 项）
{若 updatable>1：2. 选择部分更新}
{N}. 重新比对
{M}. 取消

请回复序号（如 `1`）。

{若 updatable=0：}

请确认本轮操作：

1. 重新比对
2. 取消

请回复序号（如 `1`）。
```

**本轮**：`更新`（仅此可勾选；含远端 draft）| `跳过`（已最新 / 本地改动 / **检测中** / 接口异常 / manifest 无效 / 重复 skillId）

> **Agent 序号解析**（以 `--human` 尾部为准，**禁止**自由发挥）：
>
> | 用户回复 | 动作 |
> | --- | --- |
> | 菜单「更新全部」序号 | 从 JSON `items` 取全部 `canUpdate===true` 的 `skillId`，同轮 `update --skill-ids …` |
> | 菜单「选择部分更新」序号 | 发 **T-SYNC-UPDATE-PARTIAL-ASK** |
> | 菜单「重新比对」序号 | 同轮重跑 `check-all --human` |
> | 菜单「取消」序号 | 结束 |
>
> **禁止**向用户索要 skillId 逗号列表。

---

## T-SYNC-UPDATE-PARTIAL-ASK（部分选择更新 · updatable>1）

```text
请从下列可更新项中选择（回复表内 # 序号，可多选，如 `2` 或 `1 3`）：

| # | 技能 | skillId |
|---|------|---------|
{rows — 仅 listAction=更新 的行，# 与 T-SYNC-LIST 主表一致}

请回复表内序号；也可回复「取消」。
```

> **Agent**：用户回复表内 # → 映射为对应 `skillId`，同轮 `update --skill-ids …`；「取消」→ 结束。

---

## T-SYNC-UPDATE-CONFIRM-ALL（check-all 后 · 与 `--human` 尾部一致）

> **禁止**单独使用本模板；须与 **T-SYNC-LIST** 或 `check-all --human` 完整输出一致（含重新比对 / 部分更新 / 取消）。

---

## T-SYNC-SECURITY-PENDING（列表含「检测中」项 · 可选附加说明）

```text
部分技能社区侧安全检测尚未完成，本轮将跳过这些项。

检测完成后可在确认菜单中选择「重新比对」。
```

> **Agent**：若用户询问「已通过」等，**禁止**要求自由描述；引导用户在确认菜单选「重新比对」或发 **T-SYNC-RETRY-ASK**。

---

## T-SYNC-RETRY-ASK（用户想重试比对 · 与菜单「重新比对」等价）

```text
是否重新扫描并比对？

1. 重新比对
2. 取消

请回复序号（如 `1`）。
```

> **Agent**：选 **1** → 重跑 `check-all --human`；选 **2** → 结束。

---

## T-SYNC-UPDATE-FAIL（update 失败）

```text
技能包更新失败：{reason}

本地已安装版本未改动。

请选择：

1. 重新比对后重试
2. 取消

请回复序号（如 `1`）。
```

> **Agent**：选 **1** → `check-all --human` → 若仍有可更新项按 **T-SYNC-LIST** 序号规则继续。

---

## T-SYNC-NO-MANIFEST-INSTALL-ASK（更新模式 check-all 空列表）

> **何时**：用户选了**更新**，但 `summary.total === 0`。

```text
本地暂无可更新的技能包（未发现 `skill-package.manifest.json`）。

您可以：

1. 改为安装技能（粘贴社区链接或 skillId）
2. 取消

请回复序号（如 `1`）。
```

> **Agent**：选 **1** → **T-SYNC-INSTALL-ASK**。

---

## T-SYNC-INSTALL-OVERWRITE（同 skillId 重装 · 可选提示）

```text
技能「{displayName}」将安装到 `{installFolder}`（路径已存在，将覆盖为最新版本）。
```

---

## T-SYNC-INSTALL-OK

```text
技能包安装完成。

- 技能名：{displayName}
- 安装目录：{installFolder}（`{skillsRoot}/{installFolder}`）
- skillId：{skillId}
- 版本：{currentVersion}

请在对话中使用：**@{displayName}**

后续可选「更新已安装技能」进行版本同步。
```

---

## T-SYNC-INSTALL-FAIL

```text
技能包安装失败：{reason}

本地目录未改动。请检查链接、skillId、令牌权限或网络后重试。
```

---

## T-SYNC-UPDATE-OK

```text
技能包更新完成：{successCount} 项成功。
{failureSection}
```

---

## T-SYNC-SELF-UPDATE（更新了 yanxiaotong-skills 自身 · **成功话术** · P-412）

> **何时**：`self_update_apply_cmd` 已执行且成功（或 JSON `self_update`/`selfUpdate: true`）。**非**失败；**禁止**当报错展示。  
> **之后**：本轮**停止**菜单与业务 handoff；请用户重新 `@`。

```text
已更新研效通主技能包。请重新 **@yanxiaotong-skills** 后再使用菜单功能，以确保加载最新指令。
```

---

## T-SYNC-SELF-PENDING（主包待落盘 · 内部驱动 · 可选对用户省略）

> **何时**：JSON `self_update_pending: true`。Agent **先**跑 `self_update_apply_cmd`，**不必**向用户朗读本模板；若需说明可一句「正在落盘主技能包…」。

---

## T-SYNC-NO-MANIFEST（已废止）

> **禁止**再对用户展示。
