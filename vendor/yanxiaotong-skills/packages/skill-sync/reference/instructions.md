# skill-sync · 执行说明

> **双模式**：**安装**（install）· **更新**（update / check-all）  
> **安装输入**：社区 plaza 链接、`skillId`、Open API skill-zip 路径（均解析为 skillId）

## 执行优先级

1. 父包 §0a 环境 + §0b Token（已完成方可进入）
2. **进度**：每步 **当前正在…**（`ui/progress-display.md`）
3. 解析 `skillsRoot`（detect 或用户指定 `--skills-root`）
4. **判定模式**（`operation`：`install` | `update` | `null`）
5. **`install`**：解析 skill 引用 → 预检 → 安装（**可跳过 check-all**）
6. **`update`**：`check-all` → 列表 → 用户确认 → `update`
7. **`null`**（仅选菜单 6、无进一步说明）→ **T-SYNC-MODE-ASK**
8. 若 `self_update_pending: true` → **同轮**先执行 `self_update_apply_cmd`（P-412）；成功且 `selfUpdate`/`self_update` → **T-SYNC-SELF-UPDATE** 并**停本轮业务**；未 apply **禁止**声称主包已更新

## 模式判定（SSOT）

> **命名（P-402）**：本包 `operation: update` 表示**更新技能包**（文档可写作 `skill_sync.update`），与需求池/OR/task/defect 的业务字段 `update` **不同包不同义**。

| 用户表述 / 上下文 | 模式 | Agent 动作 |
|-------------------|------|------------|
| 含 **plaza / open skill-zip** / `skill=109` / 「安装技能」/ 「再用它安装」 | `install` | 解析 skillId（目标段优先）→ **T-SYNC-INSTALL-PROGRESS** → `install` |
| 「更新」「同步」「比对版本」或仅选菜单 **6** 且选 **2. 更新** | `update` | `check-all` → **T-SYNC-LIST** |
| 仅选菜单 **6**、无 URL、无安装/更新词 | `null` | **T-SYNC-MODE-ASK** |
| `check-all` 空列表且用户未事先指定安装 | 引导 install | **T-SYNC-NO-MANIFEST-INSTALL-ASK** |

### skill 引用解析（install 前必做）

从用户文本或 `--skill-ref` 提取 `skillId`（纯数字）：

| 输入形态 | 示例 | 解析 |
|----------|------|------|
| 社区 plaza 页 | `https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109` | `109` |
| 查询参数 | `?skill=109` | `109` |
| 纯数字 | `109` | `109` |
| Open API zip | `…/api/open/skills/imported/109/skill-zip` | `109` |
| plaza zip | `…/api/skills/plaza/imported/109/skill-zip` | `109`（仅解析 id；**下载仍走 Open API**） |

```bash
node "$PACK_ROOT/tools/sync.mjs" parse-skill-ref --text "https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109"
# → { "skillId": "109", "source": "plaza_url" }
```

解析失败 → **T-SYNC-INSTALL-REF-INVALID**。  
广场复制含自举+目标时：`parse-skill-ref` / `parseInstallSkillIds` **只取「再用它安装 / 用它依次安装」后的 id**；多目标则**同轮逐个** `install`。

## 步骤

### 1 解析 skillsRoot

优先项目下 `.cursor/skills`；不确定时运行 skill-install `-Detect` 或询问用户。

### 2 模式选择（operation 为 null 时）

发 **T-SYNC-MODE-ASK**：

- **1 安装** → 无 skill 引用则 **T-SYNC-INSTALL-ASK**；有则直接 install
- **2 更新** → `check-all`

### 3 install（安装模式）

```bash
node "$PACK_ROOT/tools/sync.mjs" install --skill-id 109 --skills-root "..."
# 或
node "$PACK_ROOT/tools/sync.mjs" install --skill-ref "https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109" --skills-root "..."
```

| 阶段 | 行为 |
|------|------|
| 解析 | `parse-skill-ref` → skillId |
| 预检 | `GET` OS01 sync-meta（`draft` / `published` 均可；安全检测未通过由 skill-zip 拒绝） |
| 下载 | `GET` OS02 skill-zip → staging 解压 |
| 校验 | staging manifest `packageMd5` 须与 sync-meta 一致 |
| 落盘 | 目录名 = `{SKILL.md name}-{skillId}`；**update 与 install 均**经 `resolveInstallTarget`；包名变更时迁到新目录并清理同 skillId 旧目录 |
| 登记 | `registry upsert`；**T-SYNC-INSTALL-OK** → 提示 `@技能名`（`@` 仍用 SKILL.md 的 `name:`，非文件夹名） |

| 参数 | 说明 |
|------|------|
| `--skill-id` | 与 `--skill-ref` 二选一 |
| `--skill-ref` | plaza 链接 / 纯数字 / zip 路径 |
| `--skills-root` | 可选 |
| `--dry-run` | 只预览 |

