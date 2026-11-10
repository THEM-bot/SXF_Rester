# Mock 出包在子目录静态部署的要点

## 适用范围与栈差异

**普适点（与仓库名/业务无关）**：

- 在**子目录**提供静态 `index.html` 时，若构建 **publicPath/base** 与**真实 URL 前缀**不一致，易出现白屏、跳**站点根**、或资源 404。
- **Vite 的 `public/`** 在**开发**时默认挂在**开发服务器根路径**，与**当前应用路由**无关；MSW 若用 `document.baseURI` 拼 `mockServiceWorker.js` 的 URL，在 SPA 深层路由上常**解错**。
- **生产**子目录部署时，MSW 若固定请求 **`/mockServiceWorker.js`（站点点根）**，而**文件与 `index.html` 同目录**发布，会 404 或回退为 HTML、MIME 错误。
- 浏览器对 **`setRequestHeader`** 的值要求 **ISO-8859-1** 可表示；**中文等** 放在头里会抛错；**任何**将 Cookie/用户字段写入**请求头**的层（`axios`/`ky`/封装 `fetch`）都需**编码**或**避免进头**。

**本文默认证述链**（可迁移到**任意**同形态项目，仅**文件名/层**不同）：

- 构建器：**Vite**（`vite.config` 的 `defineConfig` / `base` / `import.meta.env`）。
- 客户端路由：**HTML5 history** 且使用类似 **`import.meta.env.BASE_URL` / `createWebHistory` / `BrowserRouter` 的 `basename`** 一类机制（见第 2 节）。
- Mock：**`msw/browser` + `setupWorker` + `public/mockServiceWorker.js`（或经 `npx msw init` 生成到 public）**。

**与默认不一致时的对口关系**（原则不变，**查各框架文档**落实）：

| 默认假设 | 替代场景 | 对应动作 |
|----------|----------|----------|
| Vite | Webpack/Rspack/CRA 等 | 在各自配置中设置 **等价的** `publicPath`/`base`/`home`，**勿**在 CI 里用易错的**单独** `NODE_ENV` 去猜是否生产构建 |
| Vue Router `createWebHistory` | React Router / TanStack Router 等 | 设置 **`basename`/`base`** 与构建的 **base** 一致，并检查**兜底重定向**是否把「未匹配」送到**整站** `/` |
| axios 拦截器 | `fetch`/`ky`/got 浏览器层 | 在**统一**发请求处，对**自定义头/拼 Cookie 头**做 Latin-1 与编码，与库名无关 |
| `.env` + `VITE_*` | 其它前缀/模式 | 使用**该**项目的 **env 与 mode** 约定，确保「mock 出包」的开关在**构建**时被注入 |
| 根目录名 `mocks/`、文件名 `browser.ts` | 任意 | 在仓库内 **ripgrep** `setupWorker`、`msw/browser`、`VITE_USE_MOCK` 等**定位**入口，勿复制别仓库路径 |

> **任意 Vite+MSW 项目**均可按本文维度自检；**不**绑定特定仓库或目录名。

### 纯静态 HTML 快径

无 `package.json`、无 npm 脚本；目录内已有可部署的 **非空** `index.html` 及静态资源：

| 步骤 | 动作 |
|------|------|
| 1 | 确认项目路径（含 **非空** `index.html` 的目录；0 字节 / 仅空白 → **阻塞**，勿调用 pack） |
| 2 | 检查相对资源路径、勿硬编码站点点根；若有 fetch 自定义头 → Latin-1（§1.1） |
| 3 | **跳过 build**（见 `instructions` §1.0 第三行） |
| 3b | `node <技能包>/tools/pack-mock-zip.mjs --source <目录> --out <工作区根>/<name>-mock-<YYYYMMDDHHmmss>.zip`（工具内二次校验非空；失败 → **T-PACK-EMPTY-INDEX**） |

### 无 MSW / 无客户端路由 快径（如 resume-test）

目标项目**不使用 MSW**、**无 vue-router** 等时，checklist 对应项标 **N/A** 即可闭环，**勿**强行引入 mock：

| checklist 项 | 无 MSW 项目 |
|--------------|-------------|
| MSW worker URL | **N/A** |
| mockServiceWorker.js | **N/A** |
| mock env / worker 文件 | **N/A**（有 `.env.production` 网关相对路径即可） |
| 客户端路由 basename | **N/A**（单页 `App.vue` 无路由） |
| 仍须检查 | Vite `base`、`build` 脚本、Latin-1 请求头 |

出包命令：读 `package.json` 的 `build` 或 `build:mock`，**名称不必叫 build:mock**。

## 0. 执行顺序（对 Agent/使用者）

> 与 `PACK.md` 的「询问项目 → 检查与修复 → 打包」一一对应。

1. **询问/确认要打包的项目**
   - 问清 **项目路径**（`package.json` **或** 含 `index.html` 的目录；monorepo 禁止**猜**子包名）。**不向用户询问**出包脚本名、zip 落盘位置、Nexus/Jenkins。
