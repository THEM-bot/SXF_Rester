#!/usr/bin/env node
/**
 * pmw —— 产品经理工作流 CLI（唯一入口）
 *
 * 日常最常用的三条命令：
 *   pmw today            我今天该干什么（最省心的入口）
 *   pmw status           看状态 + Mermaid 流程图
 *   pmw next             当前阶段还差什么才能往前走
 *
 * 其它命令见 pmw help。所有命令都支持 --dir <项目目录>，默认取 PMF_DIR 环境变量或当前目录。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readSettings, saveSettings, setupComplete, settingsFile } from './lib/settings.mjs';
import {
  SCHEMA,
  PROJECT_STAGES,
  REQ_STAGES,
  stagesOf,
  stageIndex,
  stageOf,
  nextStageKey,
  load,
  save,
  gateCheck,
  toMermaid,
  toTaskMermaid,
  summarize,
  seedTasks,
  addTask,
  findTask,
  setTaskStatus,
  tasksOf,
  taskBranches,
  taskRollup,
  pendingByWho,
  BRANCH_KINDS,
} from './lib/state.mjs';
import { docxToMarkdown } from './lib/docx.mjs';
import { markdownToDocx as markdownToDocxLegacy } from './lib/docxw.mjs';
import { markdownToDocxDetailed as markdownToDocxModern } from './lib/wdocx.mjs';
import { guideOf, guidesIndex, kbQueriesOf } from './lib/guides.mjs';
import { resolveImagePath } from './lib/images.mjs';
import { definedTerms, demoFeatures, lintDocs } from './lib/lint.mjs';
import { reflectPromptsOf } from './lib/reflect-prompts.mjs';
import { readXlsx, xlsxToMarkdown, writeXlsx } from './lib/xlsx.mjs';
import { pdfToMarkdown, markdownToPdf, findPdfToText, missingPdfHint } from './lib/pdf.mjs';

/**
 * Markdown → Word 的统一入口。
 * 默认走 wdocx（docx@9 引擎：合并单元格、目录、页眉页脚、图片、四级标题）。
 * 若 docx 依赖没装（例如没跑过 npm install），自动退到零依赖的 docxw，
 * 保证「出 Word」这件事永远不会因为缺依赖而彻底失败。
 */
async function md2docx(md, out, title, extra = {}) {
  try {
    const r = await markdownToDocxModern(md, out, { title, ...extra });
    // 图片统计（缺图要告诉用户，不能静默吞掉）
    return { path: r?.path || out, missingImages: r?.missingImages || [], usedImages: r?.usedImages || [] };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (!/docx 依赖|Cannot find module 'docx'|ERR_MODULE_NOT_FOUND/.test(msg)) throw e;
    if (process.env.PMF_NO_FALLBACK !== '1') {
      const p = markdownToDocxLegacy(md, out, title);
      sayErr(`! 缺少 docx 依赖，已退回基础引擎（不支持合并单元格/目录/页眉页脚/图片）：${out}`);
      return { path: p, missingImages: [], usedImages: [], degraded: true };
    }
    throw e;
  }
}

const ROOT = (() => {
  // 优先级：PMF_ROOT 环境变量 > 包根（tools/ 的上一级）
  // 作为 DSH 插件安装后，包会被放进 profile 的 node_modules，
  // 那时应该用 PMF_ROOT 指向用户自己的工作目录。
  if (process.env.PMF_ROOT) return path.resolve(process.env.PMF_ROOT);
  return path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
})();

/* ===================== 参数解析 ===================== */
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out.flags[key] = true;
      else {
        out.flags[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));
const cmd = argv._[0] || 'today';
const F = argv.flags;

/**
 * 机器可读模式：被 DSH 插件 / 其它程序调用时用。
 *  - `--json`       stdout 只输出一个 JSON 对象（含 ok / command / 结构化结果）
 *  - `--no-color`   去掉 ANSI 颜色；stdout 不是 TTY 时自动生效
 *  - `NO_COLOR`     环境变量与 --no-color 等价
 */
const JSON_MODE = Boolean(F.json);
const NO_COLOR = Boolean(F['no-color']) || JSON_MODE || Boolean(process.env.NO_COLOR) || !process.stdout.isTTY;

/** 收集 JSON 模式的输出，最后统一打印成一份 JSON */
const jsonOut = { ok: true, command: cmd, cwd: process.cwd() };
const plainLog = console.log.bind(console);

function need(v, msg) {
  if (v === undefined || v === true || v === '') {
    fail(msg, 2);
  }
  return v;
}

/**
 * 统一的致命错误出口：JSON 模式下必须先 flush 一份错误 JSON 再退出，
 * 否则调用方（DSH 插件）只能看到「exit 2 + 空输出」，无法知道错在哪。
 */
function fail(msg, code = 2) {
  sayErr(msg.startsWith('✗') ? msg : `✗ ${msg}`);
  if (JSON_MODE) flushJson(code);
  process.exit(code);
}

/* ===================== 目录解析 ===================== */
/** 短时间戳，用于自动编号：20261107 */
function stampShort() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** init --here / --dir 时，决定状态落在哪个目录 */
function resolveTargetDirForInit() {
  if (F.dir) return path.resolve(F.dir);
  if (process.env.PMF_DIR) return path.resolve(process.env.PMF_DIR);
  return process.cwd();
}

/**
 * 项目根 = 「需求工作区」的父目录。
 * 你自己的用法是：在某个父目录（默认 桌面\文档）下，一个子目录装一个需求，
 * 里面放背景材料和产出。所以 root 不是一个项目，而是「装项目的文件夹」。
 *
 * 解析顺序：
 *   1. --root
 *   2. PMF_ROOT 环境变量（插件会把 cordis.patch.yml 的 config.root 注入进来）
 *   3. 包目录本身就是一个需求工作区（装在一个需求目录里时）
 *   4. 包目录下有需求工作区时，退回包目录
 *   5. <包目录>/projects
 */
function projectsRoot() {
  if (F.root) return path.resolve(F.root);
  if (process.env.PMF_ROOT) return path.resolve(process.env.PMF_ROOT);
  if (readSettings().root) return path.resolve(readSettings().root);
  // 包目录本身如果就是一个需求工作区（install 时装在需求目录里），就用它
  if (detectKind(ROOT)) return ROOT;
  const local = path.join(ROOT, 'projects');
  try {
    const hasOwn = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .some((e) => e.isDirectory() && !NON_PROJECT_DIRS.has(e.name) && detectKind(path.join(ROOT, e.name)));
    if (hasOwn) return ROOT;
  } catch {
    /* 读不到就当没有 */
  }
  return local;
}

/** 工作区里两个固定子目录的名字（中文，给用户看的）。 */
const DIR_SOURCE = '原材料';   // digest 转出来的 Markdown + 原始 docx
const DIR_OUTPUT = '产物';     // publish / doc 出来的 Word 和发布清单
const LEGACY_DIRS = [['materials', DIR_SOURCE], ['dist', DIR_OUTPUT]];

/** 老工作区把 materials/ dist/ 改名成 原材料/ 产物/（只在旧名存在、新名不存在时动手）。 */
function migrateLegacyDirs(dir) {
  for (const [oldName, newName] of LEGACY_DIRS) {
    const from = path.join(dir, oldName);
    const to = path.join(dir, newName);
    try {
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      fs.renameSync(from, to);
    } catch {
      /* 改名失败不影响主流程：后面统一用新名字找，找不到就算了 */
    }
  }
}

/** 根目录下的这些子目录不是需求工作区，永远跳过。 */
const NON_PROJECT_DIRS = new Set([
  '已完成', '归档', '其他资料', 'PM_skill',
  DIR_SOURCE, DIR_OUTPUT, 'materials', 'dist',
  'demo', 'modules', 'master',
]);

/** 扫一遍项目根，返回其中「已经是项目」的工作区目录（有 project.json / req.json 才算）。 */
function scanProjects() {
  const root = projectsRoot();
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (NON_PROJECT_DIRS.has(e.name)) continue;
    const dir = path.join(root, e.name);
    const kind = detectKind(dir);
    if (!kind) continue;
    out.push({ dir, kind });
  }
  return out;
}

/** 根目录下恰好只有一个项目时返回它，否则 null。 */
function singleProjectDir() {
  const dirs = scanProjects();
  return dirs.length === 1 ? dirs[0].dir : null;
}

/** 当前项目目录：--dir > PMF_DIR > 若 cwd 本身是项目 > 只有一个项目时就用它 > 报错 */
function resolveDir(mustExist = true) {
  if (F.dir) return path.resolve(F.dir);
  if (process.env.PMF_DIR) return path.resolve(process.env.PMF_DIR);
  if (fs.existsSync(path.join(process.cwd(), 'project.json'))) return process.cwd();
  if (fs.existsSync(path.join(process.cwd(), 'req.json'))) return process.cwd();

  // 只根目录下只有一个项目时直接用它——一个人用的时候这是最常见的场景，
  // 省得每条命令都敲 --dir。有两个以上就仍然要求显式指定，避免改错项目。
  if (mustExist && !F.all) {
    const only = singleProjectDir();
    if (only) return only;
  }

  if (!mustExist) return null;
  fail(
    '✗ 不知道在哪个项目里。请加 --dir <项目目录>，或先 pmw ls 看有哪些项目，\n' +
      '  或设置环境变量 PMF_DIR。',
    2,
  );
}

function detectKind(dir) {
  if (fs.existsSync(path.join(dir, 'project.json'))) return 'project';
  if (fs.existsSync(path.join(dir, 'req.json'))) return 'req';
  return null;
}

function openState(dirArg) {
  const dir = dirArg || resolveDir();
  const kind = detectKind(dir);
  if (!kind) {
    sayErr(`✗ ${dir} 下既没有 project.json 也没有 req.json（先用 pmw init）`, 2);
  }
  migrateLegacyDirs(dir);
  return { dir, kind, state: load(dir, kind) };
}

/* ===================== 工具 ===================== */
const C = {
  dim: (s) => (NO_COLOR ? String(s) : `\x1b[2m${s}\x1b[0m`),
  b: (s) => (NO_COLOR ? String(s) : `\x1b[1m${s}\x1b[0m`),
  g: (s) => (NO_COLOR ? String(s) : `\x1b[32m${s}\x1b[0m`),
  y: (s) => (NO_COLOR ? String(s) : `\x1b[33m${s}\x1b[0m`),
  r: (s) => (NO_COLOR ? String(s) : `\x1b[31m${s}\x1b[0m`),
  c: (s) => (NO_COLOR ? String(s) : `\x1b[36m${s}\x1b[0m`),
};

/** JSON 模式下，人类可读的日志不写 stdout（避免污染解析），只保留到 collect 里 */
function say(...args) {
  if (JSON_MODE) return;
  plainLog(...args);
}