同 `skillId` 重装 → **粘滞已有目录**（P-413）：引导 zip 常装到纯名 `yanxiaotong-skills`，更新/自更新**不得**再开 `yanxiaotong-skills-{id}`；另一命名进 legacy 并删除。无已装目录时新装才用 `{name}-{skillId}`。

**典型一键场景**（须满足路由「禁止跳过」表）：

```text
@yanxiaotong-skills 安装技能 https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109
```

→ 路由 `skill-sync`、`operation: install` → 解析 `109` → 同轮 install（目录冲突则先确认）。

### 4 check-all（更新模式）

**比对真源（SSOT）**：磁盘 `skill-package.manifest.json` 的 `packageMd5` ↔ 远端 sync-meta。**禁止**用 `.yanxiaotong-installed.json` 判定是否已更新。

- `check-all` 会先按磁盘 manifest **纠偏登记**（`reconcileRegistryFromScan`），避免登记漂移误导
- install / update **仅落盘校验通过后**才写登记（`assertDiskPackageMd5`）

```bash
node "$PACK_ROOT/tools/sync.mjs" check-all --skills-root "<绝对或相对路径>" --human
```

- **`--human`**：输出完整 Markdown 表；**跳过项也在表内**，`本轮` 列标 `跳过`。
- JSON 含 `listAction`（`更新`|`跳过`）、`listStatus`、`listDetail`。

**禁止**只在表外文字描述跳过项；**禁止**省略 `本轮=跳过` 的行。

`summary.total === 0` → **T-SYNC-NO-MANIFEST-INSTALL-ASK**。

| 本轮 | listStatus | 含义 |
|------|------------|------|
| `更新` | `可更新` | 可勾选 update（含远端仍为 draft） |
| `跳过` | `已最新` | 磁盘 MD5 与远端一致 |
| `跳过` | `检测中` | 安全检测未完成 |
| `跳过` | `接口异常` | sync-meta 失败 |
| `跳过` | `manifest 无效` | manifest 损坏或缺字段 |
| `跳过` | `重复 skillId` | 多处 manifest 同 id |

### 5 用户确认（更新）

`check-all --human` 尾部已含序号确认（**T-SYNC-LIST**）：

| 菜单项 | 用户回复 | Agent 动作 |
| --- | --- | --- |
| 更新全部 | 对应序号 | 从 JSON 取全部 `canUpdate===true` 的 `skillId`，**同轮** `update --skill-ids …` |
| 选择部分更新（仅 updatable>1） | 对应序号 | 发 **T-SYNC-UPDATE-PARTIAL-ASK** → 用户回复表内 # → 映射 skillId → `update` |
| 重新比对 | 对应序号 | **同轮**重跑 `check-all --human` |
| 取消 | 对应序号 | 结束 |

列表含「检测中」→ 可附加 **T-SYNC-SECURITY-PENDING**；确认菜单已含「重新比对」，**禁止**仅正文提示而无序号项。

### 6 update

```bash
node "$PACK_ROOT/tools/sync.mjs" update --skill-ids 107,108 --skills-root "..."
```

**主包自更新（P-412）**：

- `update` / `daily-auto`：**非主包**先 `atomicReplace`；**主包**只 prepare pending（`self_update_pending` + `self_update_apply_cmd`），**禁止**持锁进程对主包根目录 rename。
- Agent：见 pending → **同轮**跑 apply 命令 → 成功发 **T-SYNC-SELF-UPDATE** 并停业务。
- 落盘方式（P-414）：TEMP apply **就地覆盖**安装目录内文件，**禁止**对 `yanxiaotong-skills` 根目录 `rename`（避免 Cursor 占用导致 EBUSY）。
- 调试落盘：`node "$PACK_ROOT/tools/sync.mjs" apply-self-pending --skills-root "..."`（推荐用 JSON 内 TEMP `apply_cmd`）。

## 禁止

- 对 `security_pending` / 非可更新项强行 update（`update` CLI 会拒绝）
- 向用户索要 skillId 逗号列表或自由文本确认（须序号菜单 + 部分更新时表内 #）
- skill-sync 内用 plaza 免登录 API **下载**（解析 plaza URL 可以；下载只走 Open API）
- 有 plaza 链接 / 安装意图时仍先跑 check-all 阻塞安装
- **未**调用 `sync.mjs` install/update 取得成功 JSON（exit 0）时**禁止**声称安装/更新成功（P-386）；失败读 `error-humanize.md`
- 写盘失败后**自动重试** install/update
- 持锁进程内对 `yanxiaotong-skills` 根目录 `atomicReplace`/`rename`（须两阶段 pending + TEMP **就地覆盖** · P-412/P-414）
- TEMP apply 对安装根做 `rename`（须 `atomicReplaceInPlace` · P-414）
- `self_update_pending` 未 apply 成功即贴菜单/handoff 或声称主包已更新