2. **检查与修复**（**仅在用户指定的项目**内，用**搜索/阅读**自定位文件，**在**执行**任何**`build:mock` / 等效构建、打**`.zip` 的任一步**之前，须**结论明确**；可修问题**未闭环**则**不得**进入下方「**打包**」子步骤。）
   - 通读下文 **第 1～5 节** 与**适用范围**表；有异常**先向用户汇报方案，征得同意后再改**（`instructions` §3）。
   - 必看维度（在目标仓库内找**等价物**，名称不必一致）：**构建 base**、**应用路由 base 与重定向**、**MSW `start` 的 `serviceWorker.url`（开发 vs 生产）**、**HTTP 层**是否把**非 Latin-1** 写入**请求头**（**第 4 节**；在 **build** 前 即 须 自证，**勿** 等 上 线 后 再 从 `dist` 反 推）、**mock 模式**下 **env 与** `public` **里的 worker 文件**。
3. **打包**（**仅**当上一步**已通过**……见 `reference/instructions.md` **§4**。）
   - 用目标 `package.json` 中的出包脚本与检测到的包管理器执行构建（**不向用户询问脚本名**）。
3b. **压缩**（与 `reference/instructions.md` **§2**、`zip-output.md` 一致）  
   - **首选**：`node <技能包>/tools/pack-mock-zip.mjs --source <dist或静态目录> --out ...`  
   - **备选**：`tools/pack-mock-zip.ps1`（Windows `-File` 绝对路径）· `pack-mock-zip.sh`；默认落在**当前工作区根**。
4. **部署后**（**可选深读**）  
   - 第 **5～6** 节与线网**验收**；**网关/302/证书** 转运维。Nexus/Jenkins 见 **第 8 节**（遇流水线 unzip 问题时再读，**非**出包前向用户收集项）。

## 1. Vite `base`：用 `command === 'build'`，勿单独依赖 `NODE_ENV` 与「是否 production」绑定

**现象**：子目录打开展示后，地址**跳到**域名根，或**资源**从错误前缀加载；路由**兜底**把整页带到 `/`。

**根因（常见）**：`base: process.env.NODE_ENV === 'production' ? './' : '/'` 在 **CI 执行 `vite build`** 时若 `NODE_ENV` 未按预期，会得到 **`'/'`**，与**真实**挂载**不一致**。

**做法**（Vite 典型写法）：

```ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  // ...
}))
```

> 非 Vite：在**本项目的构建配置**中保证「**出产物**的 publicPath/应用根」与**线 URL**一致；**勿**在 skill 中写死**另一仓库的** `vite.config` 名。

## 2. 客户端路由的 base 与第 1 节一致

**（Vue + Vue Router）** `createWebHistory(import.meta.env.BASE_URL)`；`base` 错时子路径**未匹配**，易因 `redirect: '/'` 等表现为**全站**根（依项目路由表而定）。

**（React 等）** 使用与构建 **base** 相同的 **`basename`**（如 `createBrowserRouter(..., { basename: import.meta.env.BASE_URL })` 或等价 API）。

> 与 **Nginx/网关 302 到根** 区分；后者查 HTTP 与运维规则。

## 3. MSW `mockServiceWorker.js`：开发与生产**解析 worker URL 的「根」不同**

**现象**：`Failed to register` / `unsupported MIME type ('text/html')`；请求 URL 形如 `/{某路由段}/mockServiceWorker.js`（MSW 被 history 路由吞掉）。

**根因（开发）**：`public` 在 Vite 开发服上通常在 **origin 根**；用 **`document`/`location` 当前页**作基，会误指向**路由路径**下不存在的资源，**回退 HTML** → MIME 错。

**根因（子目录生产）**：默认或硬编码的 **`/mockServiceWorker.js`** 指向**站点点根**，而**真实文件**在**发布目录**与 `index.html` 同级（或 Nginx 映射目录）。

**做法**（`worker.start` 的 `serviceWorker.url`，思路等价即可）：

- `import.meta.env.PROD`：与**入口页面**同级的 **worker 脚本 URL**（常见：`new URL('mockServiceWorker.js', document.baseURI).href`；**若**你们 hash 或固定 `<base href>` 另有约定，以**能 200 拿到 JS** 为准）。
- `!import.meta.env.PROD`：`new URL('mockServiceWorker.js', window.location.origin).href`（Vite 将 `public` 挂**站点根**的典型做法）。

> 多版本/同 origin 并存时，注意 **Service Worker 缓存** 与**注销**、强刷；非 Vite 的 dev 服行为**查文档**自证。

## 4. 请求头：`setRequestHeader` 仅对 Latin-1 友好

> **构建/打 zip 前** 就 应 在 仓库 中 **排查 并 修复**；**与 线 网** 是 同一 类 缺陷，**不** 依赖 部署 后 再 用 控 制 台 发 现。