/** 错误也走 JSON 模式：--json 时把错误信息放进 result.error，并由 main 统一 exit(1) */
function sayErr(...args) {
  if (JSON_MODE) {
    jsonOut.ok = false;
    jsonOut.error = args.map((a) => String(a)).join(' ').replace(/\x1b\[[0-9;]*m/g, '');
    return;
  }
  console.error(...args);
}

/**
 * 非致命提醒：JSON 模式下收进 warnings，不把 ok 置 false。
 * 有些「提醒」本来就是正常结果的一部分（比如缺图要报告，但 Word 已经出成功了）。
 */
function sayWarn(...args) {
  if (JSON_MODE) {
    if (!Array.isArray(jsonOut.warnings)) jsonOut.warnings = [];
    jsonOut.warnings.push(args.map((a) => String(a)).join(' ').replace(/\x1b\[[0-9;]*m/g, ''));
    return;
  }
  console.error(...args);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rel(dir, p) {
  return path.relative(dir, p).split(path.sep).join('/');
}

function writeIfAbsent(file, content) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

function readMaybe(file, fallback = '') {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : fallback;
}

/** 小需求编号：REQ-YYYYMMDD-N */
function nextReqNo(dir) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const prefix = F.prefix ? String(F.prefix) : 'REQ';
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  let n = 1;
  while (fs.existsSync(path.join(dir, '..', `${prefix}-${day}-${String(n).padStart(2, '0')}`))) n += 1;
  return `${prefix}-${day}-${String(n).padStart(2, '0')}`;
}

/* 谁在动这个状态：命令行默认算 ai，面板传来的算 user。
   这不是审计洁癖——模型必须能分辨「这一步是我推进的」还是
   「用户自己在面板上改了」，否则它会拿着旧判断继续往下走。 */
function who() {
  return F.by || 'ai';
}

function log(state, action, note, by) {
  const at = new Date().toISOString();
  const actor = by || who();
  state.history = state.history || [];
  state.history.push({ at, action, note: note || '', by: actor });
  state.rev = (state.rev || 0) + 1;
  state.lastBy = actor;
  state.lastAction = action;
  state.lastAt = at;
}

/* 上次模型「看过」之后发生的事。看 = pmw ack 或模型自己跑 status 时带上 --ack */
function changesSinceAI(state) {
  const since = state.aiSeenAt || null;
  const hist = state.history || [];
  const fresh = since ? hist.filter((h) => h.at > since) : hist.slice(-3);
  return {
    seenAt: since,
    total: fresh.length,
    byUser: fresh.filter((h) => h.by === 'user').length,
    items: fresh.slice(-12).map((h) => ({ at: h.at, by: h.by || 'ai', action: h.action, note: h.note })),
  };
}

function countOpen(state) {
  return (state.reviews || []).filter((r) => r.status !== 'closed').length;
}

/* ===================== 模板 ===================== */
function tplSmallPrd(state) {
  return `# ${state.title}

| 项 | 值 |
| --- | --- |
| 需求编号 | ${state.id} |
| 提出方 | ${state.owner || '[待填]'} |
| 优先级 | 中 |
| 需求分类 | L2 |
| 故事点 | [待填] |
| 实现方式 | AI-Coding |
| AI-Coding生成模式 | [待确认] |
| 研效通 | ${state.yxt && state.yxt.no ? state.yxt.no : '[未发布]'} |

## 1. 背景与问题

[现在怎么干、卡在哪。两三句话，写不出来说明还没搞清楚.]

## 2. 要做什么

- [一条一件事，写结果不写实现]

## 3. 规则

> 按实际操作的先后顺序写，不要按增删改查罗列。
> 用不上的小节整节删掉，不要留空标题。

### 3.1 [操作名]

| 场景 | 来源 | 处理规则 | 结果 |
| --- | --- | --- | --- |
|  |  |  |  |

## 4. 验收标准

| 编号 | 可核对的结果 |
| --- | --- |
| ${state.id}-AC01 |  |

## 5. 待确认

- [ ]
`;
}

function tplMasterPrd(state) {
  return `# ${state.title}：方案总览

> 版本 v1.0 ｜ ${today()} ｜ 本地编号 ${state.id}

## 1. 一句话说明

[这个系统是干什么的，谁在用。]

## 2. 价值与使用场景

> 这一段是给主管看的：为什么要做，做完之后业务省了什么。

| 场景 | 现在怎么干 | 建成后怎么干 | 省了什么 |
| --- | --- | --- | --- |
|  |  |  |  |

## 3. 范围

**本期做：**

- [ ]

**本期不做 / 后续迭代：**

- [ ]

## 4. 模块划分

| 模块编号 | 模块名 | 一句话职责 | 依赖 |
| --- | --- | --- | --- |
| MOD-01 |  |  |  |

## 5. 关键业务规则

| 规则 | 说明 | 涉及模块 |
| --- | --- | --- |
|  |  |  |

## 6. 系统级横切要求

| 项 | 要求 |
| --- | --- |
| 权限 |  |
| 操作日志 |  |
| 数据量 / 性能 |  |
| 与外部系统对接 |  |

## 7. 里程碑（建议）

| 批次 | 内容 | 前置 |
| --- | --- | --- |
| B1 |  |  |
`;
}

function tplModulePrd(state, mod) {
  return `# ${state.title}：${mod.title} 模块 PRD

> 父需求：${state.id} ｜ 模块编号 ${mod.id}

本模块下各子需求独立排期、交付和验收；未决项不因整理而自动定稿。

## 子需求一览

| 子需求 | 交付内容 | 批次 |
| --- | --- | --- |
|  |  |  |

## 模块级说明

- **模块职责**：
- **不包含**：
- **依赖模块**：
`;
}

function tplSubPrd(state, sub) {
  return `# ${sub.title}

| 项 | 值 |
| --- | --- |
| 子需求编号 | ${sub.id} |
| 所属模块 | ${sub.module || '[未归类]'} |
| 父需求 | ${state.id} |
| 前置子需求 | ${(sub.deps || []).join('、') || '无'} |
| 批次 | ${sub.batch || '[待排期]'} |
| 优先级 | 中 |
| 需求分类 | L2 |
| 故事点 | [待填] |
| 实现方式 | AI-Coding |
| AI-Coding生成模式 | [待确认] |
| 研效通 | ${sub.yxt && sub.yxt.no ? sub.yxt.no : '[未发布]'} |

## 1. 交付结果与范围

- **本条范围**：
- **不包含**：

## 2. 业务信息、来源与处理规则

| 信息 / 环节 | 来源 | 产品规则 |
| --- | --- | --- |
|  |  |  |

## 3. 独立验收标准

| 编号 | 可核对的结果 |
| --- | --- |
| ${sub.id}-AC01 |  |

## 4. 权限、异常与交付边界

| 情况 | 处理 |
| --- | --- |
|  |  |

## 5. 依赖与未决

- 前置：${(sub.deps || []).join('、') || '无'}
- 未决：
`;
}

function tplDiscover(state) {
  return `# ${state.title}：需求梳理

> 来源材料见 原材料/

## 1. 原始诉求（材料里怎么说的）

[直接摘录会议纪要 / 业务文档里的原话，不要改写。]

## 2. 角色与场景

| 角色 | 在什么场景 | 想解决什么 | 现在怎么凑合 |
| --- | --- | --- | --- |
|  |  |  |  |

## 3. 澄清清单

> 没搞清楚的写这里，逐条问业务。答完把结论填进第 4 节并勾掉。

| # | 问题 | 为什么要问 | 结论 | 状态 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  | 待问 |

## 4. 结论汇总

- 
`;
}

function tplAlign(state) {
  return `# ${state.id} ${state.title}：业务对齐记录

> 这里只记"问过谁、答了什么"，一问一答，不要写产品方案。

| # | 问题 | 问谁 | 结论 | 日期 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  | ${today()} |
`;
}

function tplChangelog(state) {
  return `# ${state.title}：改动说明

> 每次 PRD / demo 变更都记一条，同步给开发时直接用这份。

## v1.0 ｜ ${today()}

- 首次发布。
`;
}

/* ===================== 命令：init ===================== */
/**
 * 建一个需求工作区。
 *
 * 两种用法：
 *   1. `pmw init --here`（或 --dir 指向已有目录）——**就地建**。
 *      你自己建好目录、放好背景材料，然后让状态落在这个目录根上，材料与产出平铺。
 *      这是推荐用法：一个工作区 = 一个需求。
 *   2. `pmw init --id PRJ-01`——在项目根下新建 `PRJ-01/` 子目录。
 */
function cmdInit() {
  const kind = F.kind === 'req' ? 'req' : 'project';
  const root = projectsRoot();
  const here = Boolean(F.here);
  const dirMode = Boolean(F.dir);

  const id = here || dirMode ? String(F.id || '').trim() : need(F.id, '请给编号：--id PRJ-01（大需求）或 --id REQ（小需求自动编号）');
  const title = need(F.title, '请给标题：--title "..."');

  let dir;
  let finalId;
  if (here || dirMode) {
    // 就地建：目录就是当前工作区（--dir）或 cwd
    dir = resolveTargetDirForInit();
    finalId = id || (kind === 'project' ? `PRJ-${stampShort()}` : nextReqNo(root));
  } else if (kind === 'project') {
    dir = path.join(root, id);
    finalId = id;
  } else {
    finalId = id === 'REQ' || id === 'auto' ? nextReqNo(root) : id;
    dir = path.join(root, finalId);
  }

  if (fs.existsSync(path.join(dir, kind === 'project' ? 'project.json' : 'req.json'))) {
    fail(`✗ 已存在：${dir}`, 2);
  }
  fs.mkdirSync(dir, { recursive: true });

  const state = {
    schema: SCHEMA,
    kind,
    id: finalId,
    title,
    owner: F.owner || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: kind === 'project' ? PROJECT_STAGES[0].key : REQ_STAGES[0].key,
    yxt: { parentNo: null, no: null, project: F.yxtProject || null },
    reviews: [],
    blockers: [],
    subs: [],
    modules: [],
    tasks: [],
    history: [],
  };
  seedTasks(state);
  log(state, 'init', `创建${kind === 'project' ? '大需求项目' : '小需求'}`);
  save(dir, state);

  const created = [];
  const add = (p, c) => {
    if (writeIfAbsent(path.join(dir, p), c)) created.push(p);
  };

  if (kind === 'project') {
    add('discover.md', tplDiscover(state));
    add('master/master-prd.md', tplMasterPrd(state));
    add('modules/index.md', `# ${title}：父子需求索引\n\n> 父需求 ${finalId}。本文件由 pmw sync-docs 自动生成，手改会被覆盖。\n\n还没有拆模块，先 pmw add-module。\n`);
    add('changelog.md', tplChangelog(state));
    add('demo/index.html', '<!doctype html>\n<html lang="zh-CN"><meta charset="utf-8"><title>Demo</title>\n<body><h1>Demo 待制作</h1></body></html>\n');
    fs.mkdirSync(path.join(dir, DIR_SOURCE), { recursive: true });
    fs.mkdirSync(path.join(dir, 'modules'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'demo'), { recursive: true });
  } else {
    add('align.md', tplAlign(state));
    add('prd.md', tplSmallPrd(state));
    add('changelog.md', tplChangelog(state));
    fs.mkdirSync(path.join(dir, DIR_SOURCE), { recursive: true });
  }

  say(`${C.g('✓')} 已创建 ${C.b(finalId)} ${title}`);
  say(`  ${C.dim(dir)}`);
  if (created.length) say(`  生成文件：${created.map((p) => C.c(p)).join('、')}`);
  say(`\n下一步：${C.y(`pmw today --dir "${dir}"`)}`);

  jsonOut.result = {
    id: finalId,
    title,
    kind,
    dir,
    stage: state.stage,
    created,
  };
}

/* ===================== 命令：status / flow / next ===================== */

/** 本阶段任务清单（人读） */
function renderTaskList(state) {
  const cur = tasksOf(state, { stage: state.stage });
  if (!cur.length) return;
  const done = cur.filter((t) => t.status === 'done').length;
  say(`\n${C.b('本阶段任务')} ${C.dim(`(${done}/${cur.length})`)}`);
  const branches = new Map();
  for (const t of cur) {
    const k = t.branch || '';
    if (!branches.has(k)) branches.set(k, []);
    branches.get(k).push(t);
  }
  const lineOne = (t) => {
    const icon = TASK_STATUS_ICON[t.status] || '○';
    const color = t.status === 'done' ? C.g : t.status === 'blocked' ? C.r : t.status === 'doing' ? C.y : ((x) => x);
    const who = t.who && t.who !== '我' ? C.c(` @${t.who}`) : '';
    const note = t.note ? C.dim(` — ${t.note}`) : '';
    return `  ${color(icon)} ${C.b(t.id)} ${t.title}${who}${note}`;
  };
  for (const [k, items] of branches) {
    if (k) say(`  ${C.dim('分支')} ${C.b(k)}`);
    for (const t of items) say(k ? `  ${lineOne(t)}` : lineOne(t));
  }
}

function renderStatus(dir, state, withDiagram = true) {
  const s = summarize(dir, state);
  const list = stagesOf(s.kind);
  say(`${C.b(s.id)} ${s.title}   ${C.dim(`[${s.kind === 'project' ? '大需求' : '小需求'}] ${s.progress}`)}`);
  say(`当前阶段：${C.y(`${s.stageName}`)}   ${C.dim(s.stage)}`);

  if (s.blockers.length) {
    say(`\n${C.r('卡点：')}`);
    s.blockers.forEach((b, i) => say(`  ${i + 1}. [${b.scope || '全局'}] ${b.text} ${C.dim(`(${b.at.slice(0, 10)})`)}`));
  }
  if (s.openReviews.length) {
    say(`\n${C.y('未闭环评审问题：')}`);
    s.openReviews.forEach((r) => {
      const tag = r.status === 'deferred' ? C.c('待业务确认') : C.y('待回答');
      say(`  #${r.id} [${tag}] ${r.text}${r.owner ? C.dim(` — ${r.owner}`) : ''}`);
    });
  }

  const st = stageOf(s.kind, s.stage);
  say(`\n${C.dim('本阶段目标：')}${st.goal}`);

  renderTaskList(state);

  if (s.gateFailures.length) {
    say(`\n${C.r('离开本阶段还差：')}`);
    s.gateFailures.forEach((f) => say(`  ✗ ${f.hint}${f.actual ? C.dim(`（${f.actual}）`) : ''}`));
  } else if (s.next) {
    const nx = stageOf(s.kind, s.next);
    say(`\n${C.g('门禁已通过')}，可以进：${C.b(`${nx.icon} ${nx.name}`)}`);
  } else {
    say(`\n${C.g('已是最后阶段')}`);
  }

  if (s.pendingByWho.length) {
    say(`\n${C.y('要找人确认：')}`);
    for (const g of s.pendingByWho) {
      say(`  ${C.b(g.who)} ${C.dim(`(${g.items.length})`)}：${g.items.map((i) => i.text).join('；')}`);
    }
  }

  if (s.kind === 'project' && s.subs.length) {
    say(`\n${C.dim('子需求：')}`);
    s.subs.forEach((sub) => {
      const flag = sub.yxtNo ? C.g('✓') : C.dim('·');
      say(`  ${flag} ${sub.id} ${sub.title}${sub.module ? C.dim(` [${sub.module}]`) : ''}${sub.yxtNo ? C.dim(` → ${sub.yxtNo}`) : ''}`);
    });
  }

  if (withDiagram) {
    say(`\n${C.dim('总览：')}\n`);
    say(toMermaid(state));
    const tm = toTaskMermaid(state);
    if (tm) say(`\n${C.dim(`本阶段任务链路（${st.name}）：`)}\n`)
    say(tm);
  }
  return s;
}

function cmdStatus() {
  const { dir, state } = openState();
  const s = summarize(dir, state);
  const changes = changesSinceAI(state);
  // 模型每次看状态都该知道「我不在的时候谁动过什么」
  if (F.ack) {
    state.aiSeenAt = new Date().toISOString();
    save(dir, state);
  }
  if (JSON_MODE) {
    jsonOut.result = { ...s, dir, allProjects: listProjects(), changes, rev: state.rev || 0, lastBy: state.lastBy || null };
    jsonOut.mermaid = toMermaid(state);
    jsonOut.taskMermaid = toTaskMermaid(state);
    return;
  }
  renderStatus(dir, state, !F.noflow);
  if (changes.total) {
    const userCount = changes.byUser;
    say(
      `\n${C.y(`⚠ ${changes.total} 条改动发生在你上次查看之后`)}${userCount ? C.y(`（其中 ${userCount} 条是用户手动改的）`) : ''}`,
    );
    for (const h of changes.items.slice(-5)) {
      say(`   ${h.by === 'user' ? C.y('用户') : C.dim('  AI')} ${C.dim(fmtLocal(h.at))} ${h.action} ${h.note}`);
    }
    say(C.dim(`   （看全：pmw since；确认已了解：pmw ack）`));
  }
}

function cmdFlow() {
  const { dir, state } = openState();
  const withTasks = Boolean(F.tasks) || Boolean(F.task);
  const mermaid = toMermaid(state);
  const taskMermaid = toTaskMermaid(state, F.stage || null);
  if (JSON_MODE) {
    jsonOut.result = { dir, mermaid, taskMermaid };
    jsonOut.mermaid = mermaid;
    jsonOut.taskMermaid = taskMermaid;
    return;
  }
  say(mermaid);
  if (withTasks) {
    say(`\n${C.dim('本阶段任务链路：')}\n`);
    say(taskMermaid);
  }
}

/** 只出当前阶段任务链路图 */
function cmdTaskflow() {
  const { dir, state } = openState();
  const mermaid = toTaskMermaid(state, F.stage || null);
  if (JSON_MODE) {
    jsonOut.result = { dir, stage: F.stage || state.stage, taskMermaid: mermaid };
    jsonOut.taskMermaid = mermaid;
    return;
  }
  const st = stageOf(state.kind, F.stage || state.stage);
  say(`${C.dim(`任务链路：`)}${st.icon} ${st.name}\n`);
  say(mermaid);
}

function cmdNext() {
  const { dir, state } = openState();
  const s = summarize(dir, state);
  const st = stageOf(s.kind, s.stage);
  say(`${C.b('当前：')}${st.icon} ${st.name}`);
  say(`${C.dim('目标：')}${st.goal}`);
  say(`${C.dim('做法：')}${st.do}`);
  if (s.gateFailures.length) {
    say(`\n${C.r('还差：')}`);
    s.gateFailures.forEach((f) => say(`  ✗ ${f.hint}${f.actual ? C.dim(`（${f.actual}）`) : ''}`));
  } else if (s.next) {
    say(`\n${C.g('可以推进')} → ${C.y(`pmw advance`)} 进「${stageOf(s.kind, s.next).name}」`);
  }
  jsonOut.result = {
    id: s.id,
    stage: s.stage,
    stageName: st.name,
    goal: st.goal,
    do: st.do,
    exit: st.exit,
    canAdvance: s.canAdvance,
    next: s.next,
    nextName: s.next ? stageOf(s.kind, s.next).name : null,
    gateFailures: s.gateFailures,
  };
  void dir;
}

/* ===================== 命令：today ===================== */
function cmdToday() {
  // 一个人用的时候通常只有一个在办项目：直接给它的待办，别让用户再挑。
  // 想要全局视图就加 --all。
  const dir = resolveDir(false) || (F.all ? null : singleProjectDir());
  const root = projectsRoot();
  if (!dir) {
    // 全局视图：所有在办项目
    const all = [];
    if (fs.existsSync(root)) {
      for (const name of fs.readdirSync(root)) {
        const d = path.join(root, name);
        const k = detectKind(d);
        if (!k) continue;
        try {
          all.push({ dir: d, kind: k, state: load(d, k) });
        } catch {
          /* 跳过坏文件 */
        }
      }
    }
    if (!all.length) {
      say('还没有任何项目。开一个新的：');
      say(`  ${C.y('pmw init --kind req --id REQ --title "需求标题"')}`);
      say(`  ${C.y('pmw init --kind project --id PRJ-01 --title "系统重构"')}`);
      jsonOut.result = { empty: true, projects: [] };
      return;
    }
    say(`${C.b(`${all.length} 个在办`)}\n`);
    all.sort((a, b) => {
      const ba = (a.state.blockers || []).some((x) => !x.resolvedAt) ? 0 : 1;
      const bb = (b.state.blockers || []).some((x) => !x.resolvedAt) ? 0 : 1;
      return ba - bb;
    });
    for (const it of all) {
      const s = summarize(it.dir, it.state);
      const flag = s.blockers.length ? C.r('⛔') : s.canAdvance ? C.g('→') : C.y('…');
      say(`${flag} ${C.b(s.id)} ${s.title}`);
      say(`   ${C.dim('阶段')} ${s.stageName} ${C.dim(s.progress)}${s.canAdvance && s.next ? C.g(`  可推进`) : ''}`);
      const todo = [];
      if (s.blockers.length) todo.push(`${s.blockers.length} 个卡点`);
      if (s.openReviews.length) todo.push(`${s.openReviews.length} 条评审未闭环`);
      if (s.gateFailures.length) todo.push(s.gateFailures.map((f) => f.hint).join('；'));
      if (todo.length) say(`   ${C.y('待办')} ${todo.join(' / ')}`);
      say('');
    }
    if (JSON_MODE) {
      jsonOut.result = { empty: false, projects: all.map((it) => summarize(it.dir, it.state)) };
    }
    return;
  }

  const { state } = openState(dir);
  const s = summarize(dir, state);
  const st = stageOf(s.kind, s.stage);

  say(`${C.b(s.id)} ${s.title}  ${C.dim(s.progress)}\n`);
  say(`${C.y('现在该做：')}${st.do}\n`);
  say(`${C.dim('完成标准：')}${st.goal}\n`);

  const todo = [];
  s.blockers.forEach((b) => todo.push(C.r(`卡点：`) + b.text));
  s.openReviews.forEach((r) => todo.push(`${r.status === 'deferred' ? C.c('问业务') : '答开发'}：${r.text}`));
  s.gateFailures.forEach((f) => todo.push(f.hint + (f.actual ? C.dim(`（${f.actual}）`) : '')));

  if (todo.length) {
    say(`${C.b('待办')}`);
    todo.forEach((t, i) => say(`  ${i + 1}. ${t}`));
  } else {
    say(`${C.g('没有待办')}${s.next ? `，可以 ${C.y('pmw advance')}` : ''}`);
  }
  say(`\n${C.dim('流程图：')} pmw flow`);

  jsonOut.result = {
    ...s,
    dir,
    goal: st.goal,
    do: st.do,
    todos: todo.map((t) => String(t).replace(/\x1b\[[0-9;]*m/g, '')),
    // allProjects 给 Web UI 的左侧列表用：即使在看某一个项目，也要能切到别的项目。
    allProjects: listProjects(),
  };
  jsonOut.mermaid = toMermaid(state);
}

/** 扫一遍项目根，返回可序列化的项目摘要（坏目录直接跳过）。 */
function listProjects() {
  const root = projectsRoot();
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const name of fs.readdirSync(root)) {
    const d = path.join(root, name);
    const k = detectKind(d);
    if (!k) continue;
    try {
      const s = summarize(d, load(d, k));
      out.push({ id: s.id, title: s.title, dir: d, kind: s.kind, stage: s.stage, stageName: s.stageName, progress: s.progress });
    } catch {
      /* 跳过坏文件 */
    }
  }
  return out;
}

/* ===================== 命令：advance / goto / back ===================== */
function cmdAdvance() {
  const { dir, state } = openState();
  const s = summarize(dir, state);
  if (s.gateFailures.length) {
    fail(`${C.r('✗ 门禁未通过，不能推进：')}`);
    s.gateFailures.forEach((f) => sayErr(`  - ${f.hint}${f.actual ? `（${f.actual}）` : ''}`));
    sayErr(`\n${C.dim('确实要先过？补完再试，或 pmw goto <阶段> 强制跳转并留痕。')}`);
    jsonOut.result = { advanced: false, stage: s.stage, stageName: s.stageName, gateFailures: s.gateFailures };
    flushJson(1);
  }
  if (!s.next) {
    say('已是最后阶段。');
    jsonOut.result = { advanced: false, stage: s.stage, stageName: s.stageName, reason: 'already-last' };
    return;
  }
  // 反思没做完不放行：只在「已经开了一轮」的情况下拦，没开过的照旧推进
  if (state.reflect && !state.reflect.closedAt) {
    const left = (state.reflect.findings || []).filter((f) => f.status === 'open');
    if (left.length) {
      fail(
        `${C.r(`✗ 第 ${state.reflect.round} 轮反思还有 ${left.length} 条没处理，先收尾再推进：`)}\n${left.map((f) => `  #${f.id} ${f.text}`).join('\n')}\n${C.dim('pmw reflect fix <编号> / pmw reflect keep <编号> --reason "…" / pmw reflect close --force')}`,
      );
    }
  }
  const nx = stageOf(state.kind, s.next);
  const from = state.stage;
  state.stage = s.next;
  log(state, 'advance', `${from} → ${s.next}`);
  save(dir, state);
  say(`${C.g('✓')} 进入 ${C.b(`${nx.icon} ${nx.name}`)}\n${C.dim(nx.goal)}`);
  say(`\n${C.dim('下一步：')}${nx.do}`);
  jsonOut.result = {
    advanced: true,
    from,
    to: s.next,
    stageName: nx.name,
    goal: nx.goal,
    nextDo: nx.do,
  };
}

function cmdGoto() {
  const { dir, state } = openState();
  const target = need(argv._[1], '请给阶段 key，例如 pmw goto P3_MASTER_PRD');
  const list = stagesOf(state.kind);
  if (!list.some((s) => s.key === target)) {
    sayErr(`✗ 未知阶段 ${target}。可选：${list.map((s) => s.key).join(' / ')}`, 2);
  }
  const from = state.stage;
  state.stage = target;
  log(state, 'goto', `${from} → ${target}${F.note ? `：${F.note}` : ''}`);
  save(dir, state);
  say(`${C.y('已跳转')} ${from} → ${target}`);
}

function cmdBack() {
  const { dir, state } = openState();
  const target = need(argv._[1], '请给要退回的阶段，例如 pmw back S4_DEV_REVIEW');
  const list = stagesOf(state.kind);
  if (!list.some((s) => s.key === target)) {
    fail(`✗ 未知阶段 ${target}。可选：${list.map((s) => s.key).join(' / ')}`, 2);
  }
  const from = state.stage;
  state.stage = target;
  log(state, 'back', `${from} → ${target}${F.reason ? `：${F.reason}` : ''}`);
  save(dir, state);
  say(`${C.y('已退回')} ${from} → ${target}${F.reason ? C.dim(`（${F.reason}）`) : ''}`);
}

/**
 * pmw kind req|project —— 改走哪条主线（判错了不用重建）。
 * 阶段无法一一对应时退到新主线的第一个没做完的地方：project→req 落在 S1_INTAKE，
 * req→project 落在 P1_INTAKE；已有的评审台账、任务、卡点全部保留。
 */
function cmdKind() {
  const { dir, state } = openState();
  const target = need(argv._[1], '请给 kind：pmw kind req 或 pmw kind project');
  if (target !== 'req' && target !== 'project') {
    fail(`✗ kind 只能是 req 或 project，收到 ${target}`, 2);
  }
  if (state.kind === target) {
    say(C.dim(`已经是${target === 'project' ? '大' : '小'}需求了。`));
    jsonOut.result = { changed: false, kind: target };
    return;
  }
  const fromKind = state.kind;
  const fromStage = state.stage;
  const oldFile = path.join(dir, fromKind === 'project' ? 'project.json' : 'req.json');
  const newFile = path.join(dir, target === 'project' ? 'project.json' : 'req.json');
  // 旧主线留下、在新主线里不存在的标准任务（只删还没动过的 tpl 任务，手加的活一条不动）
  const validStages = new Set(stagesOf(target).map((s) => s.key));
  const dropped = [];
  state.tasks = (state.tasks || []).filter((t) => {
    const stale = t.from === 'tpl' && t.status === 'todo' && !validStages.has(t.stage);
    if (stale) dropped.push(t.id);
    return !stale;
  });
  state.kind = target;
  state.stage = stagesOf(target)[0].key;
  log(state, 'kind', `${fromKind}/${fromStage} → ${target}（阶段退回第一段，台账保留）`);
  save(dir, state);
  try {
    if (fs.existsSync(oldFile) && path.resolve(oldFile) !== path.resolve(newFile)) fs.rmSync(oldFile);
  } catch {
    /* 删不掉也不影响：detectKind 优先认新文件 */
  }
  say(`${C.y('已切换')} ${fromKind === 'project' ? '大需求' : '小需求'} → ${target === 'project' ? '大需求' : '小需求'}`);
  say(C.dim(`阶段回到「${stagesOf(target)[0].name}」。评审台账、任务、卡点都保留着。`));
  if (dropped.length) say(C.dim(`清掉了 ${dropped.length} 条旧主线的模板任务（没动过的）：${dropped.join('、')}`));
  jsonOut.result = {
    changed: true,
    kind: target,
    from: fromKind,
    stage: state.stage,
    tasks: state.tasks.length,
    reviews: state.reviews.length,
    droppedTasks: dropped,
  };
}

/* ===================== 命令：block / unblock ===================== */
function cmdBlock() {
  const { dir, state } = openState();
  const text = need(argv._[1], '请描述卡点：pmw block "开发说字段口径没定"');
  state.blockers = state.blockers || [];
  const id = state.blockers.length + 1;
  state.blockers.push({ id, text, scope: F.scope || '全局', at: new Date().toISOString(), resolvedAt: null });
  log(state, 'block', text);
  save(dir, state);
  say(`${C.r('⛔ 已记录卡点')} #${id} ${text}`);
}

function cmdUnblock() {
  const { dir, state } = openState();
  state.blockers = state.blockers || [];
  const open = state.blockers.filter((b) => !b.resolvedAt);
  if (!open.length) {
    say('没有未解除的卡点。');
    return;
  }
  if (F.all) {
    open.forEach((b) => {
      b.resolvedAt = new Date().toISOString();
    });
    log(state, 'unblock', 'all');
    save(dir, state);
    say(`${C.g('✓')} 已解除全部 ${open.length} 个卡点`);
    return;
  }
  const idx = Number(need(argv._[1], '请给卡点序号，或 --all'));
  const target = state.blockers.find((b) => b.id === idx && !b.resolvedAt);
  if (!target) {
    fail(`✗ 没有未解除的卡点 #${idx}`, 2);
  }
  target.resolvedAt = new Date().toISOString();
  log(state, 'unblock', `#${idx}`);
  save(dir, state);
  say(`${C.g('✓')} 已解除 #${idx} ${target.text}`);
}

/* ===================== 命令：task ===================== */
const TASK_STATUS_LABEL = { todo: '待办', doing: '进行中', done: '已完成', blocked: '卡住' };
const TASK_STATUS_ICON = { todo: '○', doing: '▶', done: '✓', blocked: '✗' };

function taskLine(t, showStage = false) {
  const icon = TASK_STATUS_ICON[t.status] || '○';
  const stageTag = showStage ? `${C.dim(`[${stageOf('project', t.stage).icon}]`)} ` : '';
  const who = t.who ? C.dim(` @${t.who}`) : '';
  const branch = t.branch ? C.c(` ⟂${t.branch}`) : '';
  const note = t.note ? C.dim(` — ${t.note}`) : '';
  return `${stageTag}${C.b(t.id)} ${icon} ${t.title}${who}${branch}${note}`;
}

function cmdTask() {
  const sub = argv._[1] || 'list';
  const { dir, state } = openState();
  state.tasks = state.tasks || [];

  /* ---- task list ---- */
  if (sub === 'list' || sub === 'ls') {
    const stageKey = F.stage || null;
    const who = F.who || null;
    const status = F.status || null;
    const showAll = Boolean(F.all) || (!stageKey && !who && !status);
    const list = showAll
      ? tasksOf(state, { who, status })
      : tasksOf(state, { stage: stageKey || state.stage, who, status });
    if (!list.length) {
      say(`${C.dim('没有匹配的任务')}`);
      jsonOut.result = { action: 'list', total: 0, tasks: [] };
      return;
    }
    const byStage = new Map();
    for (const t of list) {
      if (!byStage.has(t.stage)) byStage.set(t.stage, []);
      byStage.get(t.stage).push(t);
    }
    for (const [sk, items] of byStage) {
      const st = stageOf(state.kind, sk);
      const done = items.filter((t) => t.status === 'done').length;
      say(`\n${C.b(`${st.icon} ${st.name}`)} ${C.dim(`(${done}/${items.length})`)}`);
      for (const t of items) say(`  ${taskLine(t)}`);
    }
    say(`\n${C.dim(`共 ${list.length} 条`)}`);
    jsonOut.result = { action: 'list', total: list.length, tasks: list };
    return;
  }

  /* ---- task add "标题" --who 业务 --branch BG-01 --stage P2_DISCOVERY ---- */
  if (sub === 'add') {
    const title = need(argv._[2], '请给任务标题：pmw task add "确认金额能否为负" --who 业务');
    const branchKind = F.branchKind || (F.branch ? 'module' : null);
    if (branchKind && !BRANCH_KINDS.includes(branchKind)) {
      fail(`--branch-kind 只能是 ${BRANCH_KINDS.join(' / ')}`, 2);
    }
    const item = addTask(state, {
      stage: F.stage || state.stage,
      title,
      who: F.who || '我',
      branch: F.branch || null,
      branchKind,
      from: F.from || 'ai',
      note: F.note || '',
    });
    log(state, 'task:add', `${item.id} ${title}`);
    save(dir, state);
    say(`${C.g('✓')} 已加任务 ${C.b(item.id)} ${title}${item.who !== '我' ? C.dim(` @${item.who}`) : ''}`);
    jsonOut.result = { action: 'add', task: item };
    return;
  }

  /* ---- task done/reopen/doing/block ---- */
  if (['done', 'reopen', 'doing', 'block', 'todo'].includes(sub)) {
    const id = need(argv._[2], `请给任务编号：pmw task ${sub} T001`);
    const map = { done: 'done', reopen: 'todo', doing: 'doing', block: 'blocked', todo: 'todo' };
    const t = setTaskStatus(state, id, map[sub], F.note);
    log(state, `task:${sub}`, `${t.id} ${t.title}`);
    save(dir, state);
    const label = TASK_STATUS_LABEL[t.status];
    say(`${C.g('✓')} ${C.b(t.id)} ${t.title} → ${label}`);
    jsonOut.result = { action: sub, task: t };
    return;
  }

  /* ---- task who T001 业务 ---- */
  if (sub === 'who' || sub === 'assign') {
    const id = need(argv._[2], '请给任务编号：pmw task who T001 业务');
    const who = need(argv._[3], '请给负责人/角色：pmw task who T001 业务');
    const t = findTask(state, id);
    t.who = who;
    log(state, 'task:who', `${id} → ${who}`);
    save(dir, state);
    say(`${C.g('✓')} ${C.b(id)} 改为找 ${C.b(who)} 确认`);
    jsonOut.result = { action: 'who', task: t };
    return;
  }

  /* ---- task branch T001 BG-01 [--branch-kind scenario] ---- */
  if (sub === 'branch') {
    const id = need(argv._[2], '请给任务编号：pmw task branch T001 BG-01');
    const branch = need(argv._[3], '请给分支名：pmw task branch T001 BG-01');
    const t = findTask(state, id);
    t.branch = branch;
    t.branchKind = F.branchKind || 'module';
    log(state, 'task:branch', `${id} → ${branch}`);
    save(dir, state);
    say(`${C.g('✓')} ${C.b(id)} 挂到分支 ${C.b(branch)}`);
    jsonOut.result = { action: 'branch', task: t };
    return;
  }

  /* ---- task branches：看所有支线 ---- */
  if (sub === 'branches') {
    const map = taskBranches(state);
    if (!map.size) {
      say(`${C.dim('还没有任何任务')}`);
      jsonOut.result = { action: 'branches', branches: [] };
      return;
    }
    const out = [];
    for (const [name, items] of map) {
      const done = items.filter((t) => t.status === 'done').length;
      const label = name || '（未分分支）';
      say(`\n${C.b(label)} ${C.dim(`(${done}/${items.length})`)}`);
      for (const t of items) say(`  ${taskLine(t, true)}`);
      out.push({ branch: name || null, total: items.length, done, tasks: items });
    }
    jsonOut.result = { action: 'branches', branches: out };
    return;
  }

  /* ---- task who-list：按人汇总待确认 ---- */
  if (sub === 'wholist' || sub === 'pending') {
    const map = pendingByWho(state);
    if (!map.size) {
      say(`${C.g('没有需要找别人确认的事项')}`);
      jsonOut.result = { action: 'pending', groups: [] };
      return;
    }
    const groups = [];
    for (const [who, items] of map) {
      say(`\n${C.y(`找 ${who} 确认`)} ${C.dim(`(${items.length})`)}`);
      for (const it of items) say(`  · ${it.text}${it.ref ? C.dim(` (${it.ref})`) : ''}`);
      groups.push({ who, items });
    }
    jsonOut.result = { action: 'pending', groups };
    return;
  }

  /* ---- task seed：给老项目补标准任务 ---- */
  if (sub === 'seed') {
    const added = seedTasks(state, F.stage || null);
    log(state, 'task:seed', `补 ${added.length} 条`);
    save(dir, state);
    say(`${C.g('✓')} 补了 ${added.length} 条标准任务`);
    jsonOut.result = { action: 'seed', added: added.length, tasks: added };
    return;
  }

  fail(`未知子命令 task ${sub}（可用：list / add / done / reopen / doing / block / who / branch / branches / pending / seed）`, 2);
}

/* ===================== 命令：review ===================== */
function cmdReview() {
  const sub = argv._[1] || 'list';
  const { dir, state } = openState();
  state.reviews = state.reviews || [];

  if (sub === 'add') {
    const text = need(argv._[2], '请描述问题：pmw review add "导入模板的金额列能填负数吗"');
    const id = state.reviews.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
    state.reviews.push({
      id,
      text,
      owner: F.who || '开发',
      scope: F.scope || '全局',
      status: 'open',
      source: F.source || 'dev-review',
      at: new Date().toISOString(),
      answer: null,
    });
    log(state, 'review:add', `#${id} ${text}`);
    save(dir, state);
    say(`${C.g('✓')} 已记录评审问题 #${id}：${text}`);
    jsonOut.result = { action: 'add', id, text, owner: F.who || '开发', open: countOpen(state) };
    return;
  }

  if (sub === 'list') {
    const open = state.reviews.filter((r) => r.status !== 'closed');
    if (!open.length) {
      say(`${C.g('评审问题全部闭环')}（共 ${state.reviews.length} 条）`);
      jsonOut.result = { action: 'list', total: state.reviews.length, open: 0, reviews: [] };
      return;
    }
    for (const r of open) {
      const tag = r.status === 'deferred' ? C.c('待业务确认') : C.y('待回答');
      say(`#${r.id} [${tag}] ${r.text}`);
      say(`   ${C.dim(`提问方 ${r.owner}${r.scope ? ` / ${r.scope}` : ''}${r.at ? ` / ${r.at.slice(0, 10)}` : ''}`)}`);
      if (r.answer) say(`   ${C.dim('已答：')}${r.answer}`);
    }
    say(`\n${C.dim(`共 ${open.length} 条未闭环`)}`);
    jsonOut.result = { action: 'list', total: state.reviews.length, open: open.length, reviews: open };
    return;
  }

  const idx = Number(argv._[2]);
  const target = state.reviews.find((r) => r.id === idx);
  if (!target) {
    fail(`✗ 没有评审问题 #${argv._[2]}`, 2);
  }

  if (sub === 'answer') {
    target.answer = need(argv._[3], '请写答案：pmw review answer 1 "不能，负数走追加预算"');
    target.status = 'answered';
    target.answeredAt = new Date().toISOString();
    log(state, 'review:answer', `#${idx}`);
    save(dir, state);
    say(`${C.g('✓')} #${idx} 已回答。确认开发认可后 pmw review close ${idx}`);
    jsonOut.result = { action: 'answer', id: idx, answer: target.answer, status: target.status, open: countOpen(state) };
    return;
  }
  if (sub === 'defer') {
    target.status = 'deferred';
    target.deferredTo = F.to || '业务';
    // 从什么时候开始「在别人手上」——brief 靠它算等了几天
    target.deferredAt = new Date().toISOString();
    log(state, 'review:defer', `#${idx} → ${target.deferredTo}`);
    save(dir, state);
    say(`${C.c('→')} #${idx} 已转「${target.deferredTo}」确认`);
    jsonOut.result = { action: 'defer', id: idx, deferredTo: target.deferredTo, open: countOpen(state) };
    return;
  }
  if (sub === 'close') {
    target.status = 'closed';
    target.closedAt = new Date().toISOString();
    if (argv._[3]) target.answer = argv._[3];
    log(state, 'review:close', `#${idx}`);
    save(dir, state);
    say(`${C.g('✓')} #${idx} 已闭环`);
    jsonOut.result = { action: 'close', id: idx, open: countOpen(state) };
    return;
  }
  fail('用法：pmw review add|list|answer|defer|close', 2);
}

/* ===================== 命令：add-module / add-sub / split ===================== */
function cmdAddModule() {
  const { dir, state } = openState();
  if (state.kind !== 'project') {
    fail('✗ 只有大需求项目才有模块。', 2);
  }
  const id = need(F.id, '请给模块编号：--id MOD-01');
  const title = need(F.title, '请给模块名：--title "预算台账"');
  state.modules = state.modules || [];
  if (state.modules.some((m) => m.id === id)) {
    fail(`✗ 模块 ${id} 已存在`, 2);
  }
  const mod = { id, title, path: `modules/${id}` };
  state.modules.push(mod);
  state.subs = state.subs || [];

  fs.mkdirSync(path.join(dir, mod.path, 'subs'), { recursive: true });
  writeIfAbsent(path.join(dir, mod.path, 'module-prd.md'), tplModulePrd(state, mod));
  log(state, 'add-module', `${id} ${title}`);
  save(dir, state);
  syncDocs(dir, state);

  say(`${C.g('✓')} 已加模块 ${C.b(id)} ${title}`);
  say(`  ${C.dim(mod.path + '/module-prd.md')}`);
  jsonOut.result = { id, title, path: mod.path };
}

function cmdAddSub() {
  const { dir, state } = openState();
  if (state.kind !== 'project') {
    fail('✗ 小需求没有子需求；直接写 prd.md 就行。', 2);
  }
  const id = need(F.id, '请给子需求编号：--id BG-01');
  const title = need(F.title, '请给标题：--title "预算导入"');
  const moduleId = F.module || null;
  state.modules = state.modules || [];
  state.subs = state.subs || [];

  if (state.subs.some((s) => s.id === id)) {
    fail(`✗ 子需求 ${id} 已存在`, 2);
  }
  const mod = moduleId ? state.modules.find((m) => m.id === moduleId) : null;
  if (moduleId && !mod) {
    fail(`✗ 模块 ${moduleId} 不存在，先 pmw add-module --id ${moduleId} --title "..."`, 2);
  }

  const relPath = mod ? `modules/${mod.id}/subs/${id}` : `modules/_unassigned/subs/${id}`;
  const sub = {
    id,
    title,
    module: moduleId,
    path: relPath,
    deps: F.deps ? String(F.deps).split(',').map((s) => s.trim()).filter(Boolean) : [],
    batch: F.batch || null,
    phase: F.phase || null,
    yxt: { no: null },
    createdAt: new Date().toISOString(),
  };
  state.subs.push(sub);

  fs.mkdirSync(path.join(dir, relPath), { recursive: true });
  writeIfAbsent(path.join(dir, relPath, 'prd.md'), tplSubPrd(state, sub));
  log(state, 'add-sub', `${id} ${title}`);
  save(dir, state);
  syncDocs(dir, state);

  say(`${C.g('✓')} 已加子需求 ${C.b(id)} ${title}${moduleId ? C.dim(` [${moduleId}]`) : C.dim(' [未归类]')}`);
  say(`  ${C.dim(relPath + '/prd.md')}`);
  jsonOut.result = { id, title, module: moduleId, path: relPath, deps: sub.deps, batch: sub.batch };
}

/** 从总 PRD 第 4 节模块表批量建模块 */
function cmdSplit() {
  const { dir, state } = openState();
  if (state.kind !== 'project') {
    fail('✗ 只有大需求才需要拆模块。', 2);
  }
  const master = readMaybe(path.join(dir, 'master/master-prd.md'));
  if (!master) {
    fail('✗ 总 PRD 还没写（master/master-prd.md）', 2);
  }
  // 抓总 PRD 里所有 "| MOD-xx | 名称 | 职责 | 依赖 |" 形状的行
  // 注意：表头 "| 模块编号 | 模块名 | ..." 和分隔行 "| --- | --- |" 必须排除
  const found = [];
  for (const line of master.split('\n')) {
    const m = line.match(/^\s*\|\s*(MOD-[0-9A-Za-z-]+)\s*\|\s*([^|]*?)\s*\|/);
    if (!m) continue;
    const id = m[1].trim();
    const title = m[2].trim();
    if (!title || /^[-:\s]+$/.test(title)) continue;
    if (/^MOD-xx$/i.test(id)) continue;
    if (!found.some((f) => f.id === id)) found.push({ id, title });
  }
  if (!found.length) {
    fail('✗ 总 PRD 第 4 节里没找到 MOD-xx 行。表格格式应为：');
    sayErr('  | MOD-01 | 预算台账 | 一句话职责 | 依赖 |', 1);
  }
  state.modules = state.modules || [];
  let added = 0;
  for (const f of found) {
    if (state.modules.some((m) => m.id === f.id)) continue;
    state.modules.push({ id: f.id, title: f.title, path: `modules/${f.id}` });
    fs.mkdirSync(path.join(dir, 'modules', f.id, 'subs'), { recursive: true });
    const mod = state.modules[state.modules.length - 1];
    writeIfAbsent(path.join(dir, 'modules', f.id, 'module-prd.md'), tplModulePrd(state, mod));
    added += 1;
  }
  log(state, 'split', `${added} 个模块`);
  save(dir, state);
  syncDocs(dir, state);
  say(`${C.g('✓')} 从总 PRD 识别到 ${found.length} 个模块，新建 ${added} 个`);
  found.forEach((f) => say(`  ${C.dim('·')} ${f.id} ${f.title}`));
  say(`\n下一步：给每个模块加子需求 ${C.y('pmw add-sub --id BG-01 --module MOD-01 --title "..."')}`);
  jsonOut.result = { found: found.length, added, modules: found };
}

/* ===================== 命令：check ===================== */
/**
 * 扫所有 md 里的图片引用，看文件在不在。
 * 找不到算 problem（发布出去就是缺图），webp 算 warn（格式 Word 不支持）。
 */
function checkImageRefs(dir, state, problems, warns) {
  const mdFiles = [];
  const push = (p) => { if (fs.existsSync(p)) mdFiles.push(p); };
  if (state.kind === 'project') {
    push(path.join(dir, 'master/master-prd.md'));
    push(path.join(dir, 'prd.md'));        // 有人把总 PRD 直接写在根上，也一起体检
    push(path.join(dir, 'discover.md'));
    push(path.join(dir, 'align.md'));
    for (const m of state.modules || []) push(path.join(dir, m.path, 'module-prd.md'));
    for (const s of state.subs || []) push(path.join(dir, s.path, 'prd.md'));
  } else {
    push(path.join(dir, 'prd.md'));
    push(path.join(dir, 'align.md'));
  }

  const seen = new Set();
  for (const f of mdFiles) {
    let txt = '';
    try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const re = /!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/g;
    let m;
    while ((m = re.exec(txt))) {
      const alt = (m[1] || '').trim();
      const src = m[2];
      const key = `${src}@${path.dirname(f)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (/^[a-z]+:\/\//i.test(src)) {
        warns.push(`${rel(dir, f)} 引用了外链图片 ${src}：Word 不会内嵌，需要先下载到本地`);
        continue;
      }
      if (/\.webp(\?|$)/i.test(src)) {
        warns.push(`${rel(dir, f)} 用了 webp 图片 ${src}：Word 不支持，请转成 png/jpg`);
        continue;
      }
      const found = resolveImagePath(src, { baseDir: path.dirname(f), extraDirs: [dir] });
      if (!found.file) {
        problems.push(`${rel(dir, f)} 里的图片找不到：${alt || '(无说明)'} → ${src}`);
      }
    }
  }
}

/**
 * 小需求 PRD 的「反冗长」体检。
 * 真实反馈：一个字段改动被写成六节、四千多字、还带目录页，开发根本不看。
 * 只提醒不拦截——紧不紧由人判断，但把标准摆出来，避免模板自己带着人往长里写。
 */
function checkSmallPrdBloat(text, warns) {
  const chars = text.replace(/\s/g, '').length;
  if (chars > 2500) {
    warns.push(`小需求 PRD 偏长（${chars} 字，一页以内约 2500 字）：先删「不做」清单、「刷新与时效」「术语表」这类凑字数的节，再删用不上的空小节`);
  }
  const banned = [
    [/^#{1,4}\s*目录\s*$/m, '手写了「目录」：Word 会自动生成，md 里写目录反而会变成两套'],
    [/^#{1,6}[^\n]*不做/m, '单独开了「不做」：小需求不写这个。真有误解风险，就在对应规则行里加一句「不统计 X」'],
    [/^\s*\*\*不做[：:]?\*\*\s*$/m, '写了「不做」清单：小需求不写这个。真有误解风险，就在对应规则行里加一句「不统计 X」'],
    [/^#{1,6}[^\n]*刷新与时效/m, '单独开了「刷新与时效」：除非需求本身改的就是刷新频率，这句话并进规则表就够了'],
    [/^#{1,6}[^\n]*权限与异常\s*$/m, '单独开了「权限与异常」：权限没动就别写；动了就一句话说清改哪条'],
  ];
  for (const [re, msg] of banned) {
    if (re.test(text)) warns.push(msg);
  }
}

function cmdCheck() {
  const { dir, state } = openState();
  const problems = [];
  const warns = [];

  if (state.kind === 'project') {
    const master = readMaybe(path.join(dir, 'master/master-prd.md'));
    const modIds = (state.modules || []).map((m) => m.id);

    for (const m of state.modules || []) {
      if (!master.includes(m.id)) problems.push(`总 PRD 里没有出现模块 ${m.id}（${m.title}）`);
      const mp = path.join(dir, m.path, 'module-prd.md');
      if (!fs.existsSync(mp)) problems.push(`${m.id} 缺少 module-prd.md`);
      else {
        const t = readMaybe(mp);
        for (const s of state.subs.filter((x) => x.module === m.id)) {
          if (!t.includes(s.id)) warns.push(`${m.id}/module-prd.md 没提到子需求 ${s.id}`);
        }
      }
    }

    for (const s of state.subs || []) {
      if (s.module && !modIds.includes(s.module)) problems.push(`子需求 ${s.id} 指向不存在的模块 ${s.module}`);
      const p = path.join(dir, s.path, 'prd.md');
      if (!fs.existsSync(p)) {
        problems.push(`子需求 ${s.id} 缺少 prd.md`);
        continue;
      }
      const t = readMaybe(p);
      if (!/-AC\d+/.test(t)) problems.push(`${s.id}/prd.md 没有验收标准（形如 ${s.id}-AC01）`);
      if (/\[待确认\]|\[待填\]/.test(t) && state.stage === 'P7_PUBLISH') {
        warns.push(`${s.id}/prd.md 还有 [待确认]/[待填]，发布前建议清掉`);
      }
      for (const d of s.deps || []) {
        if (!(state.subs || []).some((x) => x.id === d)) problems.push(`${s.id} 的前置 ${d} 不存在`);
      }
      if (s.deps && s.deps.includes(s.id)) problems.push(`${s.id} 的前置写成了自己`);
    }

    // 环检测
    const edges = new Map();
    for (const s of state.subs || []) edges.set(s.id, s.deps || []);
    const color = new Map();
    const dfs = (n, stack) => {
      color.set(n, 1);
      for (const nx of edges.get(n) || []) {
        if (!edges.has(nx)) continue;
        if (color.get(nx) === 1) {
          problems.push(`依赖成环：${[...stack, n, nx].join(' → ')}`);
        } else if (!color.get(nx)) dfs(nx, [...stack, n]);
      }
      color.set(n, 2);
    };
    for (const s of state.subs || []) if (!color.get(s.id)) dfs(s.id, []);

    const demoHtml = fs.existsSync(path.join(dir, 'demo'))
      ? fs.readdirSync(path.join(dir, 'demo')).filter((f) => f.endsWith('.html'))
      : [];
    if (state.stage !== 'P1_INTAKE' && state.stage !== 'P2_DISCOVERY' && !demoHtml.length) {
      warns.push('demo/ 里还没有 HTML 原型');
    }
  } else {
    const t = readMaybe(path.join(dir, 'prd.md'));
    if (!t) problems.push('缺少 prd.md');
    else {
      if (!/-AC\d+/.test(t)) problems.push('prd.md 没有验收标准（形如 REQ-AC01）');
      if (!/\|\s*实现方式\s*\|/.test(t)) warns.push('prd.md 属性表缺「实现方式」，研效通创建时会默认 AI-Coding');
      if (/\|\s*AI-Coding生成模式\s*\|/.test(t) && /\|\s*AI-Coding生成模式\s*\|\s*\[待确认\]/.test(t)) {
        warns.push('「AI-Coding生成模式」还是 [待确认]：研效通会拒绝创建（GENERATE_MODE_BLOCKED）。写「传统开发」可豁免');
      }
      if (!/\|\s*故事点\s*\|/.test(t)) warns.push('prd.md 属性表缺「故事点」');
      checkSmallPrdBloat(t, warns);
    }
  }

  // 图片引用体检：md 里写了 ![..](路径) 但文件不在，出 Word 时会是红字占位
  checkImageRefs(dir, state, problems, warns);

  // 一致性体检：字段叫法、验收覆盖、demo 与 PRD 覆盖（只报，不拦门禁）
  const linted = runLint(dir, state);
  linted.problems.forEach((p) => problems.push(p));
  linted.warns.forEach((w) => warns.push(w));

  const gate = gateCheck(dir, state);
  if (problems.length === 0 && gate.length === 0) {
    say(`${C.g('✓ 检查通过')}`);
  }
  if (problems.length) {
    say(`${C.r(`✗ ${problems.length} 个问题：`)}`);
    problems.forEach((p) => say(`  - ${p}`));
  }
  if (warns.length) {
    say(`\n${C.y(`⚠ ${warns.length} 个提醒：`)}`);
    warns.forEach((w) => say(`  - ${w}`));
  }
  if (gate.length) {
    say(`\n${C.y('当前阶段门禁：')}`);
    gate.forEach((g) => say(`  ✗ ${g.hint}${g.actual ? `（${g.actual}）` : ''}`));
  }
  jsonOut.result = {
    problems,
    warns,
    gateFailures: gate,
    ok: problems.length === 0 && gate.length === 0,
  };
  if (problems.length) flushJson(1);
}

/* ===================== 命令：sync-docs（生成索引与清单） ===================== */
function syncDocs(dir, state) {
  if (state.kind !== 'project') return;
  const lines = [];
  lines.push(`# ${state.title}：父子需求索引`);
  lines.push('');
  lines.push(`> 父需求 **${state.id}**${state.yxt && state.yxt.parentNo ? `（研效通 ${state.yxt.parentNo}）` : ''}`);
  lines.push('> 本文件由 `pmw sync-docs` 生成，手改会被覆盖。');
  lines.push('');
  lines.push('## 模块');
  lines.push('');
  lines.push('| 模块 | 子需求 | 模块 PRD |');
  lines.push('| --- | --- | --- |');
  for (const m of state.modules || []) {
    const subs = (state.subs || []).filter((s) => s.module === m.id);
    lines.push(
      `| ${m.id} ${m.title} | ${subs.map((s) => s.id).join('、') || '—'} | [module-prd.md](${m.id}/module-prd.md) |`,
    );
  }
  lines.push('');
  lines.push('## 可独立录入的子需求');
  lines.push('');
  lines.push('| 编号 | 标题 | 模块 | 批次 | 前置 | 研效通 | PRD |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of state.subs || []) {
    const relp = path.relative(path.join(dir, 'modules'), path.join(dir, s.path, 'prd.md')).split(path.sep).join('/');
    lines.push(
      `| ${s.id} | ${s.title} | ${s.module || '—'} | ${s.batch || '—'} | ${(s.deps || []).join('、') || '—'} | ${
        s.yxt && s.yxt.no ? s.yxt.no : '未发布'
      } | [prd.md](${relp}) |`,
    );
  }
  lines.push('');
  fs.mkdirSync(path.join(dir, 'modules'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'modules/index.md'), `${lines.join('\n')}\n`, 'utf8');
}

function cmdSyncDocs() {
  const { dir, state } = openState();
  syncDocs(dir, state);
  say(`${C.g('✓')} 已刷新 modules/index.md`);
}

/* ===================== 命令：digest（Word/文本 → Markdown） ===================== */
/** 递归扫目录时跳过的子目录（产出目录 + 隐藏/临时目录） */
const DIGEST_SKIP = new Set(['project.json', 'req.json', DIR_OUTPUT, 'dist', 'modules', 'master', DIR_SOURCE, 'materials', '.git']);

async function cmdDigest() {
  const { dir, state } = openState();
  const files = argv._.slice(1);
  const outDir = path.join(dir, DIR_SOURCE);
  fs.mkdirSync(outDir, { recursive: true });
  const todo = [];
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      const name = path.basename(p);
      if (name.startsWith('.') || DIGEST_SKIP.has(name)) return;
      for (const f of fs.readdirSync(p)) walk(path.join(p, f));
    } else if (/\.(docx|doc|xlsx|xlsm|pdf)$/i.test(p)) {
      todo.push(p);
    }
  };
  // 没给参数 = 扫整个工作区（你的用法：材料随便放，都在这个目录里）
  (files.length ? files : [dir]).forEach(walk);
  if (!todo.length) {
    say('这个工作区里没找到可读的材料（.docx / .xlsx / .pdf）。');
    say(C.dim('也可以直接给路径：pmw digest <某个目录> 或 pmw digest <某个文件.docx>'));
    jsonOut.result = { converted: [], failed: [], scanned: files.length ? files : [dir] };
    return;
  }
  const converted = [];
  const failed = [];
  for (const f of todo) {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f, ext);
    const out = path.join(outDir, `${base}.md`);
    try {
      let md;
      if (ext === '.xlsx' || ext === '.xlsm') {
        const r = xlsxToMarkdown(f, { maxRows: Number(F['max-rows'] || 300) });
        md = `${r.markdown}\n`;
      } else if (ext === '.pdf') {
        const r = await pdfToMarkdown(f);
        md = `${r.markdown}\n`;
      } else {
        md = docxToMarkdown(f);
      }
      const head = `<!-- 来源：${f} ｜ 转换时间 ${stamp()} -->\n\n`;
      fs.writeFileSync(out, head + md, 'utf8');
      const words = md.length;
      say(`${C.g('✓')} ${path.basename(f)} → ${C.c(rel(dir, out))} ${C.dim(`(${words} 字)`)}`);
      converted.push({ source: f, out: rel(dir, out), chars: words });
    } catch (e) {
      const msg = ext === '.pdf' && e.code === 'NO_PDFTOTEXT' ? e.message : e.message;
      say(`${C.r('✗')} ${path.basename(f)}：${msg}`);
      failed.push({ source: f, error: msg });
    }
  }
  say(`\n${C.dim(`材料已在 ${DIR_SOURCE}/ 下，可直接读或让我读。`)}`);
  jsonOut.result = { converted, failed };

  // --extract：把纪要里能变成任务/待确认的东西抽出来
  if (F.extract && converted.length) {
    const extracted = extractFromMaterials(dir, state, converted, F.stage);
    jsonOut.result.extracted = extracted;
  }
}

/**
 * 从会议纪要里抽取「待办任务」和「待确认项」。
 * 只做确定性抽取（规则明确、可核对），不做语义猜测——猜不准的交给 AI 再补。
 * 规则：
 *   - 「待确认 / 需确认 / 待定 / 待明确 / 需要确认」→ 待确认项（who 取冒号前或「谁」
 *   - 「负责人 / @某某 / XX 负责 / 由 XX 完成」→ 任务，who = 那个人
 *   - 「决定 / 结论 / 已确认」→ 不算任务，只做记录
 */
function extractFromMaterials(dir, state, converted, stageArg) {
  const stageKey = stageArg || state.stage;
  const CONFIRM_WORDS = ['待确认', '需确认', '需要确认', '待定', '待明确', '待业务确认', '待核实', '待补充'];
  const TASK_WORDS = ['负责', '跟进', '安排', '提供', '整理', '输出', '评审', '上线', '通知'];
  const DONE_WORDS = ['已确认', '已决定', '已定', '已上线', '已完成', '结论：', '决议：'];
  const tasks = [];
  const confirms = [];
  const seen = new Set();

  for (const c of converted) {
    const abs = path.join(dir, c.out);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);

    for (const raw of lines) {
      if (/^#{1,6}\s/.test(raw)) continue; // 标题不是任务
      if (/^<!--/.test(raw) || /^\s*>/.test(raw)) continue; // 转换器注释、引用
      let line = raw.replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+[.)]\s+/, '');
      const cells = line.split('|').map((x) => x.trim()).filter(Boolean);
      if (cells.length) line = cells.join(' ／ ');
      line = line.trim();
      if (!line || line.length < 4 || line.length > 200) continue;
      if (seen.has(line)) continue;

      // 已有结论的行不算任务
      if (DONE_WORDS.some((w) => line.startsWith(w) || line.includes(w))) {
        const m = /^([^：:]{1,12})[：:]\s*(.+)$/.exec(line);
        if (m && CONFIRM_WORDS.some((w) => m[2].includes(w))) {
          /* 继续走待确认 */
        } else {
          continue;
        }
      }

      const isConfirm = CONFIRM_WORDS.some((w) => line.includes(w));
      if (isConfirm) {
        // 「待确认：审批几级」→ 事项 = 冒号后；「张三：审批几级待确认」→ who = 冒号前
        const m = /^([^：:]{1,12})[：:]\s*(.+)$/.exec(line);
        let who = '业务';
        let text2 = line;
        if (m) {
          const left = m[1].trim();
          if (CONFIRM_WORDS.some((w) => left.includes(w))) {
            text2 = m[2].trim();
          } else {
            who = left;
            text2 = m[2].trim();
          }
        }
        text2 = text2
          .replace(new RegExp(`[（(]?(${CONFIRM_WORDS.join('|')})[）)]?`, 'g'), '')
          .replace(/[，,、；;]\s*$/, '')
          .trim();
        if (text2.length >= 4) {
          seen.add(line);
          confirms.push({ text: text2, who, from: c.out });
        }
        continue;
      }

      const whoMatch =
        /(?:由|让|请)\s*([^\s，,、；;：:]{2,6})\s*(?:负责|跟进|处理|提供|整理)/.exec(line) ||
        /^([^\s，,、；;：:]{2,6})\s*(?:负责|跟进|处理|提供|整理)/.exec(line) ||
        /@([^\s，,、；;：:]{2,10})/.exec(line);
      const isTask = TASK_WORDS.some((w) => line.includes(w));
      if (isTask) {
        seen.add(line);
        let who = whoMatch ? whoMatch[1] : '我';
        // 「张三负责」→ 去掉尾部的动词
        who = who.replace(/(负责|跟进|处理|提供|整理)$/, '');
        tasks.push({
          title: line.slice(0, 80),
          who: who || '我',
          from: c.out,
        });
      }
    }
  }

  const addedTasks = [];
  for (const t of tasks.slice(0, 20)) {
    const dup = (state.tasks || []).some((x) => x.title === t.title && x.stage === stageKey);
    if (dup) continue;
    addedTasks.push(addTask(state, { stage: stageKey, title: t.title, who: t.who, from: `纪要：${path.basename(t.from)}` }));
  }
  const addedReviews = [];
  for (const c of confirms.slice(0, 20)) {
    const dup = (state.reviews || []).some((r) => r.question === c.text);
    if (dup) continue;
    const id = (state.reviews || []).reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
    state.reviews = state.reviews || [];
    const item = {
      id,
      text: c.text,
      question: c.text,
      owner: '我',
      to: c.who,
      scope: '全局',
      status: 'deferred',
      source: `纪要：${path.basename(c.from)}`,
      at: new Date().toISOString(),
      answer: null,
    };
    state.reviews.push(item);
    addedReviews.push(item);
  }

  if (addedTasks.length || addedReviews.length) {
    log(state, 'digest:extract', `任务 ${addedTasks.length} / 待确认 ${addedReviews.length}`);
    save(dir, state);
  }

  say(`\n${C.b('从纪要里抽出来：')}`);
  if (addedTasks.length) {
    say(`  ${C.g('任务')} ${addedTasks.length} 条`);
    addedTasks.forEach((t) => say(`    ${C.b(t.id)} ${t.title}${t.who !== '我' ? C.dim(` @${t.who}`) : ''}`));
  }
  if (addedReviews.length) {
    say(`  ${C.y('待确认')} ${addedReviews.length} 条（已挂到「问谁确认」）`);
    addedReviews.forEach((r) => say(`    #${r.id} ${r.text}${C.dim(` @${r.to}`)}`));
  }
  if (!addedTasks.length && !addedReviews.length) say(`  ${C.dim('没抽到明确的待办/待确认，可以让我读材料后再补')}`);

  return {
    tasks: addedTasks.map((t) => ({ id: t.id, title: t.title, who: t.who })),
    confirms: addedReviews.map((r) => ({ id: r.id, text: r.text, who: r.to })),
  };
}

