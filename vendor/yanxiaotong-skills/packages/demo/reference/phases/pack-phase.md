# yanxiaotong-demo · 出包阶段（Pack Phase）

> **何时读**：主路径前半段——形态判定、检查、修复确认、构建、打 zip（**进入 §8 上传前**）。  
> **SSOT 优先级**：仍以 `instructions.md` 顶部「执行优先级」为准。

## 速查：按用户意图选路径

| 用户意图 | 执行 | 说明 |
|----------|------|------|
| **标准（默认）** | §1.0 → §1～§6 + zip 后回 `instructions` 进上传 | zip 后 **必须先问** 是否上传 |
| **快捷启动** | §1.0 → §1～§6 + **T-QUICK-START-ACK** | 首句含 **路径+上传+环境+D03/D04**；可跳过 T-ZIP-DONE；仍 **一次一问** 收缺失项 |
| **只要出包** | §1.0 → §1～§6 + 步骤 3/3b | 用户开篇明确；**不得**进入上传阶段 |
| **纯静态 HTML** | §1.0 第三行 → 跳过 build → 3b | 见 `notes` 纯静态 HTML 快径 |

## 1.0 项目形态分流（**必须先判定**）

| 形态 | 判定 | build | checklist | 打 zip |
|------|------|-------|-----------|--------|
| **Vite + MSW** | 有 MSW + 客户端路由 | **必须** | §1.2 全项 | `pack-mock-zip.mjs` |
| **Vite 无 MSW** | 有 `package.json` + `build`，无 MSW | **必须** | §1.2（MSW 标 N/A；`notes` 无 MSW 快径） | `pack-mock-zip.mjs` |
| **纯静态 HTML** | 无 `package.json`/npm；有 `index.html` | **跳过** | §1.2.1 短表 | `pack-mock-zip.mjs` → 静态目录 |

## 1. 与 PACK.md 的对应关系

| 步骤 | 动作 | 深读 `notes.md` |
|------|------|-----------------|
| 1 | 向用户**询问并固定**要 mock 出包的**项目路径**（含 `package.json` **或** `index.html`；**`@文件夹`** 须 Read/Glob 确认后固定，见 `boot.md`） | 0、§1.0、适用范围表 |
| 2 | 在**该目录**做**全项**检查；**有阻塞** → T-FIX-ASK 硬停；**无阻塞** → **跳过 T-CHECK-DONE**，直接构建（§3、执行优先级 §12） | 0～4、7 尾 |
| 3 | **仅**当步骤 2 已通过，用目标 `package.json` 中的出包脚本（如 `build:mock`）与检测到的包管理器构建，**不向用户询问脚本名** | 5 |
| 3b | **构建成功后**打 `.zip`（**默认**工作区根，见 `zip-output.md`）；**标准路径**完成后 **必须**进入上传阶段（**只要出包**见速查表，**不得**上传） | 5、**8** |
| 5 | （**可选**）本地/线网 dist 验收；主路径以 **`accessUrl`** 为验收入口 | 6、8 末 |

## 1.1 执行 `build` 之前：须排除的 `setRequestHeader` / **非 Latin-1** 问题

> 与 `notes` **第 4 节** 同一原理；**打 zip 前**在代码中处理好。

- **查什么**：axios/fetch 拦截器是否把含中文/Emoji 的值直接赋给请求头或 Cookie 串。
- **对策**：`encodeURIComponent` 或与后端约定 Base64；mock-session 高发场景须在 zip 前闭环。
- **本条不含**：仅 JSON body 里的中文（不经 `setRequestHeader`）。

## 1.2 出包前必检 checklist（**build 前逐项自证**）

> 深读细节见 `notes.md` 0～4 节；未全勾 **不得** build/zip。