**现象**：`... non ISO-8859-1 code point`；**mock 用户/部门/姓名**等进入 **header** 或**手拼的 Cookie 头**。

**做法**：在**统一点**（`axios`/`ky`/封装的 `fetch` 等）对**可能含非 Latin-1** 的头值用 **`encodeURIComponent`（或**仅含 ASCII 的**传输用编码**），并与**后端/网关**约定**解码**；**勿**在日志中输出**完整** token/PII。

> 本仓库曾用 **`sf_u_c` / `sf_d_f`** 说明；**其它**项目**自定义**头名同理，以**读代码**为准。

## 5. 构建与环境变量

- 使用**目标** `package.json` 的 **mock 出包**脚本（**名称未必** 叫 `build:mock`）及对应 **env**（`VITE_USE_MOCK` 等以**各项目** env 为纲）。
- 出包后确认**产物根** 下 `mockServiceWorker.js` 与 `index.html` 的**实际位置**符合你们部署**拷贝/同步**规则；**不**把本仓库的 `dist` 目录名**强加**到别的项目（有的用 `out`、`build` 等）。

## 6. 发布验收清单（可逐项打勾）

- 用**真实**部署**前缀**打开；地址不无故**只剩**根域名（**区分**第 1～2 节与 302）。
- `mockServiceWorker.js` 为 **200**、**JavaScript**，**非** `text/html`。
- 主流程/列表等无本节与第 3～4 节对应类**控制台**错误；多版本**目录隔离**、必要时清**站点**数据或注销 SW。

## 7. 参考实现位点（**可选**，当前工作区内自搜）

在目标项目中**自行定位**等价文件（**不**依赖特定 monorepo 路径）：

- `ripgrep`：`setupWorker`、`msw/browser`、`VITE_USE_MOCK`、`build:mock`、`mockServiceWorker`。
- 从 **应用入口**（`main`/`index`）沿 **import** 找 **是否** `start` MSW；从 **请求封装** 找**拦截器**中**头** 与 **Cookie**。

若工作区内有 Vite+MSW 参考实现，可对照：`vite.config.ts`（`base`）、`mocks/browser.ts`（worker URL）、`api/axios.ts`（请求头 Latin-1）。

## 8. Nexus / Jenkins：制品 ZIP 与 Linux 上 `unzip` 失败

本节前段与**具体前端框架无关**，属**制品形态 + 解压环境** 的通用问题；易在 **demo-release 类**「下载 ZIP → `unzip` 到 `releases/REL-…`」流水线中暴露。

### 8.1 现象与根因

- 日志或控制台出现：  
  `warning: ... appears to use backslashes as path separators`（或同类提示），之后 **Jenkins 整段 `sh` 以 exit code 1 失败**，而 **Nexus 下载**、**本机 dist 或文件夹** 本身**正常**。
- **根因（常见）**：在 **Windows** 上打出的 ZIP，内部路径使用 **反斜杠 `\`** 作分隔；**PKZIP 规范** 推荐**正斜杠** `/`。Linux 上 **`unzip`（Info-ZIP）** 会**告警**，且**常返回非 0 退出码（例如 1）** 表示「有警告」。
- 若 Jenkins 同一 `sh` 中启用了 **`set -e`**（或等价的「任一步非 0 即失败」），**`unzip` 即使已解压出内容**，**退出码 1 仍会导致整段失败**，Post 中表现为 **Deploy failed**。

> 与 **Nexus 拉包失败、401、ZIP 文件损坏** 等区分；若 `curl` 已 200 且 `unzip` 能列出内容，多属本节。

### 8.2 对策（按推荐顺序）

1. **从源头用本包脚本打 ZIP（推荐）**  
   - **Windows**：`tools/pack-mock-zip.ps1`（.NET 写入时为**正斜杠**）。  
   - **Linux / macOS / WSL**：`tools/pack-mock-zip.sh`（需 `zip(1)`）。  
   - **勿**依赖资源管理器「**发送到**压缩**文件夹**」等默认。

2. **流水线侧**（与运维/平台约定）  
   - **根本**仍建议按 **(1)** 在**上传前**用本包脚本打出**兼容包**。  
   - 若**必须**继续用 `unzip`：在**审阅**日志后，可**有选择**地对「**仅**路径风格**警告**导致 exit 1」做**显式**成功判定；**禁止**用 `|| true` **掩盖**真实**解压失败**或**空目录**。

3. **验收**  
   - 在**与线上一致**的 OS 上，对**同一**制品执行一次**解压**与 **`echo $?`**，确认**退出策略** 与**产物目录结构** 符合发布目录要求。

### 8.3 与本 skill 前段的关系

- 第 **1～6 节** 解决**浏览器**侧子路径、MSW、**HTTP 头** 等。  
- **第 8 节** 解决**制品**已上传、**部署机** 上 **因 ZIP 路径/退出码** 导致**不落地**；**两边** 都过才能「发布 URL 上可正常访问」。