/* ===================== 命令：doc（Markdown → Word） ===================== */
async function cmdDoc() {
  const { dir, state } = openState();
  const src = need(argv._[1] || F.src, '请给 Markdown 路径');
  const srcAbs = path.isAbsolute(src) ? src : path.join(process.cwd(), src);
  if (!fs.existsSync(srcAbs)) {
    sayErr(`✗ 找不到 ${srcAbs}`, 2);
  }
  const outFlag = F.out || argv._[2];
  const outAbs = outFlag
    ? path.isAbsolute(outFlag)
      ? outFlag
      : path.join(process.cwd(), outFlag)
    : path.join(dir, DIR_OUTPUT, path.basename(srcAbs, path.extname(srcAbs)) + '.docx');
  // 目录：小需求一律不出；大需求默认出，可用 --no-toc 关掉
  const toc = F['no-toc'] ? false : state.kind !== 'req';
  await md2docx(fs.readFileSync(srcAbs, 'utf8'), outAbs, F.title, {
    baseDir: path.dirname(srcAbs),
    extraDirs: [dir],
    toc,
  }).then((r) => {
    reportMissingImages(r.missingImages, outAbs);
  });
  const kb = (fs.statSync(outAbs).size / 1024).toFixed(1);
  say(`${C.g('✓')} ${C.c(outAbs)} ${C.dim(`(${kb} KB)${toc ? '' : ' 无目录'}`)}`);

  // --pdf：顺手出一份 PDF（给主管看 / 外发用，Word 字体在别人机器上会跑版）
  if (F.pdf) {
    const pdfAbs = outAbs.replace(/\.docx?$/i, '') + '.pdf';
    const md = fs.readFileSync(srcAbs, 'utf8');
    const title = F.title || path.basename(srcAbs, path.extname(srcAbs));
    try {
      const r = await markdownToPdf(md, pdfAbs, { title });
      const pkb = (r.bytes / 1024).toFixed(0);
      say(`${C.g('✓')} ${C.c(pdfAbs)} ${C.dim(`(${pkb} KB)`)}`);
      jsonOut.result = { ...(jsonOut.result || {}), pdf: pdfAbs, pdfBytes: r.bytes };
    } catch (e) {
      sayWarn(`! PDF 没出来：${e.message}`);
    }
  }
}