| # | 检查项 |
|---|--------|
| 1 | 项目路径与目标 `package.json` 已确认 |
| 2 | Vite `base` 与 build 一致（`command === 'build'`，勿单靠 `NODE_ENV`） |
| 3 | 客户端路由 `basename` / `BASE_URL` 与构建 base 一致 |
| 4 | MSW `serviceWorker.url` | 有 MSW 时必查；**无 MSW 标 N/A** |
| 5 | `mockServiceWorker.js` 可达 | 有 MSW 时必查；**无 MSW 标 N/A** |
| 6 | 请求头 Latin-1 安全（§1.1 / notes 第 4 节） |
| 7 | mock 模式 env 与 worker 齐全 | 有 mock/MSW 时必查；**纯生产构建标 N/A** |
| 8 | 出包脚本存在 | `build:mock` 或等价 **`build`** |
| 9 | 可修必检项已闭环或用户书面例外 |

### 1.2.1 纯静态 HTML 短 checklist（§1.0 第三行 · **跳过 build**）

| # | 检查项 |
|---|--------|
| 1 | 路径含 **非空** `index.html`（去掉 BOM/空白后有内容；0 字节 / 仅空白 → **阻塞**，见 `zip-output.md`） |
| 2 | 相对资源路径可打进 zip |
| 3 | 页面内 fetch 自定义头 → Latin-1 安全（§1.1） |

## 2. `.zip` 打包

见 **`reference/pack/zip-output.md`**。

**Agent 首选**：

```bash
node <技能包>/tools/pack-mock-zip.mjs --source <dist> --out <工作区根>/<name>-mock-<YYYYMMDDHHmmss>.zip
```

## 3. 修改配置前须用户确认（**强制** · 执行优先级 §12 · **硬停**）

对**目标项目**的配置/代码变更：

1. **发 T-FIX-ASK** → **停止**；**禁止**同轮改文件 / `build` / 打 zip。
2. 用户回复 **`1`** 或「同意 / 直接改」→ 发 **T-FIX-DO**，再执行最小改动。
3. 用户回复 **`2`** → 中止出包。
4. **例外（须同条用户消息）**：用户**本条**明示 **`直接改` / `不确认` / `你看着办`** → 可跳过 T-FIX-ASK。

## 4. 禁止与注意

- **禁止**必检项未闭环时 build/zip；构建失败须改代码 → **T-FIX-ASK 硬停**。
- **禁止**默认用工作区同名其他项目作出包目录（除非用户指定）。
- **禁止**机械复制 monorepo 路径；在目标仓库内搜等价入口后最小改动。
- **禁止**未经同意改目标项目代码；**禁止**无 `当前正在…` 连跑工具。
- **禁止**上传阶段一条消息多题（见 `upload-phase.md`）。

## 5. 进度可见（**强制** · 执行优先级 §11）

**一步一响应** + **固定话术**：进度首句见 `progress-display.md`；问用户/交付见 **`response-templates.md`**。

> **防中断**：`当前正在…` **不是**回合结束。发出后 **同轮紧接工具**。**仅** T-FIX-ASK 与上传提问可停手等回复。

### 出包阶段（最小集）

| 步骤 | 首句模板 |
|------|----------|
| 判定形态 | **当前正在**判定项目形态… |
| 检查 | **当前正在**执行出包前检查… |
| 汇总 / 拟修复 | **当前正在**汇总检查结果… |
| 等待确认 | **当前正在**等待您确认修复方案… |
| 修复（同意后） | **当前正在**按已确认方案修复代码… |
| 构建 | **当前正在**执行构建（`\<命令\>`）… |
| 打 zip | **当前正在**生成 zip 压缩包… |

**步骤结束**：该步工具完成后再发结果，然后才进入下一步 `当前正在…`。

### STEP 标记

`[STEP: 收集信息]` · `[STEP: 检查修复]` · `[STEP: 执行构建]` · `[STEP: 生成压缩包]`

## 6. 文档内索引

- 执行顺序总览：`notes` **第 0 节**；§5 进度；§3 改前确认；`response-templates.md`。
- Jenkins/Nexus/zip：**notes 第 8 节** + `zip-output.md`。
- monorepo 对照：`notes` **第 7 节**（在目标项目内自搜，非机械复制）。

## 7. 参考文件缺失时

若工作区无 `reference/pack/notes.md`：依 Vite/MSW 官方文档与本文件表维度自证，并建议沉淀为项目内文档。

**zip 就绪后** → 读 `reference/phases/upload-phase.md`（上传主路径）。
