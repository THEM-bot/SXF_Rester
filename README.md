# pm-flow

**产品经理的全流程工作台：一个需求 = 一个工作区目录，从收料到验收不掉东西。**

<p>
<img alt="version" src="https://img.shields.io/badge/version-0.20.0-blue">
<img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-green">
<img alt="deps" src="https://img.shields.io/badge/runtime%20deps-0-brightgreen">
<img alt="license" src="https://img.shields.io/badge/license-MIT-black">
</p>

[它解决什么](#它解决什么) · [它是什么](#它到底是个什么东西) · [功能地图](#功能地图) · [快速开始](#快速开始) · [核心设计](#核心设计一个需求--一个工作区目录) · [命令速查](#命令速查) · [六个角色](#六个角色) · [FAQ](#faq)

---

## 它解决什么

不是「AI 帮你写 PRD」，而是**把你脑子里那套流程搬到磁盘上，让 AI 每一步都知道自己在哪、还差什么、下一步该找谁**。

| 你现在的样子 | 装上之后 |
| --- | --- |
| 需求到哪一步了，得自己回忆 | `pmw status` 一句话说清，左侧面板一直挂着 |
| 开发评审完，哪些问题解决了、哪些还挂着，忘了 | 评审台账逐条记账，没闭环的会拦住阶段推进 |
| PRD 改了三版，推研效通推得版本对不上 | 本地是唯一真相，`publish` 一键出 Word + 发布清单 |
| 会议纪要和业务文档的信息，转 PRD 还得重写一遍 | `digest` 把 docx / xlsx / pdf 全转成可检索文本 |
| 分模块拆分很耗时，拆完还得检查跟总 PRD 对不对 | `import --from xlsx` 一次建 40+ 条子需求；`lint` 查一致性 |
| 走错了方向没人拦，走到一半才发现该退回 | `reflect` 逼你回头看，`reroute` 主动提示改路线 |
| 踩过的坑过两个月就忘了 | 经验沉淀进 Obsidian，下次进同一阶段自动带出来 |

---

## 它到底是个什么东西

**一句话**：一个把「产品经理的工作状态」外置到磁盘的插件 —— 阶段、任务、评审台账、待确认项，全都在你那个需求目录里的一个 JSON 文件里。

### 只用过 Codex 的话，这样理解

| Codex 里你熟悉的 | 这里对应的 |
| --- | --- |
| `AGENTS.md` 交代背景 | `SKILL.md` + `agents/roles/` 六个角色说明书 + 业务域档案 |
| 你打字让它改代码 | 你说「这个需求到哪一步了 / 帮我写 PRD / 拆模块」 |
| 它自己读仓库、跑测试、改文件 | 它自己读你的材料、写 PRD、出 Word、推需求池 |
| 上下文窗口塞不下就丢 | 状态在磁盘上，**关掉重开它还记得你在第几步** |
| 一个会话干一件事 | 一条主线九个/十一个阶段，跨几十次会话 |

差别只有一个但很关键：**Codex 的状态在代码里，这个插件的状态在 `req.json` 里**。所以它不会聊到一半忘了你已经推进到开发评审。

### 计划长在磁盘上，不在对话里

```
某需求/                      ← 一个需求 = 一个目录（就地，材料和你放一起）
├── 会议纪要.docx             ← 你原来的材料，原位不动
├── 业务需求文档.docx
├── 原材料/                   ← digest 转出来的 md，AI 读这个
├── prd.md                    ← 它写的 PRD（小需求就一份）
├── req.json                  ← 状态：阶段 / 任务链 / 评审台账 / 卡点 / 谁改的
├── changelog.md              ← 每次改动一行，永不丢
└── 产物/                     ← publish 出的 Word、导出的 Excel
```

`req.json` 里长这样（节选）：

```json
{
  "id": "REQ-20261107-01",
  "kind": "req",
  "stage": "S4_DEV_REVIEW",
  "reviews": [
    { "id": 5, "text": "供应能力页现有字段截图与字段位置", "status": "deferred", "owner": "肖美玲" }
  ],
  "tasks": { "current": [{ "id": "T012", "title": "开评审会，逐条记录问题", "status": "doing" }] },
  "rev": 42, "lastBy": "user", "reflect": { "round": 1, "closedAt": "..." }
}
```

---

## 两个看得见的入口

### ① 左侧「需求进度看板」（可点、可改）

```
在跟的需求 · 3                    [刷新]
─────────────────────────────────────
盘古供供应能力新增受控仓字段   ← 你点这个
REQ-20261107-01 · 开发评审 · 4/9
任务 2/4 · 等 肖美玲×1 · 问题 2
─────────────────────────────────────
        ↓ 右侧
┌───────────────────────────────────────┐
│ 现在该做的        推进到下一阶段 同步 体检 │
│ 继续答开发的问题                        │
│ ⚠ 你上次查看之后有 3 条改动（用户 1 条）  │
│                                        │
│ 流程进度  ① ✓ ② ✓ ③ ✓ ④◀当前 ⑤ …      │
│ 任务链    我 / 业务 / 开发 三条泳道        │
│ 反思      第 1 轮 · 待处理 2 条  [收尾]   │
│ 路线      建议退回 PRD 阶段  [改] [忽略]  │
└───────────────────────────────────────┘
```

**不只是看**：推进阶段、勾任务、答评审、开/收反思、采纳改路线、同步知识库、跑体检，都能在面板上点。**面板上改的东西一律记成「用户」，AI 改的记成 AI** —— 历史里永远分得开。

### ② 模型名左边的 `● Rester`

`● Rester` 挂在模型选择器左边，表示这个 agent 在线。它不可点，就是个标识。

---

## 功能地图

| 能力 | 命令 | 治什么 |
| --- | --- | --- |
| **状态机** | `status` `advance` `goto` `back` | 不知道到哪一步、下一步干嘛 |
| **看板** | `board` | 手上到底在跟几个需求 |
| **巡检** | `brief` | 谁手上压了几天、哪个需求停着不动 |
| **任务链** | `task add/who/done/flow` | 活散在脑子里、忘了找谁确认 |
| **评审台账** | `review add/answer/defer/close` | 评审完不知道漏了什么 |
| **PRD 写作** | `doc` `publish` `digest` | 写完还要手工排版、手工传 |
| **拆模块** | `split` `import --from xlsx` | 40 条子需求要手建 |
| **反思** | `reflect start/add/fix/keep/close` | 一路往前冲，回头才发现方向错了 |
| **改路线** | `reroute` `reroute apply` | 该退回 / 该升级，没人提醒 |
| **谁改的** | `since` `ack` | 用户改了东西，AI 拿旧判断继续走 |
| **一致性体检** | `check` `lint` | 字段叫法漂移、有规则没验收、demo 与 PRD 对不上 |
| **知识库** | `obsidian` 工具 / `note` | 踩过的坑下次还得再踩一遍 |
| **研效通** | `yxt …` | 本地写完了还得手工录平台 |
| **出 Word** | `doc` `publish`（含插图、PDF） | 排版、编号、目录、图片大小 |
| **看真实系统** | `browser` 工具 / `sys` | 得靠猜真实页面长什么样 |

---

## 快速开始

### 前提

- **Node ≥ 20**（`node -v` 看一眼）
- **DeepSeek Harness**（本插件是它的 bundle，不是独立程序）
- Windows 上建议装 **Git for Windows**（`sh` 工具要用 bash；没有也能跑，只是命令得走别的路）
- 可选：**Obsidian + Local REST API 插件**（知识库）、**Chrome**（浏览器工具 / 出 PDF）

### 安装

```powershell
# 1. 装进当前 profile
plugin_manager install_bundle  target = <本目录绝对路径>

# 2. 重启 DeepSeek Assistant（工具清单是启动时加载的）

# 3. 自检
pmw doctor
```

改完代码不用重装（profile 里是 `link:`），**只有改 `package.json` / `cordis.patch.yml` 才需要**
`remove_bundle` + `install_bundle`。

### 第一次用（五分钟走完一圈）

```bash
# 1. 建一个需求工作区（就地建，材料放一起）
cd "D:/我的需求/盘古供受控仓"
pmw init --here --kind req --title "供应能力新增受控仓字段"

# 2. 把材料转成能读的文本（docx / xlsx / pdf 都行，不给参数就扫全目录）
pmw digest

# 3. 每进入一个阶段，先拿写作指引（会自动带出这阶段的历史经验）
pmw guide S3_PRD

# 4. 看完指引，动手，然后推进
pmw advance

# 5. 想知道全局
pmw board
```

---

## 核心设计：一个需求 = 一个工作区目录

### 两条主线，别走错

**小需求**（加一两个字段、小修小补）—— 9 段：

```
① 收料 → ② 业务对齐 → ③ PRD 起草 → ④ 开发评审 → ⑤ 定稿
      → ⑥ 发布（研效通+企微）→ ⑦ 开发中 → ⑧ UAT 验收 → ✅ 完成
```

**大需求**（重构 / 从零建系统）—— 11 段：

```
① 收料 → ② 需求梳理与业务对齐 → ③ 总 PRD → ④ 拆模块 → ⑤ 模块 PRD
      → ⑥ Demo 原型 → ⑦ 发布 → ⑧ 开发评审 → ⑨ 开发中 → ⑩ UAT → ✅ 完成
```

**判错了不用重建**：`pmw kind project` / `pmw kind req` 原地切主线（只清模板任务，你手加的一条不动）。

### 门禁：不给「假装做完了」留口子

`advance` 会检查这个阶段该有的东西在不在：

```
$ pmw advance
✗ 还差 2 样才能进下一阶段：
  · 评审仍有未闭环问题（2 条）
  · 还有 1 个卡点没解除
```

门禁不是让你烦的，是**把「我记得好像都问了」换成「台账上没有未闭环项」**。

### 反思循环：推进之前先回头看

```
$ pmw reflect start --focus 字段口径
第 1 轮反思（S3_PRD · 字段口径）
1. 规则表里每一行，我能不能举出一个具体算例？
   ↳ 举不出算例，说明这行规则还没想清楚，写下来只是填空。
2. 有没有哪一句写的是「与 XX 保持一致」？
   ↳ 这一句等于没写。要么把规则抄过来，要么写明不一致时谁优先。
3. 字数够多的那些段，是我在想事情，还是在凑版面？
   ↳ 一页纸的 PRD 超过 2500 字，通常有一半是在解释自己为什么这么写。
4. 有没有哪句话是「我以为」，而不是材料里写着的？
   ↳ 材料里没有、你又没确认过的，标 [待确认]，别写成结论。
```

**还有未处理项时 `advance` 会被拦**。修了记 `reflect fix`，决定不修记 `reflect keep --reason`。

### 改路线：工具摆证据，你拍板

```
$ pmw reroute
第 1 条  退回 PRD 阶段
  为什么：这个需求已经退回 3 次了（S5_FINAL → S3_PRD ×3）
  证据：history 里 3 条 back 记录，最近一次在 2 天前
第 2 条  小需求其实是大需求
  为什么：已经有 13 个模块、42 条子需求
  证据：project.json 里 modules=13 subs=42
```

`reroute apply <编号>` 才真动手，并且留痕（谁改的、改之前在哪）。**只提议，不自动执行。**

### 谁改的：AI 和用户的操作永远分得开

```
$ pmw since
上次查看之后 3 条改动（用户 1 条）
  11-08 01:23  用户  task:done T013
  11-08 01:20  AI    review:defer #5 → 肖美玲
  11-08 01:18  AI    advance S3_PRD → S4_DEV_REVIEW

$ pmw ack      # 我看到了（水位推进，不再重复提醒）
```

看到「用户」标签的改动，AI 的正确反应是**问「你为什么这么改」，不是改回去**。

---

## 命令速查

```bash
# 开新需求
pmw init --here --kind req --title "标题"      # 就地建（推荐）
pmw init --kind project --id PRJ-01 --title "标题"   # 在父目录下建子目录

# 看
pmw status          # 进度图 + 下一步 + 门禁还差什么
pmw board           # 看板：所有在跟的需求
pmw brief --all     # 巡检：等别人 / 卡点 / 停滞
pmw today           # 今天该干的

# 推
pmw advance         # 进下一阶段（门禁不过会拦）
pmw goto <阶段>     # 跳
pmw back <阶段> --reason "..."   # 退

# 任务
pmw task add "找马兰确认发货规则" --who 马兰
pmw task done T012
pmw taskflow        # 本阶段任务链图

# 评审
pmw review add "变更型号为空怎么判" --who 倪小婷
pmw review answer 7 "按变更时间为空则整行忽略"
pmw review defer 5 --to 肖美玲

# PRD
pmw digest                      # docx/xlsx/pdf → 原材料/*.md
pmw doc  prd.md --out prd.docx  # 出 Word（插图自动编号）
pmw doc  prd.md --pdf           # 出 PDF
pmw publish                     # 出总 PRD + 各子需求 Word + 发布清单

# 拆模块
pmw split                            # 从总 PRD 的模块表自动建
pmw import --from xlsx 清单.xlsx --dry   # 先预演，再真跑

# 反思 / 改路线 / 谁改的
pmw reflect start --focus 字段口径
pmw reflect add "问题" --sev hard
pmw reflect fix 1  |  pmw reflect keep 2 --reason "本期不做"
pmw reflect close
pmw reroute  |  pmw reroute apply 1  |  pmw reroute dismiss 2
pmw since    |  pmw ack

# 体检
pmw check   # 门禁 + 图片 + 一致性，一把梭
pmw lint    # 只查一致性（字段叫法 / 验收覆盖 / demo 覆盖）

# 知识库
pmw note status | note sync | note search 受控仓 | note init

# 研效通
pmw yxt doctor               # 包找到没、token 还有效吗
pmw yxt task push --dry      # 看要推什么，再真推
pmw yxt demo push            # demo 打包上传，回链接
pmw yxt defect new --title "..."
pmw yxt status               # 对账：本地 vs 平台

# 公司系统
pmw sys list | sys show oms | sys open pangugong
```

---

## 六个角色

小事不用派。派角色是为了**换一个专业视角**，不是为了并行。

| 角色 | 技能 | 叠了哪几门手艺 |
| --- | --- | --- |
| **Rester** 调度 | `pm-rester` | 产品负责人 + 交付经理 + 主编 |
| **Recorder** 收料 | `pm-recorder` | 需求分析师 + 会议记录 + 系统分析师 |
| **Writer** 写 PRD | `pm-writer` | B 端产品 + 系统分析师 + 财务审计的强迫症 |
| **Maker** 做 Demo | `pm-maker` | B 端前端 + 产品设计 + 一点后端（刷新/权限/超时/批量） |
| **Shouter** 应询 | `pm-shouter` | 产品 + 售前 + 会吵架的人 |
| **Tester** 挑错 | `pm-tester` | 系统测试 + 需求评审 + 财务复核 |

另有一个不派活、只补背景的技能：**`pm-domain`** —— 深信服 ToB 供应链与财经的业务域档案（系统全景、订单生命周期、型号与配置、库存六个口径、结账节奏、术语词典、七类常见需求的标准结构）。

每份角色说明书都分三段加载：**共同底座 → 业务域档案 → 角色本身**。

---

## 它有哪些工具

| 工具 | 干什么 |
| --- | --- |
| `pm_flow` | 全部 `pmw` 命令的统一入口（34 个子命令） |
| `pm_role` | 派角色：给上下文、写提示词 |
| `sh` | 跑 shell（bash，不是 PowerShell） |
| `browser` | 起 Chrome 自己看页面、截图、填表 |
| `obsidian` | 知识库：status/recall/remember/sync/read/tree |

---

## 和外部的对接

### 研效通（需求池 / 任务 / 缺陷 / demo）

**能自动的**：建需求、改需求、建任务（**唯一能自动挂到需求下的接口**）、建缺陷、demo 上传、查元数据。

**做不到、必须提醒用户去 Web 手工补的两件事**：

1. **设上级需求** —— 开放 API 的 R01 没有 parent 字段
2. **传 Word 附件** —— 需求包没有附件上传能力

另外，**推任务前需求必须已挂开发迭代**，否则平台会拒：`需求尚未关联开发迭代，请先为需求设置开发迭代`。

### Obsidian（知识库）

vault 里的 `需求知识库/` 由插件维护：需求索引、材料镜像、经验笔记、两个 Dataview 索引页（工作台 / 需求总览）。

检索是**关键词型**（Local REST API 的 `/search/simple/`，BM25），不是向量型 —— 好处是零配置、结果可解释；短板是**同义词**（「备货 / 挑库 / 锁库」互相搜不到）。

`pmw guide` 进阶段时会自动检索本阶段相关经验带出来；`--no-kb` 可以关掉。

---

## 目录结构

```
pm-flow/
├── SKILL.md                  ← 主技能：流程、铁律、命令速查
├── package.json              ← bundle 声明
├── cordis.patch.yml          ← 装进 profile 的那一行
├── lib/
│   ├── index.js              ← 插件入口：5 个工具 + 3 个技能组 + 3 条路由
│   ├── client.js             ← 客户端半：侧栏看板 + Rester 标记
│   ├── roles.js              ← 角色/业务域档案加载与派活
│   ├── graph.js              ← archify 渲染（流程图 / 泳道图）
│   ├── sh/                   ← bash 执行器（诊断、截断、后台任务）
│   ├── browser/              ← Chrome 控制
│   ├── obsidian/             ← 知识库客户端 / 同步 / 工具
│   └── yxt/                  ← 研效通编排（找包 / 调 CLI / 六个子包）
├── tools/
│   ├── pmw.mjs               ← 唯一的 CLI 入口（40+ 命令）
│   ├── lib/                  ← state / guides / docx / wdocx / xlsx / pdf / lint / images / reflect-prompts
│   └── *.mjs                 ← 自测（plugin / client / kb / lint）
├── agents/roles/             ← 共同底座 + 业务域档案 + 六个角色 + 角色总图
└── vendor/archify/           ← 内置的图渲染器（MIT）
```

---

## FAQ

**Q：它和「AI 帮我写 PRD」有什么区别？**
写 PRD 只是其中一段。它管的是**从收料到验收的整个过程**：状态、任务、评审台账、门禁、反思、路线。PRD 只是这个流程的一个产物。

**Q：必须用研效通 / Obsidian 吗？**
都不必须。研效通不配就只当本地工作台（`yxt` 命令会告诉你没找到包）；Obsidian 不配就没有知识库（`guide` 会静默跳过检索）。

**Q：我的材料会被传到哪里去？**
全部在本地。研效通只在你主动 `pmw yxt …` 时才请求；知识库只写你自己的 vault。

**Q：它会不会自作主张改我的东西？**
写操作默认都会先打印要做什么；改路线**只提议不执行**；面板上的写操作走白名单。所有改动都进 `changelog.md` + `history`，带 `用户`/`AI` 标记。

**Q：小需求也要走九段吗？**
要走，但每段很轻。而且判错了随时 `pmw kind` 切。

---

## 已知限制

| 限制 | 说明 |
| --- | --- |
| 单人使用设计 | 没有多人协同、没有冲突合并（一个工作区一份状态） |
| 知识库是同义词盲 | 关键词检索，搜「挑库」搜不到「备货」 |
| 研效通两条 Web 限制 | 上级需求、Word 附件必须手工补 |
| PDF 读回有损 | 无边框表格会被并成一行；扫描件读不出来 |
| demo 需要人给 HTML | 它能打包上传、能自己看页面，但不能从零设计出好看的原型 |
| 不替你拍板 | 反思问句、路线提议都只是证据，结论得你和业务定 |

---

## ⚠️ 开源前必须处理

这个包是按「一个人在自己公司用」写的，直接公开会出事：

- [ ] `~/.pm-flow/systems.json` —— 九个内部系统的地址与**账号密码**（不在仓库里，但别提交）
- [ ] `agents/roles/00-业务域档案.md` —— 公司内部系统名、组织、真实案例（`H42HR-212U4001B` 这类真实料号）
- [ ] 需求工作区示例 —— 客户名、报价、金额
- [ ] `_tmp/` —— 开发期临时物（asar 提取物、截图、调试脚本）
- [ ] 研效通内部 ID / token —— `~/.yanxiaotong/`
- [ ] Obsidian vault 路径与 API Key

---

## License

MIT。内置的图渲染器 `vendor/archify/` 自带 `LICENSE` / `NOTICE` / `THIRD_PARTY_NOTICES.md`，一并遵守。