/** 图片找不到时把话说明白：给了哪些候选路径、怎么改。 */
function reportMissingImages(missing, outAbs) {
  if (!missing || !missing.length) return;
  for (const m of missing) {
    sayWarn(`! 图片没用上：${m.alt || '(无说明)'} → ${m.src}${m.reason ? `（${m.reason}）` : ''}`);
    if (m.tried && m.tried.length) sayWarn(`  试过这些位置：${m.tried.join('  |  ')}`);
  }
  sayWarn(`  Word 里这一处会显示成红色「[图片缺失]」，不影响其他内容。改好 md 里的路径后重新出一次即可。`);
}

/* ===================== 命令：publish（Word 打包 + 研效通清单） ===================== */
async function cmdPublish() {
  const { dir, state } = openState();
  const dist = path.join(dir, DIR_OUTPUT);
  fs.mkdirSync(dist, { recursive: true });
  const made = [];

  const allMissing = [];
  const jobs = [];
  if (state.kind === 'project') {
    const master = path.join(dir, 'master/master-prd.md');
    if (fs.existsSync(master)) {
      jobs.push({ src: master, out: path.join(dist, `${state.id}-总PRD.docx`), title: `${state.title} 方案总体说明` });
    }
    for (const s of state.subs || []) {
      const p = path.join(dir, s.path, 'prd.md');
      if (!fs.existsSync(p)) continue;
      jobs.push({ src: p, out: path.join(dist, `${s.id}-${s.title}.docx`), title: `${s.id} ${s.title}` });
    }
  } else {
    const p = path.join(dir, 'prd.md');
    if (fs.existsSync(p)) {
      jobs.push({ src: p, out: path.join(dist, `${state.id}-${state.title}.docx`), title: `${state.id} ${state.title}` });
    }
  }
  for (const j of jobs) {
    // extraDirs 带上工作区根：图片写在 shots/ 或 images/ 下都能找到
    // 小需求不出目录：一页纸的 PRD 挂个目录页，翻起来比不翻还累
    const r = await md2docx(readMaybe(j.src), j.out, j.title, { baseDir: path.dirname(j.src), extraDirs: [dir], toc: state.kind !== 'req' });
    made.push(path.basename(j.out));
    for (const m of r.missingImages || []) allMissing.push({ ...m, doc: path.basename(j.out) });
  }

  // 研效通发布清单（给 create-from-doc 逐条执行 & 回填）
  const todo = state.kind === 'project'
    ? (state.subs || []).filter((s) => !(s.yxt && s.yxt.no))
    : [{ id: state.id, title: state.title, path: '.', yxt: state.yxt }];
  const plan = {
    generatedAt: new Date().toISOString(),
    kind: state.kind,
    parent: state.id,
    parentYxtNo: state.yxt && state.yxt.parentNo ? state.yxt.parentNo : null,
    items: todo.map((s) => ({
      id: s.id,
      title: s.title,
      docPath: path.join(dir, s.path || '.', 'prd.md'),
      wordPath: path.join(dist, `${s.id}-${s.title}.docx`),
      yxtNo: s.yxt && s.yxt.no ? s.yxt.no : null,
    })),
    note: '研效通开放 API 不支持设置上级需求、不支持传附件：建完需求后须在 Web 手工设上级并上传 Word。',
  };
  fs.writeFileSync(path.join(dist, 'publish-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  say(`${C.g('✓')} 已生成 ${made.length} 个 Word → ${C.c(rel(dir, dist))}`);
  made.forEach((m) => say(`  · ${m}`));
  if (allMissing.length) {
    say(`\n${C.y(`有 ${allMissing.length} 张图片没找到，Word 里会显示红色占位：`)}`);
    for (const m of allMissing) {
      say(`  ! ${m.doc} → ${m.alt || '(无说明)'}：${m.src}${m.reason ? `（${m.reason}）` : ''}`);
      if (m.tried && m.tried.length) say(`      试过：${m.tried.join('  |  ')}`);
    }
    say(`${C.dim('把图片放到工作区的 shots/ 目录，或把 md 里的路径改成实际位置，再 publish 一次。')}`);
  }
  if (plan.items.length) {
    say(`\n${C.y(`${plan.items.length} 条待发布到需求池：`)}`);
    plan.items.forEach((i) => say(`  · ${i.id} ${i.title}`));
  } else {
    say(`\n${C.g('需求池已全部回填编号')}`);
  }
  say(`\n${C.dim('发布清单：')} ${rel(dir, path.join(dist, 'publish-plan.json'))}`);
  jsonOut.result = {
    dist: rel(dir, dist),
    wordFiles: made,
    planFile: rel(dir, path.join(dist, 'publish-plan.json')),
    pendingPublish: plan.items.length,
    items: plan.items.map((i) => ({ id: i.id, title: i.title, yxtNo: i.yxtNo })),
    missingImages: allMissing.map((m) => ({ doc: m.doc, src: m.src, alt: m.alt, reason: m.reason || null })),
    note: plan.note,
  };
}

/* ===================== 命令：pushed（回填研效通编号） ===================== */
function cmdPushed() {
  const { dir, state } = openState();
  const id = need(argv._[1], '请给条目编号（大需求给子需求编号，小需求给项目编号）');
  const no = need(F.no, '请给研效通编号：--no REQ-20261106-03');
  if (state.kind === 'project') {
    if (id === state.id || id === 'parent') {
      state.yxt = state.yxt || {};
      state.yxt.parentNo = no;
    } else {
      const s = (state.subs || []).find((x) => x.id === id);
      if (!s) {
        fail(`✗ 没有子需求 ${id}`, 2);
      }
      s.yxt = s.yxt || {};
      s.yxt.no = no;
      s.yxt.at = new Date().toISOString();
    }
  } else {
    state.yxt = state.yxt || {};
    state.yxt.no = no;
    state.yxt.at = new Date().toISOString();
  }
  log(state, 'pushed', `${id} → ${no}`);
  save(dir, state);
  syncDocs(dir, state);
  say(`${C.g('✓')} ${id} → ${no}`);
}

/* ===================== 命令：ls / board（看板） ===================== */

/**
 * 看板的每一行：一个正在跟进的需求工作区。
 * 只放你在「文档」里做决定时真正要看的三个数：
 *   ① 阶段与进度  ② 本阶段任务完成度  ③ 挂在别人手上的事
 */
function boardRow(dir, kind, state) {
  const s = summarize(dir, state);
  const cur = (state.tasks || []).filter((t) => t.stage === state.stage);
  const curDone = cur.filter((t) => t.status === 'done').length;

  // 「挂在别人手上」只算真正派出去的：
  //   · 已 defer 出去的评审问题（review defer --to 业务）
  //   · 状态为 doing、且责任人在别人名下的任务（模板里的 todo 不算——那是还没发生的计划）
  const waitingMap = new Map();
  const bump = (who, what) => {
    if (!waitingMap.has(who)) waitingMap.set(who, []);
    waitingMap.get(who).push(what);
  };
  for (const r of state.reviews || []) {
    if (r.status === 'deferred' && r.owner) bump(r.owner, `问：${r.text}`);
  }
  for (const t of state.tasks || []) {
    if (t.status === 'doing' && t.who && t.who !== '我') bump(t.who, `办：${t.title}`);
  }
  const waiting = [...waitingMap].map(([who, items]) => ({ who, count: items.length, items }));
  const waitingTotal = waiting.reduce((n, g) => n + g.count, 0);

  return {
    dir,
    kind,
    id: s.id,
    title: s.title,
    stage: s.stage,
    stageName: s.stageName,
    progress: s.progress,
    stageIndex: stageIndex(kind, s.stage) + 1,
    stageTotal: stagesOf(kind).length,
    tasksDone: curDone,
    tasksTotal: cur.length,
    waiting,
    waitingTotal,
    blockers: s.blockers.length,
    openReviews: (s.openReviews || []).length,
    canAdvance: s.canAdvance,
    updatedAt: state.updatedAt,
  };
}

function cmdLs() {
  const root = projectsRoot();
  const scanned = scanProjects();
  if (!scanned.length) {
    say(`还没有任何需求工作区。项目根：${C.dim(root)}`);
    say(`建一个：${C.y('pmw init --here --kind project --title "..."')}（在需求目录里执行）`);
    jsonOut.result = { root, projects: [] };
    return;
  }
  const rows = [];
  for (const { dir, kind } of scanned) {
    try {
      const state = load(dir, kind);
      rows.push(boardRow(dir, kind, state));
    } catch {
      /* 坏项目跳过 */
    }
  }
  // 未完成的排前面，同类按更新时间倒序
  rows.sort((a, b) => {
    const ad = a.stage === 'DONE' ? 1 : 0;
    const bd = b.stage === 'DONE' ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  for (const r of rows) {
    const flag = r.waitingTotal ? C.y(` 等 ${r.waitingTotal} 事`) : '';
    const bl = r.blockers ? C.r(` 卡 ${r.blockers}`) : '';
    const tk = r.tasksTotal ? C.dim(` 任务 ${r.tasksDone}/${r.tasksTotal}`) : '';
    say(`${C.b(r.id)} ${r.title}  ${C.dim(`[${r.kind === 'project' ? '大' : '小'}] ${r.stageName} ${r.progress}`)}${tk}${flag}${bl}`);
  }
  jsonOut.result = { root, projects: rows };
}

function cmdBoard() {
  const root = projectsRoot();
  const scanned = scanProjects();
  const rows = [];
  for (const { dir, kind } of scanned) {
    try {
      rows.push(boardRow(dir, kind, load(dir, kind)));
    } catch {
      /* 坏项目跳过 */
    }
  }
  const active = rows.filter((r) => r.stage !== 'DONE').sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const closed = rows.filter((r) => r.stage === 'DONE');
  jsonOut.result = { root, active, closed };
  jsonOut.mermaid = boardMermaid(active);
  if (!active.length) {
    say('看板是空的。');
  } else {
    say(`${C.b('正在跟进')} ${C.dim(`(${active.length})`)}`);
    for (const r of active) {
      const who = r.waiting.map((w) => `${w.who}×${w.count}`).join('、');
      say(`  ${C.b(r.id)} ${r.title}`);
      say(`    ${C.dim(`${r.stageName} ${r.progress}`)}  ${C.dim(`任务 ${r.tasksDone}/${r.tasksTotal}`)}${who ? `  ${C.y(`等：${who}`)}` : ''}`);
    }
    if (closed.length) say(`\n${C.dim(`已完成 ${closed.length} 个`)}`);
    say('\n点进某一个：' + C.y('pmw status --dir "<工作区>"'));
  }
}

/** 看板的 Mermaid：一个需求一个节点，label 带进度与待办数 */
function boardMermaid(rows) {
  if (!rows.length) return 'flowchart LR\n  EMPTY["还没有正在跟进的需求"]';
  const lines = ['flowchart LR'];
  rows.forEach((r, i) => {
    const n = `P${i}`;
    const label = `${r.id} ${r.title}<br/>${r.stageName} ${r.progress}<br/>任务 ${r.tasksDone}/${r.tasksTotal}${r.waitingTotal ? ` · 等 ${r.waitingTotal}` : ''}`;
    lines.push(`  ${n}["${label.replace(/"/g, "'")}"]`);
  });
  return lines.join('\n');
}

function cmdHistory() {
  const { state } = openState();
  for (const h of state.history || []) {
    say(`${C.dim(h.at.slice(0, 16).replace('T', ' '))}  ${h.action.padEnd(14)} ${h.note}`);
  }
  jsonOut.result = { history: state.history || [] };
}

/* ===================== 命令：where ===================== */
function cmdWhere() {
  const dir = resolveDir(false);
  say(`pm-flow 根目录: ${ROOT}`);
  say(`项目根目录  : ${projectsRoot()}`);
  say(`当前项目    : ${dir || C.dim('（未指定）')}`);
  jsonOut.result = { root: ROOT, projectsRoot: projectsRoot(), dir };
}


/* ===================== 命令：guide（当前阶段写作指引） ===================== */
/** 从笔记正文里取第一段能读的句子（跳过 frontmatter、标题、表格）。 */
function bodyExcerpt(raw) {
  let s = String(raw || '');
  const fm = s.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (fm) s = s.slice(fm[0].length);
  for (const block of s.split(/\r?\n\s*\r?\n/)) {
    const t = block.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('|') || t.startsWith('---')) continue;
    const clean = t.replace(/#{1,6}\s*/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length >= 10) return clean.slice(0, 140);
  }
  return '';
}

/** 检索命中给的是一段原文窗口，可能从 frontmatter 中间开始；把它清成一句人话。 */
function cleanExcerpt(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  let start = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    // frontmatter 残留：`key: value`、列表项、分隔线
    if (/^[A-Za-z_][\w-]*:(\s|$)/.test(t) || /^-\s/.test(t) || t === '---') {
      start = i + 1;
      continue;
    }
    break;
  }
  return lines
    .slice(start)
    .join(' ')
    .replace(/^---[\s\S]*?---/, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

/**
 * 进阶段时顺手把这阶段相关的历史经验从知识库里捞出来。
 * 连不上 / 没配 Key 就静默返回 null——知识库是加分项，不能卡住主流程。
 */
async function recallForStage(key) {
  const queries = kbQueriesOf(key);
  if (!queries.length) return null;
  let client;
  try {
    const m = await import(new URL('../lib/obsidian/client.js', import.meta.url).href);
    if (!m.obsidianConfig()) return null;
    client = m.clientFromEnv();
  } catch {
    return null;
  }
  const seen = new Map();
  for (const q of queries) {
    let hits = [];
    try {
      hits = await client.search(q, 60);
    } catch {
      return null; // 连不上就整体放弃，不要半截输出
    }
    for (const h of hits) {
      // 跳过「什么算XX」这种说明页和两个索引页——它们是脚手架，不是经验
      if (/(^|\/)(什么算[^/]*\.md|工作台\.md|需求总览\.md)$/.test(h.filename)) continue;
      // 经验类优先于需求索引类（需求索引只是这个需求自己的镜像，不算「历史经验」）
      const isExp = /\/20-经验\//.test(h.filename) ? 1 : 0;
      const cur = seen.get(h.filename) || { path: h.filename, score: 0, isExp, excerpt: '' };
      cur.score += 1;
      if (!cur.excerpt) {
        const first = (h.matches || [])[0];
        if (first && first.context) cur.excerpt = cleanExcerpt(first.context);
      }
      seen.set(h.filename, cur);
    }
  }
  const notes = [...seen.values()]
    .sort((a, b) => b.isExp - a.isExp || b.score - a.score)
    .slice(0, 5)
    .map((n) => ({ path: n.path, isExp: n.isExp, score: n.score, excerpt: n.excerpt }));
  // 摘要优先用正文第一段（检索窗口可能落在 frontmatter 里，读起来是噪音）
  for (const n of notes) {
    try {
      const raw = await client.read(n.path);
      const better = bodyExcerpt(raw);
      if (better) n.excerpt = better;
    } catch {
      /* 读不到就保留检索窗口给的片段 */
    }
  }
  return { queries, notes };
}

function printKbNotes(kb) {
  if (!kb || !kb.notes || !kb.notes.length) return;
  say('');
  say(`### 这阶段相关的历史经验（${kb.notes.length} 篇，来自知识库）`);
  for (const n of kb.notes) {
    say(`- ${n.path}`);
    if (n.excerpt) say(`  ${n.excerpt}`);
  }
  say('');
  say('要看全文：obsidian action=read path="<上面的路径>"');
}

async function cmdGuide() {
  const want = argv._[1];
  if (want === 'list' || want === 'ls') {
    say('可用的阶段指引：');
    const idx = guidesIndex();
    idx.forEach((l) => say(l));
    jsonOut.result = { action: 'list', guides: idx };
    return;
  }
  if (want && want !== 'current') {
    const g = guideOf(want);
    say(`## ${g.title}`);
    say('');
    say(g.body);
    const kb = F['no-kb'] ? null : await recallForStage(want);
    printKbNotes(kb);
    jsonOut.result = { action: 'show', key: want, title: g.title, body: g.body, kb };
    return;
  }
  const { state } = openState();
  const st = stageOf(state.kind, state.stage);
  const g = guideOf(st.key);
  say(`## ${st.icon} ${st.name} —— ${g.title}`);
  say('');
  say(g.body);
  const kb = F['no-kb'] ? null : await recallForStage(st.key);
  printKbNotes(kb);
  jsonOut.result = { action: 'show', key: st.key, name: st.name, title: g.title, body: g.body, kb };
}

/* ===================== help ===================== */
/* ===================== note（Obsidian 知识库）===================== */
async function cmdNote() {
  const sub = argv._[1] || 'status';
  const kb = await import(new URL('../lib/obsidian/kb.js', import.meta.url).href);
  const sync = await import(new URL('../lib/obsidian/sync.js', import.meta.url).href);
  const { obsidianConfig, clientFromEnv } = await import(new URL('../lib/obsidian/client.js', import.meta.url).href);

  const cfg = obsidianConfig();
  if (!cfg) {
    fail(`✗ 还没配 Obsidian 知识库。
  在环境变量里设 OBSIDIAN_API_KEY（Obsidian → 设置 → Local REST API 里那个 Key）。
  可选：OBSIDIAN_PROTOCOL=http / OBSIDIAN_PORT=27123（默认走 https 27124）。`);
  }

  const client = clientFromEnv();

  if (sub === 'status') {
    let vaultFiles = null;
    let err = '';
    try { vaultFiles = await client.listVault(); } catch (e) { err = e.message; }
    const rootList = vaultFiles ? vaultFiles.filter((f) => f.startsWith(kb.KB_ROOT + '/')) : [];
    say(`${C.b('Obsidian 知识库')}  ${cfg.protocol}://${cfg.host}:${cfg.port}`);
    if (err) {
      say(`  ${C.r('✗ 连不上')}：${err}`);
      say(`  检查 Obsidian 是不是开着、Local REST API 插件是不是启用了。`);
    } else {
      say(`  ${C.g('✓ 已连接')}  vault 顶层 ${vaultFiles.length} 项，知识库内 ${rootList.length} 项`);
      say('');
      say('  目录约定：');
      for (const [k, v] of Object.entries(kb.KB_DIRS)) say(`    ${C.c(k.padEnd(12))} ${v}`);
    }
    jsonOut.result = { action: 'status', ok: !err, error: err, config: cfg, vaultCount: vaultFiles?.length ?? 0, kbCount: rootList.length, dirs: kb.KB_DIRS };
    if (err) flushJson(1);
    return;
  }

  if (sub === 'sync' || sub === 'index' || sub === 'push') {
    const { dir, state } = openState();
    // 必须用 summarize 之后的视图：stageName / progress / openReviews / tasks 都在里面算
    const view = { ...summarize(dir, state), dir };
    say(`同步 ${C.b(view.title)} 到知识库…`);
    const res = await sync.syncWorkspace(dir, view, {
      includeDocx: Boolean(F.docx),
      overwrite: !F['no-overwrite'],
    });
    if (!res.ok) fail(`✗ ${res.error}`);
    say(`  ${C.g(`✓ ${res.notes.length} 篇`)}  ${C.dim(res.name)}`);
    for (const n of res.notes) {
      const tag = n.rewritten ? '（重建为 Dataview 版）' : '';
      say(`    ${C.c(n.kind.padEnd(9))} ${n.path}${tag}`);
    }
    if (res.skipped?.length) {
      say('');
      say('  跳过的：');
      for (const s of res.skipped) say(`    ${C.dim('·')} ${s}`);
    }
    say('');
    say(`在 Obsidian 里搜「${res.name}」就能找到。索引页见 ${C.c('00-索引/需求总览')} 与 ${C.c('00-索引/工作台')}。`);
    jsonOut.result = { action: 'sync', ok: true, name: res.name, notes: res.notes, skipped: res.skipped };
    return;
  }

  if (sub === 'init' || sub === 'skeleton') {
    const made = await sync.ensureSkeleton(client);
    say(made.length
      ? `${C.g('✓ 建好')}：${made.join('、')}`
      : `${C.dim('索引页已经在了，没动。')}`);
    jsonOut.result = { action: 'init', made };
    return;
  }

  if (sub === 'read' || sub === 'cat') {
    const p = argv._[2];
    if (!p) fail('用法：pmw note read <vault 内路径>');
    say(await client.read(p));
    jsonOut.result = { action: 'read', path: p };
    return;
  }

  if (sub === 'search' || sub === 'find') {
    const q = argv._.slice(2).join(' ');
    if (!q) fail('用法：pmw note search <关键词>');
    const hits = await client.search(q);
    if (!hits.length) say(`知识库里没有「${q}」。`);
    else {
      say(`${C.b(`「${q}」`)} 找到 ${hits.length} 篇：`);
      for (const h of hits.slice(0, 20)) say(`  ${C.c(h.filename)}${h.matches?.[0]?.context ? C.dim(`  …${String(h.matches[0].context).trim().slice(0, 80)}…`) : ''}`);
    }
    jsonOut.result = { action: 'search', query: q, hits };
    return;
  }

  fail(`✗ 不认识的子命令 ${sub}。可用：status / sync / read / search`);
}

/* ============================ 研效通 ============================ */

/**
 * 研效通子包的编排入口。
 *
 * 分工：研效通那套 CLI 自己会校验必填、会调接口，我们不重复实现；
 * 这一层只做三件它不会做的事——
 *   1. 把本地工作区里的东西（任务链 / demo / PRD）翻成它的 body；
 *   2. 把返回的平台单号回填进 req.json/project.json，形成「本地↔平台」对照；
 *   3. 把它的英文报错翻成人话，并在 dry 模式下先给用户看 body。
 */
async function cmdYxt() {
  if (readSettings().yanxiaotong === false) fail('研效通未启用；请先在设置中启用。');
  const sub = argv._[1] || 'status';
  const rootMod = await import(new URL('../lib/yxt/root.js', import.meta.url).href);
  const cli = await import(new URL('../lib/yxt/cli.js', import.meta.url).href);
  const ops = await import(new URL('../lib/yxt/ops.js', import.meta.url).href);
  const def = rootMod.defaults();

  const found = rootMod.findYxtRoot(F.yxtroot || def.root || undefined);
  if (!found) {
    fail(`✗ 找不到研效通技能包。
  它是解压出来的目录，不是 npm 包。用法：
    pmw yxt config --root "D:\\...\\yanxiaotong-skills"
  或设环境变量 YXT_ROOT。
  当前探过的位置：${rootMod.allRoots().join('、') || '（都没有）'}`);
  }
  const root = found.root;

  /* ---------- doctor：这个包能不能用 ---------- */
  if (sub === 'doctor' || sub === 'env') {
    const tokenFile = path.join(os.homedir(), '.yanxiaotong', 'tokens', 'prod');
    const hasToken = fs.existsSync(tokenFile);
    const tokenSize = hasToken ? fs.statSync(tokenFile).size : 0;
    const pkgs = Object.keys(cli.PKG_TOOLS);
    const missing = pkgs.filter((p) => !fs.existsSync(path.join(root, 'packages', p, 'tools', cli.PKG_TOOLS[p])));
    say(`${C.b('研效通')}  ${root}`);
    say(`  来源      ${C.dim(found.source)}`);
    say(`  token     ${hasToken ? C.g(`✓ 有（${tokenSize} 字节）`) : C.r('✗ 没有')}  ${C.dim(tokenFile)}`);
    say(`  子包      ${missing.length ? C.y(`${pkgs.length - missing.length}/${pkgs.length}`) : C.g(`✓ ${pkgs.length} 个都在`)}`);
    if (missing.length) say(`            ${C.r('缺：' + missing.join('、'))}`);
    if (def.businessDomainId) say(`  业务领域  ${def.businessDomainId}`);
    if (def.projectId) say(`  关联项目  ${def.projectId}`);
    say('');
    if (hasToken) {
      // 真连一次，验证 token 没过期
      const probe = ops.meta(root, 'task', ['m10', '--pick', 'phase']);
      say(probe.ok ? `${C.g('✓ 平台连通')}：任务阶段 ${ops.pickList(probe.text).length} 个` : `${C.r('✗ 连不上')}：${probe.error || probe.text.slice(0, 200)}`);
    } else {
      say(`${C.y('token 没有，先解决这个')}：研效通 → 个人设置 → 开放 API 令牌，写进 ${tokenFile}`);
    }
    jsonOut.result = { action: 'doctor', root, source: found.source, hasToken, tokenSize, missing, defaults: def };
    if (!hasToken || missing.length) flushJson(1);
    return;
  }

  /* ---------- config：只用配一次的默认值 ---------- */
  if (sub === 'config' || sub === 'cfg') {
    const patch = {};
    const map = {
      root: 'root',
      'business-domain-id': 'businessDomainId',
      'project-id': 'projectId',
      'app-service-id': 'appServiceId',
      'requirement-level': 'requirementLevel',
      'task-phase': 'taskPhase',
      'task-category': 'taskCategory',
      'team-id': 'teamId',
      'submitter-name': 'submitterName',
      'employee-id': 'employeeId',
    };
    for (const [flag, key] of Object.entries(map)) {
      if (F[flag] !== undefined) patch[key] = String(F[flag]);
    }
    if (F.owners !== undefined) patch.owners = String(F.owners).split(',').map((s) => s.trim()).filter(Boolean);
    if (!Object.keys(patch).length) {
      const cur = rootMod.readConfig();
      say(`${C.b('研效通默认值')}  ${rootMod.configFile()}`);
      const keys = rootMod.CONFIG_KEYS;
      if (!Object.keys(cur).length) say(`  ${C.dim('（还没配过。用 pmw yxt config --business-domain-id xxx 这样存）')}`);
      for (const k of keys) {
        if (cur[k] === undefined) continue;
        say(`  ${C.c(k.padEnd(20))} ${Array.isArray(cur[k]) ? cur[k].join(', ') : cur[k]}`);
      }
      jsonOut.result = { action: 'config', file: rootMod.configFile(), config: cur };
      return;
    }
    const next = rootMod.writeConfig(patch);
    say(`${C.g('✓ 存好了')}  ${rootMod.configFile()}`);
    for (const [k, v] of Object.entries(patch)) say(`  ${C.c(k.padEnd(20))} ${Array.isArray(v) ? v.join(', ') : v}`);
    jsonOut.result = { action: 'config', saved: patch, config: next };
    return;
  }

  /* ---------- meta：元数据点选（阶段/类别/业务领域/严重程度…） ---------- */
  if (sub === 'meta') {
    const pkg = argv._[2];
    if (!pkg) fail('用法：pmw yxt meta <requirement|task|defect|org-todo|problem-ticket> <m01|m05|m09|m10|m11> [--pick]');
    const rest = argv._.slice(3);
    const r = ops.meta(root, pkg, rest);
    say(r.text.trim() || (r.error ? `✗ ${r.error}` : '（没有输出）'));
    jsonOut.result = { action: 'meta', pkg, args: rest, ok: r.ok, text: r.text };
    if (!r.ok) flushJson(1);
    return;
  }

  /* ---------- req：查需求（拿 requirementId） ---------- */
  if (sub === 'req' || sub === 'requirement') {
    const id = argv._[2] || F.id;
    if (!id) fail('用法：pmw yxt req <REQ-xxx>');
    const r = ops.resolveRequirement(root, id);
    if (!r.ok) fail(`✗ ${r.error}`);
    const d = r.data || {};
    say(`${C.b(d.title || id)}`);
    say(`  ${C.dim('编号')}  ${d.no || d.requirementNo || id}`);
    say(`  ${C.dim('id')}    ${d.id || ''}`);
    if (d.status) say(`  ${C.dim('状态')}  ${d.status}`);
    if (d.requirementLevel) say(`  ${C.dim('层级')}  ${d.requirementLevel}`);
    jsonOut.result = { action: 'req', data: d };
    return;
  }

  /* ---------- story：只读检查故事卡 / 迭代目录 ---------- */
  if (sub === 'story') {
    const act = argv._[2] || 'parse';
    if (!['parse', 'scan'].includes(act)) fail('用法：pmw yxt story <parse|scan> --path <文件或目录>');
    const input = need(F.path, '请用 --path 指定故事卡或迭代目录');
    const r = ops.inspectStories(root, path.resolve(String(input)), act === 'scan');
    if (!r.ok) fail(`✗ ${r.error}`);
    const data = r.data;
    const items = act === 'scan' ? data.items : [data];
    say(act === 'scan' ? `扫描到 ${data.total} 条故事卡，可创建 ${data.creatable} 条` : '故事卡解析');
    for (const item of items || []) {
      const p = item.parsed || {};
      say(`  ${p.title || item.docPath || item.inputPath || '未识别'}  优先级：${p.priority || '未识别'}  故事点：${p.storyPoint ?? '未识别'}`);
      for (const warning of item.warnings || []) say(`    ${warning.blocked ? '✗' : '!'} ${warning.message || warning.type}`);
      if (item.error) say(`    ✗ ${item.error}`);
    }
    for (const warning of data.batchWarnings || []) say(`  ! ${warning.type}: ${warning.title || ''}`);
    jsonOut.result = { action: `story.${act}`, data };
    return;
  }

  if (sub === 'or' && (argv._[2] === 'detail' || argv._[2] === 'read')) {
    const id = need(argv._[3] || F.id, '用法：pmw yxt or detail <OR-xxx>');
    const r = ops.detailOriginalRequirement(root, id);
    if (!r.ok) fail(`✗ ${r.error}`);
    say(JSON.stringify(r.data, null, 2));
    jsonOut.result = { action: 'or.detail', data: r.data };
    return;
  }

  /* ---------- 其余子命令都需要工作区 ---------- */
  if (sub === 'status') {
    const { dir, state } = openState();
    const yxt = state.yxt || {};
    const s = summarize(dir, state);
    say(`${C.b(s.title)}  ${C.dim(`[${s.kind === 'req' ? '小需求' : '大需求'}]`)}`);
    say('');
    const row = (label, v) => say(`  ${C.dim(label.padEnd(10))} ${v || C.dim('—')}`);
    row('原始需求', yxt.orNo);
    row('需求', yxt.reqNo);
    row('父需求', yxt.parentReqNo);
    row('Demo', yxt.demoUrl || yxt.demoId);
    const tasks = state.tasks || [];
    const pushed = tasks.filter((t) => t.yxtNo);
    row('任务', `${pushed.length}/${tasks.length} 已推`);
    const defects = yxt.defects || [];
    row('缺陷', defects.length ? defects.map((d) => `${d.no}(${d.status || '新建'})`).join('、') : '');
    const todos = yxt.todos || [];
    row('组织待办', todos.map((t) => t.no).join('、'));
    if (!yxt.orNo && !yxt.reqNo && !pushed.length) {
      say('');
      say(`${C.dim('还没跟研效通对上号。先 pmw yxt doctor 确认能连上。')}`);
    }
    jsonOut.result = { action: 'status', yxt, pushedTasks: pushed.length, totalTasks: tasks.length };
    return;
  }

  /* ---------- task ---------- */
  if (sub === 'task') {
    const act = argv._[2] || 'list';

    if (act === 'meta') {
      const m = ops.taskMeta(root, F.phase);
      say(`${C.b('任务阶段')}（T01 必填 taskPhase）`);
      for (const x of m.phases) say(`  ${C.c(x.id)}`);
      say('');
      say(`${C.b('任务类别')}（T01 必填 taskCategory${F.phase ? `，按「${F.phase}」过滤` : ''}）`);
      for (const x of m.categories) say(`  ${C.c(x.id)}`);
      jsonOut.result = { action: 'task.meta', ...m };
      return;
    }

    if (act === 'list') {
      const q = {};
      if (F.req) q.requirementId = F.req;
      if (F.keyword) q.title = F.keyword;
      const r = ops.listTasks(root, q);
      if (!r.ok) fail(`✗ ${r.error}`);
      if (!r.records.length) say('没有任务。');
      else {
        say(`${C.b('任务')} 共 ${r.total} 条`);
        for (const t of r.records) {
          say(`  ${C.c(t.taskNo || t.no || t.id || '').padEnd(16)} ${t.title || ''}  ${C.dim(t.status || '')}`);
        }
      }
      jsonOut.result = { action: 'task.list', total: r.total, records: r.records };
      return;
    }

    if (act === 'push') {
      // 把本地任务链推成平台任务。这是唯一能自动表达「任务挂在需求下」的通道。
      const { dir, state } = openState();
      const s = summarize(dir, state);
      const reqNo = F.req || state.yxt?.reqNo;
      if (!reqNo) fail('✗ 还不知道这条需求在平台上的编号。先 pmw yxt req <REQ-xxx> 认一下，或用 --req REQ-xxx 指定。');
      const r = ops.resolveRequirement(root, reqNo);
      if (!r.ok) fail(`✗ 查需求失败：${r.error}`);
      const requirementId = r.id || r.data?.requirementId;
      if (!requirementId) fail(`✗ ${reqNo} 没有返回 id，没法挂任务。`);

      const only = F.only ? String(F.only).split(',').map((x) => x.trim()) : null;
      // 默认只推"给人干的活"：模板任务（收料/对齐/写 PRD 这些）是产品经理自己的工作流，
      // 推到研效通只会污染开发的任务列表。要连模板任务一起推，显式 --all。
      const todo = (state.tasks || []).filter((t) => {
        if (t.yxtNo) return false;
        if (t.status === 'done') return false;
        if (only) return only.includes(t.id);
        return F.all ? true : t.from !== 'tpl';
      });
      if (!todo.length) {
        const tplLeft = (state.tasks || []).filter((t) => !t.yxtNo && t.status !== 'done' && t.from === 'tpl').length;
        say(`${C.dim('没有待推的任务。')}`);
        if (tplLeft) {
          say(`${C.dim(`（还有 ${tplLeft} 条是流程模板任务，属于你自己的活，不推。真要推加上 --all）`)}`);
        } else {
          say(`${C.dim('先把给开发的活用 pmw task add 记下来。')}`);
        }
        jsonOut.result = { action: 'task.push', pushed: [], skipped: 'none', templateLeft: tplLeft };
        return;
      }

      say(`准备把 ${todo.length} 条任务推到 ${C.c(reqNo)} 下：`);
      const results = [];
      for (const t of todo) {
        say(`  ${C.c(t.id)} ${t.title}`);
        try {
          const res = ops.createTask(root, {
            title: t.title,
            description: t.note || '',
            requirementId,
            phase: F.phase || t.phase,
            category: F.category || t.category,
            start: F.start || t.start,
            end: F.end || t.end,
            // 平台要工号；本地任务的 who 常是姓名，只有纯数字才当工号传
            assigneeId: F.who || (/^\d+$/.test(String(t.who || '')) ? t.who : undefined),
            hours: F.hours || t.hours,
            dry: Boolean(F.dry),
            defaults: def,
          });
          if (!res.ok) {
            say(`    ${C.r('✗')} ${res.error}`);
            results.push({ id: t.id, ok: false, error: res.error });
            // 平台级的硬前置（比如需求没挂开发迭代）对这批任务全都成立，
            // 继续试下去只会刷出 N 条一样的报错。
            if (/开发迭代/.test(String(res.error))) {
              say('');
              say(`${C.y('这批任务都推不了，先解决上面这个问题再重试。')}`);
              break;
            }
            continue;
          }
          if (res.dry) {
            say(`    ${C.y('dry')} body: ${JSON.stringify(res.body)}`);
            results.push({ id: t.id, ok: true, dry: true, body: res.body });
            continue;
          }
          t.yxtNo = res.taskNo;
          t.yxtId = res.taskId;
          t.pushedAt = new Date().toISOString();
          save(dir, state);
          say(`    ${C.g('✓')} ${res.taskNo}`);
          results.push({ id: t.id, ok: true, taskNo: res.taskNo });
        } catch (e) {
          say(`    ${C.r('✗')} ${e.message}`);
          results.push({ id: t.id, ok: false, error: e.message });
        }
      }
      const okCount = results.filter((x) => x.ok && !x.dry).length;
      say('');
      say(`${C.g(`✓ ${okCount} 条已推`)}${F.dry ? C.y('（dry 模式，什么都没提交）') : ''}`);
      jsonOut.result = { action: 'task.push', req: reqNo, results };
      if (F.dry) return;
      return;
    }

    if (act === 'new') {
      const reqNo = F.req || openState().state.yxt?.reqNo;
      if (!reqNo) fail('用法：pmw yxt task new --req REQ-xxx --title "..."');
      const r = ops.resolveRequirement(root, reqNo);
      if (!r.ok) fail(`✗ ${r.error}`);
      const res = ops.createTask(root, {
        title: F.title || F._[3],
        description: F.desc,
        requirementId: r.id || r.data?.requirementId,
        phase: F.phase,
        category: F.category,
        start: F.start,
        end: F.end,
        assigneeId: F.who,
        hours: F.hours,
        dry: Boolean(F.dry),
        defaults: def,
      });
      if (!res.ok) fail(`✗ ${res.error}`);
      if (res.dry) {
        say(`${C.y('dry')} 这份 body 会提交到 T01：`);
        say(JSON.stringify(res.body, null, 2));
        jsonOut.result = { action: 'task.new', dry: true, body: res.body };
        return;
      }
      say(`${C.g('✓ 建好了')} ${res.taskNo}`);
      jsonOut.result = { action: 'task.new', taskNo: res.taskNo, taskId: res.taskId };
      return;
    }

    fail('用法：pmw yxt task <push|new|list|meta>');
  }

  /* ---------- defect ---------- */
  if (sub === 'defect') {
    const act = argv._[2] || 'list';
    if (act === 'list') {
      const r = ops.listDefects(root, F.req ? { requirementId: F.req } : {});
      if (!r.ok) fail(`✗ ${r.error}`);
      if (!r.records.length) say('没有缺陷。');
      else for (const d of r.records) say(`  ${C.c(d.no || d.id || '').padEnd(14)} ${d.title || ''}  ${C.dim(d.status || '')}`);
      jsonOut.result = { action: 'defect.list', total: r.total, records: r.records };
      return;
    }
    if (act === 'new') {
      const { dir, state } = openState();
      const reqNo = F.req || state.yxt?.reqNo;
      if (!reqNo) fail('用法：pmw yxt defect new --req REQ-xxx --title "..."');
      const r = ops.resolveRequirement(root, reqNo);
      if (!r.ok) fail(`✗ ${r.error}`);
      const res = ops.createDefect(root, {
        title: F.title || argv._[3],
        description: F.desc,
        requirementId: r.id || r.data?.requirementId,
        severity: F.severity,
        assigneeId: F.who,
        defectType: F.type,
        dry: Boolean(F.dry),
      });
      if (!res.ok) fail(`✗ ${res.error}`);
      if (res.dry) {
        say(`${C.y('dry')} 这份 body 会提交到缺陷创建：`);
        say(JSON.stringify(res.body, null, 2));
        jsonOut.result = { action: 'defect.new', dry: true, body: res.body };
        return;
      }
      state.yxt = state.yxt || {};
      state.yxt.defects = state.yxt.defects || [];
      state.yxt.defects.push({ no: res.defectNo, id: res.defectId, title: F.title, status: '新建', at: new Date().toISOString() });
      save(dir, state);
      say(`${C.g('✓ 建好了')} ${res.defectNo}`);
      jsonOut.result = { action: 'defect.new', defectNo: res.defectNo, defectId: res.defectId };
      return;
    }
    if (act === 'status') {
      const id = argv._[3] || F.id;
      if (!id || !F.to) fail('用法：pmw yxt defect status <TD-xxx> --to "修复待回归"');
      if (F.dry) {
        say(`${C.y('dry')} 会把 ${id} 改成「${F.to}」`);
        jsonOut.result = { action: 'defect.status', dry: true, id, to: F.to };
        return;
      }
      const r = ops.setDefectStatus(root, id, F.to);
      if (!r.ok) fail(`✗ ${r.error}`);
      const { dir, state } = openState();
      const hit = (state.yxt?.defects || []).find((d) => d.no === id || d.id === id);
      if (hit) {
        hit.status = F.to;
        hit.updatedAt = new Date().toISOString();
        save(dir, state);
      }
      say(`${C.g('✓')} ${id} → ${F.to}`);
      jsonOut.result = { action: 'defect.status', id, to: F.to };
      return;
    }
    fail('用法：pmw yxt defect <new|list|status>');
  }

  /* ---------- or：原始需求 ---------- */
  if (sub === 'or' || sub === 'original') {
    const act = argv._[2] || 'new';
    const { dir, state } = openState();
    if (act === 'link') {
      const no = argv._[3] || F.no;
      if (!no) fail('用法：pmw yxt or link <OR-xxx>');
      state.yxt = state.yxt || {};
      state.yxt.orNo = no;
      save(dir, state);
      say(`${C.g('✓')} 记下了：原始需求 ${no}`);
      jsonOut.result = { action: 'or.link', orNo: no };
      return;
    }
    if (act === 'new') {
      const s = summarize(dir, state);
      const res = ops.createOriginalRequirement(root, {
        title: F.title || s.title,
        businessPain: F.pain || state.yxt?.businessPain,
        userNeedDesc: F.need || state.yxt?.userNeedDesc || s.goal,
        valueDescription: F.value,
        expectedDeliveryDate: F.due,
        businessDomainId: F.domain || def.businessDomainId,
        dry: Boolean(F.dry),
        defaults: def,
      });
      if (!res.ok) fail(`✗ ${res.error}`);
      if (res.dry) {
        say(`${C.y('dry')} 这份 body 会提交到原始需求创建：`);
        say(JSON.stringify(res.body, null, 2));
        jsonOut.result = { action: 'or.new', dry: true, body: res.body };
        return;
      }
      state.yxt = state.yxt || {};
      state.yxt.orNo = res.orNo;
      save(dir, state);
      say(`${C.g('✓ 建好了')} ${res.orNo}`);
      jsonOut.result = { action: 'or.new', orNo: res.orNo, orId: res.orId };
      return;
    }
    fail('用法：pmw yxt or <new|link>');
  }

  /* ---------- todo：组织待办 ---------- */
  if (sub === 'todo') {
    const act = argv._[2] || 'new';
    if (act === 'progress') {
      const id = argv._[3] || F.id;
      if (!id || !F.text) fail('用法：pmw yxt todo progress <OT-xxx> --text "进展"');
      const r = ops.appendTodoProgress(root, id, F.text);
      if (!r.ok) fail(`✗ ${r.error}`);
      say(`${C.g('✓')} 进展已追加到 ${id}`);
      jsonOut.result = { action: 'todo.progress', id };
      return;
    }
    const { dir, state } = openState();
    const res = ops.createOrgTodo(root, {
      descriptionHtml: F.desc || F.title || argv._[3],
      owners: F.owner ? String(F.owner).split(',').map((s) => s.trim()) : [],
      plannedCloseAt: F.due,
      dry: Boolean(F.dry),
      defaults: def,
    });
    if (!res.ok) fail(`✗ ${res.error}`);
    if (res.dry) {
      say(`${C.y('dry')} 这份 body 会提交到组织待办创建：`);
      say(JSON.stringify(res.body, null, 2));
      jsonOut.result = { action: 'todo.new', dry: true, body: res.body };
      return;
    }
    state.yxt = state.yxt || {};
    state.yxt.todos = state.yxt.todos || [];
    state.yxt.todos.push({ no: res.todoNo, id: res.todoId, at: new Date().toISOString() });
    save(dir, state);
    say(`${C.g('✓ 建好了')} ${res.todoNo}`);
    jsonOut.result = { action: 'todo.new', todoNo: res.todoNo, todoId: res.todoId };
    return;
  }

  /* ---------- problem：问题单 ---------- */
  if (sub === 'problem') {
    if (F.prepared) {
      if (F.dry || F.prepare) fail('--prepared 不能与 --dry 或 --prepare 同时使用');
      const prepared = path.resolve(String(need(F.prepared, '请提供已确认的确认稿路径')));
      if (!fs.existsSync(prepared) || !fs.statSync(prepared).isFile()) fail('确认稿文件不存在');
      const res = ops.submitPreparedProblemTicket(root, prepared);
      if (!res.ok) fail(`✗ ${res.error}`);
      say(`${C.g('✓ 建好了')} ${res.problemNo || res.problemId}`);
      jsonOut.result = { action: 'problem.new', problemNo: res.problemNo, problemId: res.problemId, raw: res.raw };
      return;
    }
    const input = {
      title: F.title || argv._[2],
      description: F.desc,
      submitterName: F.submitter,
      problemType: F.type,
      handler: F.handler,
      businessDomain: F.domain,
      appOrService: F.app,
      dry: Boolean(F.dry),
      defaults: def,
    };
    if (F.prepare) {
      const out = path.resolve(String(need(F.out, '请用 --out 指定确认稿文件')));
      if (fs.existsSync(out)) fail('确认稿文件已存在，请选择新路径');
      const res = ops.prepareProblemTicket(root, input, out);
      if (!res.ok) fail(`✗ ${res.error}`);
      say(res.text.trim());
      say(`确认稿：${out}`);
      jsonOut.result = { action: 'problem.prepare', prepared: out, text: res.text };
      return;
    }
    if (!F.dry) fail('请先使用 --prepare --out <确认稿.json>，确认后使用 --prepared <确认稿.json> 提交');
    const res = ops.createProblemTicket(root, input);
    if (!res.ok) fail(`✗ ${res.error}`);
    if (res.dry) {
      say(`${C.y('dry')} 这份 body 会提交到问题单创建：`);
      say(JSON.stringify(res.body, null, 2));
      jsonOut.result = { action: 'problem.new', dry: true, body: res.body };
      return;
    }
  }

  /* ---------- demo：打包 + 上传 ---------- */
  if (sub === 'demo') {
    const act = argv._[2] || 'push';
    const { dir, state } = openState();
    const demoDir = F.source || path.join(dir, 'demo');
    const outZip = F.zip || path.join(dir, DIR_OUTPUT, 'demo.zip');

    if (act === 'pack') {
      if (!fs.existsSync(demoDir)) fail(`✗ 没有 demo 目录：${demoDir}`);
      const r = ops.packDemo(root, demoDir, outZip);
      if (!r.ok) fail(`✗ 打包失败：${r.error}`);
      const size = fs.existsSync(outZip) ? `${(fs.statSync(outZip).size / 1024).toFixed(0)} KB` : '';
      say(`${C.g('✓ 打好包')} ${outZip} ${C.dim(size)}`);
      jsonOut.result = { action: 'demo.pack', zip: outZip };
      return;
    }

    if (act === 'push' || act === 'publish') {
      let zip = F.zip;
      if (!zip) {
        if (!fs.existsSync(demoDir)) fail(`✗ 没有 demo 目录：${demoDir}（或者用 --zip 指定现成的 zip）`);
        fs.mkdirSync(path.dirname(outZip), { recursive: true });
        const pk = ops.packDemo(root, demoDir, outZip);
        if (!pk.ok) fail(`✗ 打包失败：${pk.error}`);
        zip = outZip;
        say(`  ${C.dim('打包')} ${zip}`);
      }
      const mode = F.mode || (state.yxt?.demoId ? 'd04' : 'd03');
      const r = ops.uploadDemo(root, {
        mode,
        environment: F.env || '生产',
        zip,
        demoId: F['demo-id'] || state.yxt?.demoId,
        name: F.name || summarize(dir, state).title,
        sourceType: F['source-type'],
        businessDomainId: F['business-domain-id'] || def.businessDomainId,
        appServiceId: F['app-service-id'] || def.appServiceId,
        dry: Boolean(F.dry),
      });
      if (!r.ok) fail(`✗ 上传失败：${r.error}`);
      if (r.dry) {
        say(`${C.y('dry')} 会跑：${r.pkg} ${r.argv.join(' ')}`);
        jsonOut.result = { action: 'demo.push', dry: true, argv: r.argv };
        return;
      }
      state.yxt = state.yxt || {};
      state.yxt.demoId = r.demoId || state.yxt.demoId;
      state.yxt.demoUrl = r.accessUrl || state.yxt.demoUrl;
      state.yxt.demoAt = new Date().toISOString();
      save(dir, state);
      say(`${C.g(`✓ 已上传（${mode === 'd04' ? '更新' : '新建'}）`)}`);
      if (r.accessUrl) say(`  ${C.c(r.accessUrl)}`);
      jsonOut.result = { action: 'demo.push', mode, demoId: r.demoId, accessUrl: r.accessUrl, raw: r.raw };
      return;
    }

    fail('用法：pmw yxt demo <push|pack> [--zip <zip>] [--mode d03|d04] [--name "名称"]');
  }

  fail(`✗ 不认识的子命令 ${sub}。可用：doctor / config / meta / req / story / status / task / defect / or / todo / problem / demo`);
}

function help() {
  const P = (k, v) => say(`  ${C.c(k.padEnd(34))} ${v}`);
  say(`${C.b('pmw —— 产品经理工作流')}\n`);
  say(`${C.b('每天先用这个')}`);
  P('pmw brief', '巡检：谁手上压了几天、卡点挂了多久、哪个需求停着不动（该主动找人了）');
  P('pmw today', '我今天该干什么（不带 --dir 就看全部在办）');
  P('pmw status', '状态 + 流程图');
  P('pmw next', '当前阶段还差什么');
  P('pmw flow', '只输出 Mermaid 流程图');
  P('pmw guide [阶段key]', '当前阶段：具体该怎么写（写作纪律）');
  say(`\n${C.b('开新需求')}`);
  P('pmw board', '看板：所有在跟的需求（阶段进度 / 本阶段任务 / 挂在别人手上）');
  P('cd <需求目录>; pmw init --here --title "..."', '就地建：材料已经在里面，状态直接落这个目录');
  P('pmw init --kind req --id REQ --title "..."', '在父目录下新建小需求子目录');
  P('pmw init --kind project --id PRJ-01 --title "..."', '在父目录下新建大需求子目录（0→1）');
  P('pmw digest [文件/目录]', `材料转 Markdown 到 ${DIR_SOURCE}/（.docx/.xlsx/.pdf 都行）；不给参数就递归扫整个工作区`);
  say(`\n${C.b('大需求拆解')}`);
  P('pmw add-module --id MOD-01 --title "预算台账"', '加模块');
  P('pmw split', '从总 PRD 模块表批量识别模块');
  P('pmw add-sub --id BG-01 --module MOD-01 --title "..."', '加子需求');
  P('pmw sync-docs', '刷新 modules/index.md');
  P('pmw check', '查依赖成环 / 缺 PRD / 与总 PRD 对不上');
  P('pmw lint', '一致性体检：字段叫法是否统一 / 规则有没有验收覆盖 / demo 与 PRD 是否对得上');
  say(`\n${C.b('反思与改路线')}`);
  P('pmw reflect start [--focus "金额口径"]', '开一轮反思：按当前阶段给一组自我拷问，逐条回答');
  P('pmw reflect add "问题" --where "规则表第3行"', '记一条没答上来的问题');
  P('pmw reflect fix 1 | keep 2 --reason "本期不做"', '改掉了 / 决定不改');
  P('pmw reflect close', '收尾（有没处理的会拦，确需留着加 --force）');
  P('pmw reroute', '看有没有该改路线的信号（返工过多 / 该升大需求 / 该回对齐）');
  P('pmw reroute apply 1 | dismiss 2 --reason "..."', '执行 / 忽略某条建议');
  P('pmw since [--by user] | pmw ack', '我不在的时候谁改了什么 / 我确认已了解');
  say(`\n${C.b('评审与卡点')}`);
  P('pmw review add "问题" [--who 开发]', '记一条开发问题');
  P('pmw review list', '看还有哪些没闭环');
  P('pmw review answer 1 "答案"', '回答');
  P('pmw review defer 1 --to 业务', '转业务确认');
  P('pmw review close 1', '开发认可了，闭环');
  P('pmw block "原因"', '记一个卡点');
  P('pmw unblock 1 | --all', '解除卡点');
  P('--- 任务链路 ---', '');
  P('pmw task list [--all|--who 业务|--status todo]', '本阶段任务清单');
  P('pmw task add "标题" --who 业务 --branch BG-01', '加临时任务（--branch-kind scenario 按场景分支）');
  P('pmw task done|doing|block|reopen T001', '改任务状态（--note 记一句）');
  P('pmw task who T001 业务', '改这条该找谁确认');
  P('pmw task branch T001 BG-02', '挂到支线');
  P('pmw task branches', '按支线看任务');
  P('pmw task pending', '按人汇总要确认什么');
  P('pmw task seed', '老项目补标准任务');
  P('pmw taskflow [--stage P4_MODULE_SPLIT]', '只出任务链路图');
  P('pmw digest 纪要.docx --extract', '转材料并把待办/待确认抽成任务');
  say(`\n${C.b('推进')}`);
  P('pmw advance', '过门禁后进下一阶段');
  P('pmw back <阶段>', '退回（验收不通过等）');
  P('pmw goto <阶段> --note "..."', '强制跳转并留痕');
  say(`\n${C.b('发布')}`);
  P('pmw publish', `Markdown → Word 落到 ${DIR_OUTPUT}/，并生成发布清单`);
  P('pmw clean [--dry] [--all]', `删掉中间 md，只留 ${DIR_OUTPUT}/ 里的 Word（--all 连 changelog 一起删）`);
  P('pmw pushed <编号> --no REQ-20261106-03', '回填研效通编号');
  P('pmw doc <md> [--out x.docx]', '单个 Markdown 转 Word');
  say(`\n${C.b('研效通（平台对账）')}`);
  P('pmw yxt doctor', '自检：包找到没、token 还有效吗、六个子包齐不齐');
  P('pmw yxt config --business-domain-id xxx', '存一次默认值，以后建需求不用再问');
  P('pmw yxt status', '这个需求在平台上的编号 / 任务推了几条 / demo 链接 / 缺陷');
  P('pmw yxt task push [--dry]', '把给开发的活推成平台任务，挂在需求下（唯一能表达层级的通道）');
  P('pmw yxt task new --req REQ-xxx --title "..."', '单条建任务');
  P('pmw yxt demo push [--mode d03|d04]', 'demo 打包上传，回 accessUrl');
  P('pmw yxt defect new --title "..."', 'UAT 不过就建缺陷');
  P('pmw yxt defect status TD-xxx --to "修复待回归"', '推缺陷状态');
  P('pmw yxt or detail <OR-xxx>', '读取原始需求详情');
  P('pmw yxt story parse|scan --path <路径>', '检查故事卡或扫描迭代目录（不提交）');
  P('pmw yxt or new|link', '原始需求：建一条，或记下已有编号');
  P('pmw yxt todo new --desc "..." --owner 工号', '组织待办');
  P('pmw yxt problem --prepare --out <文件> ...', '生成问题单确认稿；确认后用 --prepared <文件> 提交');
  P('pmw yxt meta task m10 --pick phase', '查元数据（阶段/类别/业务领域/严重程度）');
  P('pmw yxt req REQ-xxx', '查一条需求（拿平台 id）');
  say(`\n${C.b('表格与 PDF')}`);
  P('pmw xlsx sheets <file.xlsx>', '看这个表有几个 sheet、各多少行列');
  P('pmw xlsx read <file.xlsx> [--sheet 名]', '读成 Markdown（--out 存成文件）');
  P('pmw xlsx write <spec.json> <out.xlsx>', '按 spec 写一个表（表头灰底、冻结、筛选）');
  P('pmw import --from xlsx <file.xlsx> [--dry]', '按表批量建模块 + 子需求（先 --dry 看一眼）');
  P('pmw export --to xlsx', `把需求/任务链/评审台账导成 Excel 到 ${DIR_OUTPUT}/`);
  P('pmw pdf read <file.pdf> [--pages 1-5]', 'PDF 转 Markdown（合同、外发文档、扫描件以外的都行）');
  P('pmw pdf make <file.md> [--out x.pdf]', 'Markdown → PDF（给主管看、外发用）');
  P('pmw doc <md> [--pdf]', 'Markdown → Word，加 --pdf 顺手出一份');
  say(`\n${C.b('公司系统清单')}`);
  P('pmw sys list', '看有哪些系统、各环境地址（账号默认遮住）');
  P('pmw sys show <key> [--reveal]', '看某个系统的地址和账号');
  P('pmw sys open <key> [--env UAT]', '只打印地址，方便直接开浏览器');
  say(`\n${C.b('其它')}`);
  P('pmw ls', '列出所有需求工作区');
  P('pmw history', '看这个项目的操作流水');
  P('pmw where', '看路径解析结果');
  say(`\n${C.dim('通用参数：--dir <需求工作区>（也可设环境变量 PMF_DIR）；--root <装需求的父目录>')}`);
}

/* ===================== 命令：brief（主动巡检） ===================== */
/**
 * 为什么要有这条命令：所有状态本来都在，但只有你问它才说；
 * 而你忘掉跟进这件事，恰恰发生在你还没问它的时候。
 *
 * 三条阈值都可调：
 *   --wait-days  在别人手上多久算超期（默认 2 天）
 *   --block-days 卡点挂多久算超期（默认 3 天）
 *   --stale-days 阶段停多久算停滞（默认 5 天）
 */
const DEFAULT_THRESHOLDS = { wait: 2, block: 3, stale: 5 };

function daysSince(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** 本地时间戳：toISOString 是 UTC，直接切片会差 8 小时 */
function stampLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 进入当前阶段的时间：history 里最后一次阶段变更的那一刻 */
function stageEnteredAt(state) {
  const h = [...(state.history || [])]
    .reverse()
    .find((x) => ['init', 'advance', 'goto', 'back', 'kind'].includes(x.action));
  return h?.at || state.createdAt || null;
}

function briefOf(dir, state, th) {
  const s = summarize(dir, state);
  const out = {
    dir,
    id: s.id,
    title: s.title,
    kind: s.kind,
    stage: s.stage,
    stageName: s.stageName,
    progress: s.progress,
    waiting: [],
    blockers: [],
    stale: null,
    todos: [],
  };

  for (const r of state.reviews || []) {
    if (r.status !== 'deferred') continue;
    const since = r.deferredAt || r.at;
    const d = daysSince(since);
    out.waiting.push({
      type: 'review',
      ref: `#${r.id}`,
      who: r.deferredTo || '业务',
      text: r.text,
      days: d,
      overdue: (d ?? 0) >= th.wait,
    });
  }
  for (const t of state.tasks || []) {
    if (t.status !== 'doing' || !t.who || t.who === '我') continue;
    const d = daysSince(t.at);
    out.waiting.push({
      type: 'task',
      ref: t.id,
      who: t.who,
      text: t.title,
      days: d,
      overdue: (d ?? 0) >= th.wait,
    });
  }
  for (const b of state.blockers || []) {
    if (b.resolvedAt) continue;
    const d = daysSince(b.at);
    out.blockers.push({ id: b.id, text: b.text, days: d, overdue: (d ?? 0) >= th.block });
  }

  const enter = stageEnteredAt(state);
  const sd = daysSince(enter);
  out.stale = { days: sd, since: enter, overdue: (sd ?? 0) >= th.stale, threshold: th.stale };

  out.todos = (state.tasks || [])
    .filter((t) => t.stage === state.stage && t.status !== 'done' && (!t.who || t.who === '我'))
    .slice(0, 3)
    .map((t) => ({ id: t.id, title: t.title, status: t.status }));
  return out;
}

function cmdBrief() {
  const th = {
    wait: Number(F['wait-days'] ?? DEFAULT_THRESHOLDS.wait),
    block: Number(F['block-days'] ?? DEFAULT_THRESHOLDS.block),
    stale: Number(F['stale-days'] ?? DEFAULT_THRESHOLDS.stale),
  };

  // 指定了工作区就只看它；没指定或 --all 就看全部
  const items = [];
  if (!F.all) {
    const d = resolveDir(false);
    if (d) {
      try {
        items.push(briefOf(d, load(d, detectKind(d)), th));
      } catch {
        /* 坏工作区跳过，走全局 */
      }
    }
  }
  if (!items.length) {
    for (const { dir, kind } of scanProjects()) {
      try {
        items.push(briefOf(dir, load(dir, kind), th));
      } catch {
        /* 坏工作区跳过 */
      }
    }
  }

  const waiting = items.flatMap((i) => i.waiting.map((w) => ({ ...w, proj: i.id, dir: i.dir, projTitle: i.title })));
  const blockers = items.flatMap((i) => i.blockers.map((b) => ({ ...b, proj: i.id, dir: i.dir, projTitle: i.title })));
  const stale = items
    .filter((i) => i.stale?.overdue)
    .map((i) => ({ proj: i.id, dir: i.dir, stageName: i.stageName, ...i.stale }));
  const overdue = waiting.filter((w) => w.overdue).length + blockers.filter((b) => b.overdue).length + stale.length;

  jsonOut.result = {
    checkedAt: new Date().toISOString(),
    thresholds: th,
    projects: items,
    waiting,
    blockers,
    stale,
    counts: {
      projects: items.length,
      waiting: waiting.length,
      blockers: blockers.length,
      stale: stale.length,
      overdue,
    },
  };

  if (!items.length) {
    say('还没有在跟的需求。');
    return;
  }

  say(`${C.b('📋 巡检')} ${C.dim(stampLocal())}`);
  say(
    C.dim(
      `${items.length} 个在跟 · 在等别人 ${waiting.length} 条 · 卡点 ${blockers.length} 个 · 停滞 ${stale.length} 个${
        overdue ? C.r(` · ${overdue} 项超期`) : ''
      }`,
    ),
  );

  if (waiting.length) {
    say(`\n${C.y('⏳ 在等别人')}`);
    for (const w of waiting.sort((a, b) => (b.days ?? 0) - (a.days ?? 0))) {
      const flag = w.overdue ? C.r('⚠ ') : '  ';
      const day = w.days === null ? '?' : `${w.days} 天`;
      say(`${flag}${C.b(w.who)} ${C.dim(day.padEnd(5))} ${w.text}`);
      say(`     ${C.dim(`${w.proj} ${w.ref} · ${w.projTitle}`)}`);
    }
  }

  if (blockers.length) {
    say(`\n${C.r('⛔ 卡点')}`);
    for (const b of blockers) {
      const flag = b.overdue ? C.r('⚠ ') : '  ';
      say(`${flag}${C.dim(`${b.days ?? '?'} 天`.padEnd(6))} ${b.text}`);
      say(`     ${C.dim(`${b.proj} #${b.id} · ${b.projTitle}`)}`);
    }
  }

  if (stale.length) {
    say(`\n${C.y('🐢 阶段停滞')}`);
    for (const s of stale) {
      say(`  ${C.y('⚠')} ${C.b(s.proj)} ${s.stageName} 停了 ${s.days} 天${C.dim(`（阈值 ${s.threshold}）`)}`);
    }
  }

  const push = [];
  for (const w of waiting.filter((x) => x.overdue)) {
    push.push(`问 ${w.who}：${w.text}${C.dim(`（等了 ${w.days} 天）`)}`);
  }
  for (const i of items) {
    for (const t of i.todos) push.push(`做 ${t.id} ${t.title}${C.dim(`（${i.id}）`)}`);
  }
  if (push.length) {
    say(`\n${C.g('✅ 今天可以推的')}`);
    for (const p of push.slice(0, 6)) say(`  · ${p}`);
  }
  say(`\n${C.dim('阈值可调：pmw brief --wait-days 1 --block-days 2 --stale-days 3')}`);
}

/* ===================== 命令：lint（文档一致性体检） ===================== */
/** 读一份 md，读不到返回空串 */
function readSoft(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/**
 * 把工作区里的文档收齐，跑一致性体检。
 * check 也调它，所以「写 PRD 时顺手 pmw check」就能发现前后对不上。
 */
function runLint(dir, state) {
  const docs = [];
  let standard = new Set();
  const prdIds = [];
  let hasDemo = false;
  const features = new Set();

  if (state.kind === 'project') {
    const master = readSoft(path.join(dir, 'master/master-prd.md'));
    if (master) {
      docs.push({ name: '总 PRD', text: master, kind: 'master' });
      standard = definedTerms(master).strict;
    }
    for (const m of state.modules || []) {
      const t = readSoft(path.join(dir, m.path, 'module-prd.md'));
      if (t) docs.push({ name: `${m.id} ${m.title}`, text: t, kind: 'module' });
      prdIds.push(m.id);
    }
    for (const s of state.subs || []) {
      const t = readSoft(path.join(dir, s.path, 'prd.md'));
      if (t) docs.push({ name: `${s.id} ${s.title}`, text: t, kind: 'sub' });
      prdIds.push(s.id);
    }
    const demoDir = path.join(dir, 'demo');
    if (fs.existsSync(demoDir)) {
      for (const f of fs.readdirSync(demoDir).filter((x) => x.endsWith('.html'))) {
        hasDemo = true;
        for (const x of demoFeatures(readSoft(path.join(demoDir, f)))) features.add(x);
      }
    }
  } else {
    const t = readSoft(path.join(dir, 'prd.md'));
    if (t) docs.push({ name: 'prd.md', text: t, kind: 'sub' });
  }

  return {
    ...lintDocs({ standard, docs, features, prdIds, hasDemo }),
    standard: [...standard],
    docs: docs.map((d) => d.name),
    features: [...features],
  };
}

function cmdLint() {
  const { dir, state } = openState();
  const r = runLint(dir, state);

  jsonOut.result = {
    problems: r.problems,
    warns: r.warns,
    details: r.details,
    standard: r.standard,
    docs: r.docs,
    features: r.features,
    ok: r.problems.length === 0,
  };

  say(`${C.b('🔍 一致性体检')} ${C.dim(`${r.docs.length} 份文档、总 PRD 里 ${r.standard.length} 个标准字段`)}`);

  if (!r.docs.length) {
    say(`${C.y('这个工作区里还没有 md 文档，没什么可比的。')}`);
    return;
  }

  if (r.problems.length) {
    say(`\n${C.r(`✗ ${r.problems.length} 个对不上：`)}`);
    r.problems.forEach((p) => say(`  - ${p}`));
  }
  if (r.warns.length) {
    say(`\n${C.y(`⚠ ${r.warns.length} 个提醒：`)}`);
    r.warns.forEach((w) => say(`  - ${w}`));
  }
  if (!r.problems.length && !r.warns.length) {
    say(`${C.g('✓ 没发现前后对不上的地方')}`);
  }
  say(`\n${C.dim('给 demo 的功能块加 data-feature="BG-01"，就能自动比对 demo 与 PRD 的覆盖')}`);
  if (r.problems.length) {
    if (JSON_MODE) flushJson(1);
    process.exit(1);
  }
}

/* ===================== 命令：clean（删中间产物，只留 Word） ===================== */
/** 默认留着的 md：变更记录是审计线索，删了就查不到「哪天为什么改」。--all 才删。 */
const CLEAN_KEEP_MD = new Set(['changelog.md']);

/* ===================== 命令：xlsx（Excel 读/写） ===================== */
function cmdXlsx() {
  const sub = argv._[1] || 'read';
  const file = argv._[2] || F.file;

  if (sub === 'sheets' || sub === 'ls') {
    const p = need(file, '请给 xlsx 路径');
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    const { sheets } = readXlsx(abs);
    say(`${C.b(path.basename(abs))} ${C.dim(`共 ${sheets.length} 个 sheet`)}`);
    for (const s of sheets) {
      say(
        `  ${C.c(s.name)}  ${s.rows.length} 行 × ${s.maxCol} 列` +
          (s.hidden ? C.dim('（隐藏）') : '') +
          (s.merges.length ? C.dim(`  合并 ${s.merges.length} 处`) : '')
      );
    }
    jsonOut.result = {
      file: abs,
      sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length, cols: s.maxCol, hidden: s.hidden, merges: s.merges.length })),
    };
    return;
  }

  if (sub === 'read') {
    const p = need(file, '请给 xlsx 路径（pmw xlsx read <file.xlsx>）');
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) fail(`✗ 找不到 ${abs}`);
    const r = xlsxToMarkdown(abs, {
      sheet: F.sheet ?? null,
      maxRows: Number(F['max-rows'] || 300),
    });
    const outFlag = F.out;
    if (outFlag) {
      const outAbs = path.isAbsolute(outFlag) ? outFlag : path.join(process.cwd(), outFlag);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.writeFileSync(outAbs, `<!-- 来源：${abs} ｜ 转换时间 ${stamp()} -->\n\n${r.markdown}\n`, 'utf8');
      say(`${C.g('✓')} ${C.c(outAbs)} ${C.dim(`(${r.markdown.length} 字)`)}`);
      jsonOut.result = { file: abs, out: outAbs, chars: r.markdown.length, sheets: r.picked };
    } else {
      say(r.markdown);
      jsonOut.result = { file: abs, chars: r.markdown.length, sheets: r.picked, markdown: r.markdown };
    }
    return;
  }

  if (sub === 'write') {
    const spec = need(argv._[2], '请给 spec.json 路径');
    const out = need(argv._[3] || F.out, '请给输出路径');
    const specAbs = path.isAbsolute(spec) ? spec : path.join(process.cwd(), spec);
    const outAbs = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
    const s = JSON.parse(fs.readFileSync(specAbs, 'utf8'));
    const r = writeXlsx(outAbs, s);
    say(`${C.g('✓')} ${C.c(r.path)} ${C.dim(`(${(r.bytes / 1024).toFixed(1)} KB · ${r.sheets.join(' / ')} · ${r.rows} 行)`)}`);
    jsonOut.result = r;
    return;
  }

  fail(`✗ 不认识的子命令 ${sub}。可用：sheets / read / write`, 2);
}

/* ===================== 命令：pdf（PDF 读/写） ===================== */
async function cmdPdf() {
  const sub = argv._[1] || 'read';
  const file = argv._[2];

  if (sub === 'read') {
    const p = need(file, '请给 PDF 路径（pmw pdf read <file.pdf>）');
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) fail(`✗ 找不到 ${abs}`);
    let firstPage;
    let lastPage;
    if (F.pages) {
      const [a, b] = String(F.pages).split('-');
      firstPage = Number(a) || undefined;
      lastPage = Number(b) || firstPage;
    }
    const r = await pdfToMarkdown(abs, { firstPage, lastPage });
    const outFlag = F.out;
    if (outFlag) {
      const outAbs = path.isAbsolute(outFlag) ? outFlag : path.join(process.cwd(), outFlag);
      fs.mkdirSync(path.dirname(outAbs), { recursive: true });
      fs.writeFileSync(outAbs, `<!-- 来源：${abs} ｜ 转换时间 ${stamp()} -->\n\n${r.markdown}\n`, 'utf8');
      say(`${C.g('✓')} ${C.c(outAbs)} ${C.dim(`(${r.pages} 页 / ${r.markdown.length} 字)`)}`);
      jsonOut.result = { file: abs, out: outAbs, pages: r.pages, chars: r.markdown.length };
    } else {
      say(r.markdown);
      jsonOut.result = { file: abs, pages: r.pages, chars: r.markdown.length, markdown: r.markdown };
    }
    return;
  }

  if (sub === 'make') {
    const src = need(file, '请给 Markdown 路径（pmw pdf make <file.md>）');
    const srcAbs = path.isAbsolute(src) ? src : path.join(process.cwd(), src);
    if (!fs.existsSync(srcAbs)) fail(`✗ 找不到 ${srcAbs}`);
    const { dir, state } = openState();
    const outFlag = F.out || argv._[3];
    const outAbs = outFlag
      ? path.isAbsolute(outFlag)
        ? outFlag
        : path.join(process.cwd(), outFlag)
      : path.join(dir, DIR_OUTPUT, path.basename(srcAbs, path.extname(srcAbs)) + '.pdf');
    const title = F.title || path.basename(srcAbs, path.extname(srcAbs));
    const r = await markdownToPdf(fs.readFileSync(srcAbs, 'utf8'), outAbs, { title });
    say(`${C.g('✓')} ${C.c(r.path)} ${C.dim(`(${(r.bytes / 1024).toFixed(0)} KB)`)}`);
    jsonOut.result = { ...r, title };
    return;
  }

  if (sub === 'doctor') {
    const bin = findPdfToText();
    say(`pdftotext: ${bin || C.r('✗ 没找到')}`);
    say(C.dim('  ' + (bin ? '读 PDF 靠它（Git for Windows 自带）' : missingPdfHint().split('\n').slice(1).join('\n  '))));
    jsonOut.result = { pdftotext: bin };
    return;
  }

  fail(`✗ 不认识的子命令 ${sub}。可用：read / make / doctor`, 2);
}

/* ===================== 命令：export（导出成 Excel） ===================== */
function cmdExport() {
  const { dir, state } = openState();
  const to = String(F.to || 'xlsx').toLowerCase();
  if (to !== 'xlsx') fail(`✗ 目前只支持 --to xlsx（收到 ${to}）`, 2);

  const s = summarize(dir, state);
  const tasks = state.tasks || [];
  const reviews = state.reviews || [];
  const subs = state.subs || [];
  const TASK_STATUS = { todo: '未开始', doing: '进行中', done: '已完成', blocked: '卡住' };

  const sheets = [];

  // 1) 需求总览
  const overviewRows =
    state.kind === 'project' && subs.length
      ? subs.map((x) => {
          const st = summarize(dir, state);
          return [
            x.id,
            x.title,
            state.title,
            x.module || '—',
            x.batch || '—',
            (x.deps || []).join('、') || '—',
            (x.yxt && x.yxt.no) || '未推',
            x.phase || '—',
          ];
        })
      : [
          [
            state.id,
            state.title,
            state.kind === 'project' ? '大需求' : '小需求',
            s.stageName,
            s.progress,
            s.next || '—',
            [...new Set(reviews.filter((r) => r.status === 'deferred' && r.owner).map((r) => r.owner))].join('、') || '—',
            reviews.filter((r) => r.status !== 'closed').length,
          ],
        ];
  sheets.push({
    name: '需求总览',
    title: `${state.id} ${state.title}`,
    note: `阶段 ${s.stageName}（${s.progress}）· 导出时间 ${stamp()}`,
    columns:
      state.kind === 'project' && subs.length
        ? [
            { header: '子需求编号', width: 14 },
            { header: '标题', width: 34 },
            { header: '所属父需求', width: 22 },
            { header: '模块', width: 10 },
            { header: '批次', width: 8 },
            { header: '前置', width: 16 },
            { header: '研效通', width: 20 },
            { header: '阶段', width: 14 },
          ]
        : [
            { header: '编号', width: 18 },
            { header: '标题', width: 34 },
            { header: '类型', width: 10 },
            { header: '当前阶段', width: 14 },
            { header: '进度', width: 8 },
            { header: '下一步', width: 16 },
            { header: '在等谁', width: 16 },
            { header: '未闭环问题', width: 12 },
          ],
    rows: overviewRows,
  });

  // 2) 任务链
  sheets.push({
    name: '任务链',
    title: '任务链',
    note: `共 ${tasks.length} 条 · 完成 ${tasks.filter((t) => t.status === 'done').length} 条`,
    columns: [
      { header: '编号', width: 8 },
      { header: '任务', width: 40 },
      { header: '所属阶段', width: 16 },
      { header: '状态', width: 10 },
      { header: '负责人', width: 12 },
      { header: '截止', width: 12 },
      { header: '研效通', width: 20 },
      { header: '备注', width: 30 },
    ],
    rows: tasks.map((t) => [
      t.id,
      t.title,
      stageNameOf(state, t.stage),
      TASK_STATUS[t.status] || t.status,
      t.who || '—',
      t.due ? String(t.due).slice(0, 10) : '—',
      t.yxtNo || '—',
      t.note || '—',
    ]),
  });

  // 3) 评审台账
  if (reviews.length) {
    const RSTATUS = { open: '待回答', answered: '已回答', deferred: '已转他人', closed: '已闭环' };
    sheets.push({
      name: '评审台账',
      title: '开发评审问题台账',
      note: `共 ${reviews.length} 条 · 未闭环 ${reviews.filter((r) => r.status !== 'closed').length} 条`,
      columns: [
        { header: '编号', width: 8 },
        { header: '问题', width: 46 },
        { header: '状态', width: 12 },
        { header: '责任人', width: 12 },
        { header: '提出时间', width: 14 },
        { header: '回答/结论', width: 40 },
      ],
      rows: reviews.map((r) => [
        `#${r.id}`,
        r.text,
        RSTATUS[r.status] || r.status,
        r.owner || '—',
        r.at ? String(r.at).slice(0, 10) : '—',
        r.answer || '—',
      ]),
    });
  }

  const outFlag = F.out;
  const outAbs = outFlag
    ? path.isAbsolute(outFlag)
      ? outFlag
      : path.join(process.cwd(), outFlag)
    : path.join(dir, DIR_OUTPUT, `${state.id}-${state.title}-导出-${stampShort()}.xlsx`);

  const r = writeXlsx(outAbs, { sheets });
  say(`${C.g('✓')} ${C.c(r.path)}`);
  say(C.dim(`  ${r.sheets.join(' / ')} · ${r.rows} 行 · ${(r.bytes / 1024).toFixed(1)} KB`));
  jsonOut.result = { ...r, sheets: r.sheets };
}

function stageNameOf(state, key) {
  try {
    const list = state.kind === 'project' ? PROJECT_STAGES : REQ_STAGES;
    const found = list.find((x) => x.key === key);
    return found ? found.name : key || '—';
  } catch {
    return key || '—';
  }
}

/* ===================== 命令：import（从 Excel 批量建模块/子需求） ===================== */
function cmdImport() {
  const from = String(F.from || '').toLowerCase();
  if (from !== 'xlsx') fail('✗ 目前只支持 --from xlsx', 2);
  const p = need(argv._[1] || F.file, '请给 xlsx 路径：pmw import --from xlsx <file.xlsx>');
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  if (!fs.existsSync(abs)) fail(`✗ 找不到 ${abs}`);

  const { dir, state } = openState();
  if (state.kind !== 'project') {
    fail('✗ 只有大需求才需要批量建模块/子需求。小需求直接写 prd.md。', 2);
  }

  const { sheets } = readXlsx(abs);
  const picked = F.sheet ? sheets.find((x) => x.name === String(F.sheet)) : sheets[0];
  if (!picked) fail(`✗ 没有这个 sheet：${F.sheet}`, 2);

  // 找表头行：按「规则优先级 + 排他」识别列，避免「所属模块编号」把 id 列抢走
  const rows = picked.rows;
  let headerIdx = -1;
  let colOf = {};
  // 顺序即优先级：先认模块标题，再认模块编号，最后才认泛化的「编号」
  const RULES = [
    { key: 'moduleTitle', test: /模块.*(标题|名称)|模块需求/ },
    { key: 'moduleId', test: /模块.*编号|模块编号/ },
    { key: 'id', test: /编号|序号|^\s*ID\s*$/i, reject: /模块|父|上级/ },
    { key: 'title', test: /交付项|需求标题|标题|名称|内容/, reject: /模块/ },
    { key: 'batch', test: /批次/ },
    { key: 'deps', test: /前置|依赖/ },
    { key: 'phase', test: /阶段/ },
    { key: 'yxt', test: /研效通|平台编号|REQ/i },
  ];
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const r = rows[i] || [];
    const headers = r.map((c) => String(c ?? ''));
    const guess = {};
    const taken = new Set();
    for (const rule of RULES) {
      for (let ci = 0; ci < headers.length; ci += 1) {
        const v = headers[ci];
        if (!v || taken.has(ci)) continue;
        if (rule.reject && rule.reject.test(v)) continue;
        if (rule.test.test(v)) {
          guess[rule.key] = ci;
          taken.add(ci);
          break;
        }
      }
    }
    if (guess.id !== undefined && guess.title !== undefined) {
      headerIdx = i;
      colOf = guess;
      break;
    }
  }
  if (headerIdx < 0) {
    fail(`✗ 在 ${picked.name} 里没认出表头（需要同时有「编号」和「标题」两列）。可用 --id-col / --title-col 指定列号（从 0 开始）。`, 2);
  }
  for (const [k, flagName] of [
    ['id', 'id-col'],
    ['title', 'title-col'],
    ['module', 'module-col'],
    ['moduleId', 'module-id-col'],
    ['moduleTitle', 'module-title-col'],
    ['batch', 'batch-col'],
    ['deps', 'deps-col'],
    ['phase', 'phase-col'],
    ['yxt', 'yxt-col'],
  ]) {
    if (F[flagName] !== undefined) colOf[k] = Number(F[flagName]);
  }
  // 老参数 --module-col 同时当编号列和标题列
  if (colOf.module !== undefined && colOf.moduleId === undefined && colOf.moduleTitle === undefined) {
    colOf.moduleTitle = colOf.module;
  }

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r && r.some((c) => String(c ?? '').trim()));
  if (!dataRows.length) fail('✗ 表头下面没有数据行', 2);

  const dry = Boolean(F.dry || F['dry-run']);
  const createdModules = [];
  const createdSubs = [];
  const skipped = [];
  let modSeq = (state.modules || []).length;
  const moduleByTitle = new Map();

  // 编号前缀（BG-01 → BG），用来过滤「前置」列里的杂项
  const ID_RE = /^[A-Z]{1,4}-\d+[A-Z]?$/;
  const idPrefix = (() => {
    const first = dataRows.map((r) => String(r[colOf.id] ?? '').trim()).find((x) => ID_RE.test(x));
    return first ? first.replace(/-\d+.*$/, '') : '';
  })();
  const normalizeModId = (raw) => {
    const m = String(raw).match(/(\d+)/);
    return m ? `MOD-${m[1].padStart(2, '0')}` : String(raw).trim();
  };

  for (const r of dataRows) {
    const id = String(r[colOf.id] ?? '').trim();
    const title = String(r[colOf.title] ?? '').trim();
    if (!id || !title) {
      skipped.push({ row: r.slice(0, 3).join(' | '), why: '缺编号或标题' });
      continue;
    }
    if ((state.subs || []).some((s) => s.id === id)) {
      skipped.push({ id, why: '已存在' });
      continue;
    }

    // 模块：优先用「模块编号」+「模块需求标题」两列；只有一列时按标题归并、编号自动分配
    let moduleId = null;
    const modTitleRaw =
      colOf.moduleTitle !== undefined
        ? String(r[colOf.moduleTitle] ?? '').trim()
        : colOf.module !== undefined
          ? String(r[colOf.module] ?? '').trim()
          : '';
    const modIdRaw = colOf.moduleId !== undefined ? String(r[colOf.moduleId] ?? '').trim() : '';
    if (modTitleRaw || modIdRaw) {
      const modTitle = modTitleRaw || modIdRaw;
      const existing = (state.modules || []).find(
        (m) => m.title === modTitle || (modIdRaw && m.id === normalizeModId(modIdRaw))
      );
      if (existing) {
        moduleId = existing.id;
      } else if (moduleByTitle.has(modTitle)) {
        moduleId = moduleByTitle.get(modTitle);
      } else {
        moduleId = modIdRaw ? normalizeModId(modIdRaw) : null;
        if (!moduleId) {
          modSeq += 1;
          moduleId = `MOD-${String(modSeq).padStart(2, '0')}`;
        }
        while ((state.modules || []).some((m) => m.id === moduleId)) {
          if (modIdRaw) {
            // 表里明确给了编号却撞号：加后缀，别悄悄丢数据
            moduleId = `${normalizeModId(modIdRaw)}-2`;
            break;
          }
          modSeq += 1;
          moduleId = `MOD-${String(modSeq).padStart(2, '0')}`;
        }
        state.modules = state.modules || [];
        state.modules.push({ id: moduleId, title: modTitle, path: `modules/${moduleId}` });
        moduleByTitle.set(modTitle, moduleId);
        createdModules.push({ id: moduleId, title: modTitle });
        if (!dry) {
          fs.mkdirSync(path.join(dir, `modules/${moduleId}`, 'subs'), { recursive: true });
          writeIfAbsent(path.join(dir, `modules/${moduleId}`, 'module-prd.md'), tplModulePrd(state, { id: moduleId, title: modTitle }));
        }
      }
    }

    // 前置依赖：只认跟本表编号同前缀的（如 BG-03）；「T-01对应条件」这种备注不算
    const depsRaw = colOf.deps !== undefined ? String(r[colOf.deps] ?? '').trim() : '';
    const deps = depsRaw
      ? depsRaw
          .split(/[、,，;；\s/]+/)
          .map((x) => x.trim().toUpperCase())
          .filter((x) => ID_RE.test(x) && (!idPrefix || x.startsWith(`${idPrefix}-`)))
      : [];
    const batch = colOf.batch !== undefined ? String(r[colOf.batch] ?? '').trim() || null : null;
    const phase = colOf.phase !== undefined ? String(r[colOf.phase] ?? '').trim() || null : null;
    const yxtNo = colOf.yxt !== undefined ? String(r[colOf.yxt] ?? '').trim() || null : null;

    const relPath = moduleId ? `modules/${moduleId}/subs/${id}` : `modules/_unassigned/subs/${id}`;
    const sub = {
      id,
      title,
      module: moduleId,
      path: relPath,
      deps,
      batch,
      phase,
      yxt: { no: yxtNo },
      createdAt: new Date().toISOString(),
      fromImport: rel(dir, abs),
    };
    state.subs = state.subs || [];
    state.subs.push(sub);
    createdSubs.push({ id, title, module: moduleId, batch, deps });
    if (!dry) {
      fs.mkdirSync(path.join(dir, relPath), { recursive: true });
      writeIfAbsent(path.join(dir, relPath, 'prd.md'), tplSubPrd(state, sub));
    }
  }

  if (!dry) {
    log(state, 'import', `${createdSubs.length} 条子需求 / ${createdModules.length} 个模块`);
    save(dir, state);
    syncDocs(dir, state);
  }

  say(`${C.g('✓')} ${dry ? '（预演，没落盘）' : ''}从 ${C.c(path.basename(abs))} → ${picked.name}`);
  say(`  新建模块 ${C.b(createdModules.length)} 个，子需求 ${C.b(createdSubs.length)} 条${skipped.length ? `，跳过 ${skipped.length} 条` : ''}`);
  for (const m of createdModules) say(`  ${C.dim('模块')} ${C.c(m.id)} ${m.title}`);
  const show = createdSubs.slice(0, Number(F.limit || 12));
  for (const s of show) {
    say(`  ${C.dim('子需求')} ${C.c(s.id)} ${s.title}${s.module ? C.dim(` [${s.module}]`) : ''}${s.batch ? C.dim(` ${s.batch}`) : ''}`);
  }
  if (createdSubs.length > show.length) say(C.dim(`  …还有 ${createdSubs.length - show.length} 条，用 pmw ls 或 modules/index.md 看全部`));
  for (const k of skipped) say(`  ${C.y('跳过')} ${k.id || k.row}：${k.why}`);

  jsonOut.result = {
    dry,
    file: abs,
    sheet: picked.name,
    columns: colOf,
    modules: createdModules,
    subs: createdSubs,
    skipped,
  };
}

/* ===================== 命令：sys（系统与账号清单） ===================== */
function systemsFile() {
  return path.join(os.homedir(), '.pm-flow', 'systems.json');
}

function loadSystems() {
  const f = systemsFile();
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function maskSecret(s) {
  if (!s) return '—';
  const v = String(s);
  if (v.length <= 2) return '••';
  return `${v[0]}${'•'.repeat(Math.min(v.length - 2, 8))}${v[v.length - 1]}`;
}

function cmdSys() {
  const sub = argv._[1] || 'list';
  const data = loadSystems();
  if (!data) {
    fail(`✗ 还没配系统清单：${systemsFile()} 不存在。`, 2);
  }
  const list = data.systems || [];

  if (sub === 'list' || sub === 'ls') {
    if (!list.length) {
      say('系统清单是空的。');
      jsonOut.result = { file: systemsFile(), systems: [] };
      return;
    }
    say(`${C.b('系统清单')} ${C.dim(`（${systemsFile()}）`)}`);
    for (const s of list) {
      const envs = s.envs || [];
      say(`\n${C.c(s.name)}${s.key ? C.dim(`  [${s.key}]`) : ''}${s.what ? C.dim(`  ${s.what}`) : ''}`);
      for (const e of envs) {
        const who = e.user ? `  ${C.dim('账号')} ${e.user}` : '';
        const note = e.note ? C.dim(`  ${e.note}`) : '';
        say(`  ${String(e.env || '—').padEnd(4)} ${e.url || '—'}${who}${note}`);
      }
    }
    if (data.portal && data.portal.length) {
      say(`\n${C.b('入口')}`);
      for (const e of data.portal) say(`  ${e.name}：${e.url}${e.note ? C.dim(`  ${e.note}`) : ''}`);
    }
    jsonOut.result = { file: systemsFile(), systems: list, portal: data.portal || [] };
    return;
  }

  if (sub === 'show') {
    const key = need(argv._[2] || F.key, '请给系统名或 key：pmw sys show <key>');
    const s = list.find((x) => x.key === key || x.name === key || (x.name || '').includes(key));
    if (!s) fail(`✗ 没有这个系统：${key}（有：${list.map((x) => x.key || x.name).join(' / ')}）`, 2);
    const reveal = Boolean(F.reveal);
    say(`${C.b(s.name)}${s.key ? C.dim(`  [${s.key}]`) : ''}`);
    if (s.what) say(`  ${C.dim('管什么')} ${s.what}`);
    if (s.owner) say(`  ${C.dim('找谁')} ${s.owner}`);
    for (const e of s.envs || []) {
      say(`  ${String(e.env || '—')}  ${e.url || '—'}`);
      if (e.user) say(`    ${C.dim('账号')} ${e.user}   ${C.dim('密码')} ${reveal ? e.pass || '—' : maskSecret(e.pass)}`);
      if (e.note) say(`    ${C.dim('说明')} ${e.note}`);
    }
    if (s.notes) say(`  ${C.dim('备注')} ${s.notes}`);
    if (!reveal && (s.envs || []).some((e) => e.pass)) {
      say(C.dim('\n密码默认遮住。真要登录时再加 --reveal（会打印明文，注意别把输出贴到外面）。'));
    }
    jsonOut.result = { ...s, revealed: reveal };
    return;
  }

  if (sub === 'open') {
    const key = need(argv._[2] || F.key, '请给系统名：pmw sys open <key> [--env UAT]');
    const s = list.find((x) => x.key === key || x.name === key || (x.name || '').includes(key));
    if (!s) fail(`✗ 没有这个系统：${key}`, 2);
    const envs = s.envs || [];
    const want = F.env ? envs.find((e) => e.env === String(F.env)) : envs[0];
    if (!want) fail(`✗ ${s.name} 没有这个环境：${F.env}（有：${envs.map((e) => e.env).join(' / ')}）`, 2);
    say(`${want.url}`);
    jsonOut.result = { system: s.name, env: want.env, url: want.url };
    return;
  }

  fail(`✗ 不认识的子命令 ${sub}。可用：list / show / open`, 2);
}

function cmdClean() {
  const { dir, state } = openState();
  const dry = Boolean(F.dry || F['dry-run']);
  const hard = Boolean(F.all);
  const outDir = path.join(dir, DIR_OUTPUT);

  // 没有 Word 就不许删：md 是唯一还能改的源，删了等于把这版需求弄丢
  let docxCount = 0;
  try {
    docxCount = fs.readdirSync(outDir).filter((f) => /\.docx$/i.test(f)).length;
  } catch {
    /* 没有产物目录 */
  }
  if (!docxCount) {
    fail(`✗ ${DIR_OUTPUT}/ 里还没有 Word。先跑 pmw publish 再清理——不然 md 删掉就什么都没了`);
  }

  const targets = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === DIR_OUTPUT || e.name === 'demo' || e.name === 'node_modules') continue;
        walk(p, depth + 1);
        continue;
      }
      if (!/\.md$/i.test(e.name)) continue;
      if (!hard && CLEAN_KEEP_MD.has(e.name)) continue;
      targets.push(p);
    }
  };
  walk(dir, 0);

  const removed = [];
  const failed = [];
  for (const p of targets) {
    if (!dry) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        failed.push({ path: rel(dir, p), error: e.message });
        continue;
      }
    }
    removed.push(rel(dir, p));
  }

  if (!removed.length && !failed.length) {
    say(`${C.g('✓')} 没有需要清理的中间文件`);
  } else {
    say(`${dry ? C.y('（试运行，没真删）') : C.g('✓')} 清理 ${removed.length} 个中间文件`);
    for (const r of removed) say(`  ${C.dim('-')} ${r}`);
  }
  for (const f of failed) sayErr(`  ✗ ${f.path}：${f.error}`);
  if (removed.length) {
    say(`\n保留：${C.c(`${DIR_OUTPUT}/ 里的 Word`)}、${C.c('req.json / project.json')}（状态）${hard ? '' : `、${C.c('changelog.md')}（变更记录）`}`);
    say(C.dim('要再改需求：把 Word 转回 md（pmw digest <docx>）改完重新 publish。'));
  }

  jsonOut.result = {
    action: 'clean',
    dry,
    hard,
    removed,
    failed,
    kept: state.kind,
    outputDir: DIR_OUTPUT,
  };
}

/* ===================== 分发 ===================== */
/* ===================== 命令：reflect（自我反思循环） ===================== */
/**
 * 为什么要有这个东西：
 * `check` / `lint` 是规则校验——它能查「字段名不一致」「验收没写」这类硬伤，
 * 但查不了「这段规则其实我自己也没想清楚」。
 * 反思循环补的正是这一层：逼着在推进阶段前，拿产出物去回答几个具体问题，
 * 每条回答不上来的都要么改稿、要么显式记成「就这样吧 + 理由」。
 *
 * 谁发起：
 *   --by ai    模型自己觉得不稳，主动开一轮（默认）
 *   --by human 用户说「你先自己挑挑毛病」
 * 两者走同一套记录，只是留痕不同。
 */
function cmdReflect() {
  const sub = argv._[1] || 'status';
  const { dir, state } = openState();
  const r = state.reflect && !state.reflect.closedAt ? state.reflect : null;

  /* ---- reflect start ---- */
  if (sub === 'start') {
    if (r) {
      say(`${C.y('已经有一轮反思在进行')}：第 ${r.round} 轮（${stageOf(state.kind, r.stage).name}）`);
      say(C.dim(`先 pmw reflect close，或者 pmw reflect add "又发现一个问题"`));
      jsonOut.result = { action: 'start', reused: true, reflect: r };
      return;
    }
    const prev = state.reflect?.round || 0;
    const round = prev + 1;
    state.reflect = {
      round,
      stage: state.stage,
      focus: F.focus || '',
      by: F.by || 'ai',
      role: F.role || 'self',
      at: new Date().toISOString(),
      findings: [],
    };
    log(state, 'reflect:start', `第 ${round} 轮反思（${state.stage}）${F.focus ? `：${F.focus}` : ''}`);
    save(dir, state);
    const prompts = reflectPromptsOf(state.stage);
    say(`${C.b(`第 ${round} 轮反思`)} ${C.dim(`阶段：${stageOf(state.kind, state.stage).name}${F.focus ? ` / 聚焦：${F.focus}` : ''}`)}\n`);
    say(C.dim('拿这份产出物，逐条回答下面的问题。答不上来的，加进台账：'));
    say(C.dim('  pmw reflect add "问题描述" --where "规则表第 3 行"\n'));
    prompts.forEach((p, i) => {
      say(`${String(i + 1).padStart(2)}. ${p.q}`);
      say(`    ${C.dim(`好的答案：${p.hint}`)}`);
    });
    say(`\n${C.dim('最后 pmw reflect close（有没处理的会拦一下，确认没问题可以 --force）')}`);
    jsonOut.result = { action: 'start', round, stage: state.stage, focus: F.focus || '', prompts };
    return;
  }

  if (!state.reflect) {
    fail('还没有开过反思。先 pmw reflect start', 2);
  }
  const cur = state.reflect;

  /* ---- reflect add ---- */
  if (sub === 'add') {
    const text = need(argv._[2], '请描述问题：pmw reflect add "规则表第 3 行算不出算例"');
    const id = (cur.findings || []).reduce((m, f) => Math.max(m, f.id || 0), 0) + 1;
    cur.findings = cur.findings || [];
    cur.findings.push({
      id,
      text,
      sev: F.sev === 'soft' ? 'soft' : F.hard ? 'hard' : 'soft',
      where: F.where || '',
      status: 'open',
      at: new Date().toISOString(),
      by: who(),
    });
    log(state, 'reflect:add', `#${id} ${text}`);
    save(dir, state);
    const open = cur.findings.filter((f) => f.status === 'open').length;
    say(`${C.g('✓')} 反思问题 #${id}：${text}${F.where ? C.dim(`（${F.where}）`) : ''}`);
    say(C.dim(`未处理 ${open} 条`));
    jsonOut.result = { action: 'add', id, text, open, round: cur.round };
    return;
  }

  /* ---- reflect fix / keep ---- */
  if (sub === 'fix' || sub === 'keep') {
    const arg = need(argv._[2], `请给编号：pmw reflect ${sub} 1`);
    const targets = arg === 'all'
      ? cur.findings.filter((f) => f.status === 'open')
      : cur.findings.filter((f) => f.id === Number(arg));
    if (!targets.length) fail(`没有编号为 ${arg} 的未处理问题`, 2);
    if (sub === 'keep' && !F.reason) fail('keep 要说明理由：pmw reflect keep 2 --reason "这条本期不做"', 2);
    for (const f of targets) {
      f.status = sub === 'fix' ? 'fixed' : 'kept';
      f.resolvedAt = new Date().toISOString();
      f.resolvedBy = who();
      if (sub === 'keep') f.reason = F.reason;
    }
    log(state, `reflect:${sub}`, targets.map((f) => `#${f.id}`).join('、'));
    save(dir, state);
    const open = cur.findings.filter((f) => f.status === 'open').length;
    say(`${C.g('✓')} ${sub === 'fix' ? '已改掉' : '已接受'} ${targets.length} 条，还剩 ${open} 条`);
    jsonOut.result = { action: sub, count: targets.length, open, round: cur.round };
    return;
  }

  /* ---- reflect close ---- */
  if (sub === 'close') {
    const open = (cur.findings || []).filter((f) => f.status === 'open');
    if (open.length && !F.force) {
      fail(`${C.r(`✗ 还有 ${open.length} 条没处理，不能收尾：`)}\n${open.map((f) => `  #${f.id} ${f.text}`).join('\n')}\n${C.dim('改完了 pmw reflect fix <编号>，不打算改就 pmw reflect keep <编号> --reason "…"，确实要放着 pmw reflect close --force')}`);
    }
    cur.closedAt = new Date().toISOString();
    cur.verdict = F.note || (open.length ? `强制关闭，遗留 ${open.length} 条` : '通过');
    log(state, 'reflect:close', `第 ${cur.round} 轮：${(cur.findings || []).length} 条，遗留 ${open.length} 条`);
    save(dir, state);
    say(`${C.g('✓')} 第 ${cur.round} 轮反思已收尾：共 ${(cur.findings || []).length} 条，遗留 ${open.length} 条`);
    jsonOut.result = { action: 'close', round: cur.round, total: (cur.findings || []).length, left: open.length };
    return;
  }

  /* ---- reflect status（默认） ---- */
  const findings = cur.findings || [];
  const open = findings.filter((f) => f.status === 'open');
  say(`${C.b(`第 ${cur.round} 轮反思`)} ${C.dim(`${stageOf(state.kind, cur.stage).name} · 发起 ${cur.by === 'human' ? '用户' : 'AI'}${cur.focus ? ` · 聚焦 ${cur.focus}` : ''}`)}`);
  if (!findings.length) say(C.dim('还没有记录任何问题'));
  for (const f of findings) {
    const tag = f.status === 'open' ? C.y('待处理') : f.status === 'fixed' ? C.g('已改') : C.dim('已接受');
    say(`  #${f.id} [${tag}] ${f.text}${f.where ? C.dim(`（${f.where}）`) : ''}${f.reason ? C.dim(` — ${f.reason}`) : ''}`);
  }
  say(`\n${C.dim(`共 ${findings.length} 条，未处理 ${open.length} 条`)}`);
  jsonOut.result = { action: 'status', round: cur.round, stage: cur.stage, findings, open: open.length };
}
/* ===================== 命令：reroute（自动改路线） ===================== */
/**
 * 什么时候该改路线，不该硬走：
 * 这些信号单看都不致命，凑在一起就是「这条路已经走不通了」。
 * 提议不自动执行——路线是人的判断，工具只负责把证据摆出来。
 */
function rerouteProposals(dir, state) {
  const out = [];
  const hist = state.history || [];
  const s = summarize(dir, state);
  const openReviews = (state.reviews || []).filter((x) => x.status !== 'closed');
  const deferred = openReviews.filter((x) => x.status === 'deferred');
  const blockers = (state.blockers || []).filter((b) => !b.resolvedAt);
  const backs = hist.filter((h) => h.action === 'back');
  const enteredAt = stageEnteredAt(state);
  const stuckDays = daysSince(enteredAt);
  const prev = (() => {
    const list = stagesOf(state.kind);
    const i = stageIndex(state.kind, state.stage);
    return i > 0 ? list[i - 1].key : null;
  })();

  if (backs.length >= 2) {
    const early = state.kind === 'project' ? 'P3_MASTER_PRD' : 'S3_PRD';
    out.push({
      kind: 'goto',
      target: early,
      title: `退回 PRD 阶段重写，而不是在第 ${backs.length} 次返工时继续补丁`,
      why: `这个需求已经退回过 ${backs.length} 次（${backs.map((h) => (h.note || '').split('→')[0].trim()).join('、')}）。反复返工通常不是执行问题，是 PRD 本身没定住。`,
      evidence: backs.slice(-3).map((h) => `${h.at.slice(0, 10)} ${h.note}`),
    });
  }

  // 注意：只数「人加的活」，模板任务不算——模板任务数量只反映主线长度，不反映复杂度
  const realTasks = (state.tasks || []).filter((t) => t.from !== 'tpl');
  if (state.kind === 'req' && (openReviews.length > 5 || realTasks.length > 12 || (state.modules || []).length > 0)) {
    out.push({
      kind: 'kind',
      target: 'project',
      title: '这其实是个大需求，建议切到大需求主线',
      why: `当前按小需求在跑，但已有 ${openReviews.length} 条未闭环评审、${realTasks.length} 条实际任务${(state.modules || []).length ? `、${(state.modules || []).length} 个模块` : ''}。小需求主线没有「拆模块 / 模块 PRD」这两步，硬走下去会漏掉分模块交付。`,
      evidence: [`未闭环评审 ${openReviews.length}`, `实际任务 ${realTasks.length}`, `模块 ${(state.modules || []).length}`],
    });
  }

  if (deferred.length >= 2 && deferred.length * 2 >= openReviews.length) {
    const align = state.kind === 'project' ? 'P2_DISCOVERY' : 'S2_ALIGN';
    out.push({
      kind: 'goto',
      target: align,
      title: '回去跟业务重新对齐，别在评审阶段硬答',
      why: `${openReviews.length} 条未闭环里有 ${deferred.length} 条挂着等业务确认——超过一半了。继续往下走，等于把不确定性带给开发。`,
      evidence: deferred.slice(0, 5).map((x) => `#${x.id} ${x.text}（${x.owner || '业务'}）`),
    });
  }

  if (blockers.length && /UAT/.test(state.stage)) {
    const backTo = state.kind === 'project' ? 'P9_BUILD' : 'S7_BUILD';
    out.push({
      kind: 'back',
      target: backTo,
      title: 'UAT 卡住了，退回开发阶段而不是继续验收',
      why: `验收阶段还有 ${blockers.length} 个卡点没解。这个阶段解不了卡点，只能等；退回去让开发先修，比挂着「验收中」更诚实。`,
      evidence: blockers.map((b) => b.text),
    });
  }

  if (stuckDays >= (DEFAULT_THRESHOLDS.stale || 5) && prev) {
    out.push({
      kind: 'goto',
      target: prev,
      title: `在这个阶段停了 ${stuckDays} 天，回上一步确认输入是否齐`,
      why: `「${s.stageName}」已经停滞 ${stuckDays} 天。停住通常不是这一步难，是上一步该给的东西没给全。`,
      evidence: [`进入时间 ${enteredAt.slice(0, 10)}`, `现在 ${s.progress} ${s.stageName}`],
    });
  }

  if (state.kind === 'project' && (state.subs || []).length && ['P5_MODULE_PRD', 'P6_DEMO', 'P7_PUBLISH'].includes(state.stage)) {
    const noPrd = (state.subs || []).filter((x) => !fs.existsSync(path.join(dir, 'modules', x.module || '', 'subs', x.id, 'prd.md')));
    if (noPrd.length === (state.subs || []).length) {
      out.push({
        kind: 'goto',
        target: 'P5_MODULE_PRD',
        title: '一条子需求 PRD 都还没写，先补模块 PRD',
        why: `${noPrd.length} 条子需求全都没有 prd.md。这个阶段（${s.stageName}）依赖模块 PRD，空着往下走只会返工。`,
        evidence: noPrd.slice(0, 6).map((x) => x.id),
      });
    }
  }

  return out.map((p, i) => ({ id: i + 1, ...p }));
}

function cmdReroute() {
  const sub = argv._[1] || 'suggest';
  const { dir, state } = openState();

  if (sub === 'suggest' || sub === 'list') {
    const props = rerouteProposals(dir, state);
    state.reroute = { at: new Date().toISOString(), by: who(), proposals: props };
    log(state, 'reroute:suggest', `${props.length} 条建议`);
    save(dir, state);
    if (!props.length) {
      say(`${C.g('路线没问题')} ${C.dim('没发现需要改路线的信号。')}`);
      jsonOut.result = { action: 'suggest', total: 0, proposals: [] };
      return;
    }
    say(`${C.b(`发现 ${props.length} 处路线问题`)}\n`);
    for (const p of props) {
      say(`${C.y(`[${p.id}] ${p.title}`)}`);
      say(`    ${p.why}`);
      say(`    ${C.dim(`依据：${p.evidence.join(' / ')}`)}`);
      say(`    ${C.dim(`动作：pmw reroute apply ${p.id}（等于 pmw ${p.kind === 'kind' ? `kind ${p.target}` : `${p.kind} ${p.target}`}）`)}\n`);
    }
    jsonOut.result = { action: 'suggest', total: props.length, proposals: props };
    return;
  }

  if (sub === 'apply') {
    const id = Number(need(argv._[2], '请给编号：pmw reroute apply 1'));
    const props = state.reroute?.proposals || [];
    const p = props.find((x) => x.id === id);
    if (!p) fail(`没有编号 ${id} 的建议。先 pmw reroute suggest 生成一次。`, 2);
    log(state, 'reroute:apply', `#${id} ${p.kind} ${p.target}：${p.title}`, who());
    save(dir, state);
    say(`${C.b('执行改路线')}：${p.title}\n`);
    if (p.kind === 'kind') {
      argv._ = ['kind', p.target];
      cmdKind();
    } else {
      argv._ = [p.kind, p.target];
      if (p.kind === 'goto') cmdGoto();
      else cmdBack();
    }
    return;
  }

  if (sub === 'dismiss') {
    const id = Number(need(argv._[2], '请给编号：pmw reroute dismiss 1'));
    const props = state.reroute?.proposals || [];
    const p = props.find((x) => x.id === id);
    if (!p) fail(`没有编号 ${id} 的建议`, 2);
    p.dismissed = true;
    p.dismissReason = F.reason || '';
    log(state, 'reroute:dismiss', `#${id}${F.reason ? `：${F.reason}` : ''}`);
    save(dir, state);
    say(`${C.g('✓')} 已忽略 #${id}`);
    jsonOut.result = { action: 'dismiss', id };
    return;
  }

  fail(`未知子命令 reroute ${sub}（可用：suggest / apply / dismiss / list）`, 2);
}
/* ===================== 命令：since / ack（知道被谁改了什么） ===================== */
function fmtLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function cmdSince() {
  const { dir, state } = openState();
  const hist = state.history || [];
  let rows = hist;
  if (F.minutes) {
    const cut = Date.now() - Number(F.minutes) * 60000;
    rows = hist.filter((h) => new Date(h.at).getTime() >= cut);
  } else if (F.since) {
    rows = hist.filter((h) => h.at > String(F.since));
  } else if (F['last-ai'] || !F.all) {
    const seen = state.aiSeenAt || null;
    rows = seen ? hist.filter((h) => h.at > seen) : hist.slice(-10);
  }
  if (F.by) rows = rows.filter((h) => (h.by || 'ai') === F.by);

  if (F.ack) {
    state.aiSeenAt = new Date().toISOString();
    save(dir, state);
  }

  if (!rows.length) {
    say(`${C.g('没有新改动')}${state.aiSeenAt ? C.dim(`（上次查看 ${fmtLocal(state.aiSeenAt)}）`) : ''}`);
    jsonOut.result = { action: 'since', total: 0, changes: [], acked: Boolean(F.ack) };
    return;
  }
  const userCount = rows.filter((h) => h.by === 'user').length;
  say(`${C.b(`${rows.length} 条改动`)}${userCount ? C.y(`，其中 ${userCount} 条是用户手动改的`) : ''}\n`);
  for (const h of rows.slice(-40)) {
    const tag = h.by === 'user' ? C.y('用户') : C.dim('  AI');
    say(`${tag} ${C.dim(fmtLocal(h.at))}  ${h.action}  ${h.note}`);
  }
  jsonOut.result = {
    action: 'since',
    total: rows.length,
    byUser: userCount,
    changes: rows.slice(-40).map((h) => ({ at: h.at, by: h.by || 'ai', action: h.action, note: h.note })),
    acked: Boolean(F.ack),
  };
}

function cmdAck() {
  const { dir, state } = openState();
  const before = changesSinceAI(state);
  log(state, 'ack', `已确认 ${before.total} 条改动`, who());
  // 用这条 ack 自身的时间戳当水位：这样它不会把自己也算成「新改动」
  state.aiSeenAt = state.lastAt;
  save(dir, state);
  say(`${C.g('✓')} 已记下：看过 ${before.total} 条改动${before.byUser ? C.dim(`（含用户手动 ${before.byUser} 条）`) : ''}`);
  jsonOut.result = { action: 'ack', acked: before.total, byUser: before.byUser };
}

function cmdSetup() {
  const sub = argv._[1] || 'status';
  if (sub === 'status') {
    const settings = readSettings();
    jsonOut.result = { settings, complete: setupComplete(settings), file: settingsFile() };
    say(setupComplete(settings) ? '本地配置已完成。' : '本地配置尚未完成，请配置需求目录和集成选项。');
    return;
  }
  if (sub !== 'set') fail('用法：setup status 或 setup set --workspace <目录> --yxt on|off --obsidian on|off');
  const patch = {};
  if (F.workspace !== undefined) {
    if (typeof F.workspace !== 'string' || !path.isAbsolute(F.workspace)) fail('需求目录必须是已存在的绝对路径。');
    const dir = path.resolve(F.workspace);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail('需求目录不存在，请先创建或选择已有目录。');
    patch.root = dir;
  }
  for (const [flag, key] of [['yxt', 'yanxiaotong'], ['obsidian', 'obsidian']]) {
    if (F[flag] === undefined) continue;
    if (!['on', 'off'].includes(F[flag])) fail(`${flag} 必须为 on 或 off。`);
    patch[key] = F[flag] === 'on';
  }
  if (!Object.keys(patch).length) fail('请提供要修改的配置。');
  const settings = saveSettings(patch);
  jsonOut.result = { settings, complete: setupComplete(settings), file: settingsFile() };
  say('本地配置已保存。');
}

const table = {
  setup: cmdSetup,
  init: cmdInit,
  status: cmdStatus,
  today: cmdToday,
  brief: cmdBrief,
  flow: cmdFlow,
  next: cmdNext,
  advance: cmdAdvance,
  goto: cmdGoto,
  back: cmdBack,
  kind: cmdKind,
  block: cmdBlock,
  unblock: cmdUnblock,
  review: cmdReview,
  task: cmdTask,
  taskflow: cmdTaskflow,
  'add-module': cmdAddModule,
  'add-sub': cmdAddSub,
  split: cmdSplit,
  check: cmdCheck,
  lint: cmdLint,
  'sync-docs': cmdSyncDocs,
  digest: cmdDigest,
  doc: cmdDoc,
  publish: cmdPublish,
  clean: cmdClean,
  pushed: cmdPushed,
  ls: cmdLs,
  board: cmdBoard,
  history: cmdHistory,
  where: cmdWhere,
  note: cmdNote,
  xlsx: cmdXlsx,
  pdf: cmdPdf,
  export: cmdExport,
  import: cmdImport,
  sys: cmdSys,
  yxt: cmdYxt,
  reflect: cmdReflect,
  reroute: cmdReroute,
  since: cmdSince,
  ack: cmdAck,
  guide: cmdGuide,
  help: help,
};

const fn = table[cmd];
if (!fn) {
  sayErr(`✗ 未知命令 ${cmd}\n`);
  help();
  flushJson(2);
}

/** --json 模式：把收集到的结果作为唯一 stdout 输出 */
function flushJson(exitCode) {
  if (!JSON_MODE) return;
  if (jsonOut.error) jsonOut.ok = false;
  plainLog(JSON.stringify(jsonOut, null, 2));
  process.exit(exitCode ?? (jsonOut.ok === false ? 1 : 0));
}

try {
  await fn();
  flushJson(0);
} catch (e) {
  if (e && e.code === 'ENOENT') {
    sayErr(`✗ 找不到文件/目录：${e.path || e.message}`);
    flushJson(1);
  }
  sayErr(`✗ ${e.message}`);
  flushJson(1);
}
void execFileSync;
