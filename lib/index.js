/**
 * dsh-pm-flow —— 产品经理工作流插件（Host 端）
 *
 * 注册三样东西：
 *   1. 工具 `pm_flow`     —— 模型直接调用，背后是 tools/pmw.mjs --json
 *   2. 技能 `pm-flow`     —— 运行时注入 SKILL.md，告诉模型怎么走这套流程
 *   3. 命令 `/pmw`        —— 人手动敲，例如 /pmw today
 *
 * 设计要点：
 *   · 状态机的唯一事实来源是 tools/lib/state.mjs，不是这里的提示词。
 *   · 所有状态落盘由一个 Node 子进程（pmw.mjs --json）完成，插件只做编排与渲染，
 *     这样 CLI 能独立跑、能单独测，插件坏了不影响数据。
 *   · 每个工具结果都带 `mermaid` 字段，模型直接贴进对话就是进度图。
 */
import path from "node:path";
import fs from "node:fs";
import { readSettings } from "../tools/lib/settings.mjs";
import { fileURLToPath } from "node:url";
import { ROLES, ROLES_DIR, loadRoleDoc, loadOverview, domainSkillDefinition, skillDefinitionFor, buildDelegationPrompt, rolesTable } from "./roles.js";
import { Browser, findChrome, probe, launch } from "./browser/session.js";
import { BROWSER_TOOL_NAME, BROWSER_DESCRIPTION, BROWSER_PARAMETERS, BROWSER_ACTIONS, looksDangerous } from "./browser/tool.js";
import {
  SH_TOOL_NAME,
  SH_DESCRIPTION,
  SH_PARAMETERS,
  validateArgs as validateShArgs,
  looksDangerous as looksDangerousSh,
  renderResult as renderSh,
} from "./sh/tool.js";
import { findBash, missingBashHint, runScript, startJob, getJob, listJobs, stopJob, diagnose } from "./sh/runner.js";
import { renderGraph, archifyAvailable } from "./graph.js";
import {
  OBSIDIAN_TOOL_NAME,
  OBSIDIAN_DESCRIPTION,
  OBSIDIAN_PARAMETERS,
  OBSIDIAN_OUTPUT_SCHEMA,
  renderObsidian,
} from "./obsidian/tool.js";
import { runObsidianAction } from "./obsidian/run.js";

export const name = "pm-flow";

/** subprocess 用来起 pmw.mjs；tools / skills / commands 都走 ctx.inject 延迟拿。 */
export const inject = ["subprocess"];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const PMW = path.join(PACKAGE_ROOT, "tools", "pmw.mjs");

/* ===================== 命令表 ===================== */

/** 只读命令：不改状态。 */
const READ_COMMANDS = [
  "setup",
  "status",
  "today",
  "brief",
  "next",
  "flow",
  "taskflow",
  "task",
  "ls",
  "board",
  "check",
  "lint",
  "history",
  "where",
  "guide",
  "help",
  "xlsx",
  "pdf",
  "sys",
  "export",
  "reflect",
  "reroute",
  "since",
];

/** 改状态的命令：需要位置参数或 flag，schema 里用 args 数组原样透传。 */
const WRITE_COMMANDS = [
  "init",
  "kind",
  "advance",
  "goto",
  "back",
  "block",
  "unblock",
  "review",
  "task",
  "add-module",
  "add-sub",
  "split",
  "sync-docs",
  "digest",
  "doc",
  "publish",
  "clean",
  "pushed",
  "yxt",
  "import",
  "reflect",
  "reroute",
  "ack",
];

const ALL_COMMANDS = [...new Set([...READ_COMMANDS, ...WRITE_COMMANDS])];

const TOOL_DESCRIPTION = `产品经理工作流的唯一入口。管住一个需求从收料到验收的全过程，状态持久化在需求工作区里。

**一个需求 = 一个工作区目录**（默认父目录：桌面\\文档）。你自己建目录、把背景材料放进去，然后对它说「这个需求开始走流程」，
状态就落在该目录根上，材料和产出平铺在一起。

两条主线：
· 大需求（新建/重构系统）11 段：收料 → 需求梳理与业务对齐 → 总 PRD → 拆模块/拆子需求 → 模块 PRD → Demo 原型 → 发布到研效通+企微 → 开发评审 → 开发中+改动说明 → UAT/SIT 验收 → 完成
· 小需求（加字段/小改）9 段：收料 → 业务对齐 → PRD → 开发评审 → 定稿 → 发布 → 开发中 → UAT/SIT 验收 → 完成

常用：
· brief   巡检：谁手上压了几天 / 卡点挂了多久 / 哪个需求停着不动（该主动找人的时候先看它）
· today   今天该干什么（最省心，不确定用什么就用这个）
· board   看板：所有正在跟进的需求，各自阶段进度 / 本阶段任务完成度 / 挂在别人手上的事
· status  看现在在哪一段 + Mermaid 流程图 + 还差什么（返回值里有 mermaid 字段，原样贴给用户）
· next    当前阶段还差哪几项才能推进
· init    开新需求。**已在需求目录里（材料已放好）时用 init --here**，不要另建子目录
· advance 过门禁进下一段（门禁不过会失败并说明原因）
· review  开发评审问题台账：add / list / answer / defer / close。答不了的用 defer 转业务确认
· task    任务链路：list 看清单 / add 加临时任务 / done·reopen·doing·block 改状态 / who 改「找谁确认」/ branch 挂支线 / branches 按支线看 / pending 按人汇总 / seed 补标准任务。**对话里推进了事情就顺手改状态**
· taskflow 只出本阶段任务链路图（按支线展开，标 ✓▶○✗ 和 @负责人）
· block   记卡点；unblock 解除
· add-module / add-sub / split  建模块和子需求（大需求用）
· check   校验总 PRD ↔ 模块 PRD ↔ 子需求是否对得上
· lint    一致性体检：字段叫法统一了吗 / 规则有没有验收覆盖 / demo 与 PRD 对得上吗（写 PRD 时顺手跑一次）
· yxt     研效通：读取原始需求 / 检查故事卡和故事点 / 推任务 / 传 demo / 建缺陷（pmw yxt doctor 先自检）
· digest  把 .docx（会议纪要、业务文档）转成 Markdown 放进 原材料/；**不给参数时递归扫整个工作区**。加 --extract 会把纪要里的「待确认/待办」抽成任务和待确认项
· doc      Markdown → Word（正式文稿，含目录/页眉页脚/页码/合并单元格/图片）
· publish  Markdown → Word 打包到 产物/ + 生成发布清单（交给研效通的 create-from-doc 用）
· clean    删掉工作区里的中间 md，只留 产物/ 里的 Word（--dry 先看要删什么，--all 连 changelog 一起删）
· guide   当前阶段的写作指引（写 PRD 前先取一次）

支线（branch）只有两种分法：按模块/子需求（BG-01）、按场景（正常流程/导入失败/权限不足）。
会议纪要导入后可立即 --extract，抽不全的自己 task add 补。

重要限制：研效通开放 API 不支持设置上级需求、不支持传附件。建完需求后必须提醒用户去 Web 界面手工设上级并上传 Word。

---

## 六个角色（分工合作时用）

**默认入口是 Rester（调度）**：用户说的话没有明确指向某个具体产出时，先按 Rester 的规矩判断——小事自己用上面的命令干，大事才派角色。

| 角色 | 什么时候派 |
| --- | --- |
| Recorder · 收料 | 刚丢进来一堆材料、需要把一件事摸清楚 |
| Writer · 写 PRD | 要写/改 PRD、要拆模块 |
| Maker · 做 Demo | 要做/改原型页面 |
| Shouter · 应询 | 开发来质疑、要给答复 |
| Tester · 挑错 | 要检查 PRD 与 demo 对不对得上 |
| Rester · 调度 | 其余一切（看状态、记账、推进、推研效通） |

派活用 \`pm_role\` 工具：\`{ action: "delegate", role: "recorder", dir: "<项目绝对路径>", task: "<一句话具体任务>" }\`。
它会返回一段提示词，把它原样交给 subagent 即可；也可以 \`{ action: "prompt", role: "writer", ... }\` 先看提示词再决定派不派。
看全体名单：\`{ action: "list" }\`。`;

const PARAMETERS = {
  command: {
    type: "string",
    enum: ALL_COMMANDS,
    description: "要执行的子命令。不确定就用 today。",
  },
  args: {
    type: "array",
    items: { type: "string" },
    description:
      "原样透传给 CLI 的位置参数与 flag。例：review add \"金额列能填负数吗\" --who 张三 → [\"review\",\"add\",\"金额列能填负数吗\",\"--who\",\"张三\"] 时，command 填 review，args 填 [\"add\",\"金额列能填负数吗\",\"--who\",\"张三\"]。",
  },
  dir: {
    type: "string",
    description: "需求工作区的绝对路径（一个目录 = 一个需求）。省略时按 PMF_DIR 环境变量、或当前只有一个需求时自动用它。",
  },
  root: {
    type: "string",
    description: "装需求的父目录（默认 桌面\\文档）。只在 init 新建子目录 / board / ls 全局视图下有用。",
  },
};

/* ===================== 输出 schema ===================== */

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean", description: "命令是否成功" },
    command: { type: "string" },
    error: { type: "string", description: "失败原因（ok=false 时）" },
    mermaid: {
      type: "string",
      description: "Mermaid flowchart 源码。有就原样贴给用户，这是用户看进度的唯一方式。",
    },
    result: {
      type: "object",
      additionalProperties: true,
      description: "该命令的结构化结果，字段随命令不同（status 是摘要，review 是台账，check 是问题列表…）",
    },
    exitCode: { type: "number", description: "CLI 退出码" },
    stderr: { type: "string", description: "CLI 的错误输出（若有）" },
  },
};

/* ===================== 渲染 ===================== */

function renderHuman(value) {
  const lines = [];
  const res = value?.result;

  if (value?.ok === false) {
    lines.push(`✗ ${value.error || "命令失败"}`);
    if (value?.mermaid) {
      lines.push("", "```mermaid", value.mermaid, "```");
    }
    return lines.join("\n");
  }

  // status / today / advance / next 都带摘要
  if (res && typeof res === "object" && res.id && res.stageName) {
    lines.push(`**${res.id} ${res.title}** ${res.progress || ""} — 当前：${res.stageName}`);
    if (res.goal) lines.push(`目标：${res.goal}`);
    if (res.do) lines.push(`做法：${res.do}`);
    if (Array.isArray(res.todos) && res.todos.length) {
      lines.push("", "待办：");
      res.todos.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    }
    if (Array.isArray(res.gateFailures) && res.gateFailures.length) {
      lines.push("", "还差：");
      res.gateFailures.forEach((f) => lines.push(`- ${f.hint}${f.actual ? `（${f.actual}）` : ""}`));
    }
    if (Array.isArray(res.blockers) && res.blockers.length) {
      lines.push("", "卡点：");
      res.blockers.forEach((b) => lines.push(`- [${b.scope || "全局"}] ${b.text}`));
    }
    if (Array.isArray(res.openReviews) && res.openReviews.length) {
      lines.push("", `未闭环评审问题（${res.openReviews.length} 条）：`);
      res.openReviews.forEach((r) =>
        lines.push(`- #${r.id} ${r.status === "deferred" ? "〔待业务确认〕" : "〔待回答〕"} ${r.text}`)
      );
    }
    if (Array.isArray(res.subs) && res.subs.length) {
      lines.push("", "子需求：");
      res.subs.forEach((s) =>
        lines.push(`- ${s.yxtNo ? "✓" : "·"} ${s.id} ${s.title}${s.yxtNo ? ` → ${s.yxtNo}` : ""}`)
      );
    }
    // 任务链路：本阶段任务按支线分组
    const cur = res.tasks && Array.isArray(res.tasks.current) ? res.tasks.current : null;
    if (cur && cur.length) {
      const ICON = { done: "✓", doing: "▶", todo: "○", blocked: "✗" };
      const done = cur.filter((t) => t.status === "done").length;
      lines.push("", `本阶段任务（${done}/${cur.length}）：`);
      const plain = cur.filter((t) => !t.branch);
      const groups = new Map();
      for (const t of cur) {
        if (!t.branch) continue;
        if (!groups.has(t.branch)) groups.set(t.branch, []);
        groups.get(t.branch).push(t);
      }
      const fmt = (t) =>
        `- ${ICON[t.status] || "○"} \`${t.id}\` ${t.title}${t.who && t.who !== "我" ? ` @${t.who}` : ""}${
          t.note ? ` — ${t.note}` : ""
        }`;
      plain.forEach((t) => lines.push(fmt(t)));
      for (const [name, items] of groups) {
        lines.push(`- ⟂ **${name}**`);
        items.forEach((t) => lines.push(`  ${fmt(t)}`));
      }
    }
    if (Array.isArray(res.pendingByWho) && res.pendingByWho.length) {
      lines.push("", "要找人确认：");
      res.pendingByWho.forEach((g) =>
        lines.push(`- **${g.who}**：${g.items.map((i) => i.text).join("；")}`)
      );
    }
  } else if (res && typeof res === "object") {
    lines.push("```json", JSON.stringify(res, null, 2), "```");
  }

  // 单条任务变更的友好输出
  if (res && res.action && res.task && res.task.id) {
    const ICON = { done: "✓", doing: "▶", todo: "○", blocked: "✗" };
    lines.unshift(`✓ \`${res.task.id}\` ${res.task.title} → ${ICON[res.task.status] || ""} ${res.task.status}`);
  }

  if (value?.mermaid) {
    lines.push("", "```mermaid", value.mermaid, "```");
  }
  if (value?.taskMermaid && value.taskMermaid !== value.mermaid) {
    lines.push("", "当前阶段任务链路：", "", "```mermaid", value.taskMermaid, "```");
  }
  return lines.join("\n").trim() || "（无输出）";
}

/* ===================== CLI 调用 ===================== */

/**
 * 用 ctx.subprocess 跑 `node tools/pmw.mjs ... --json`。
 * 返回 { ok, json, exitCode, stderr }。永不抛错——失败也当成一个可读结果。
 */
async function runPmw(ctx, { command, args = [], dir, root, timeoutMs = 60000 }) {
  // 真 Cordis 里服务挂在 ctx 上；某些上下文要经 ctx.get 取（含可选服务未注入时的 undefined）。
  const subprocess = typeof ctx?.get === "function" ? ctx.get("subprocess") ?? ctx.subprocess : ctx.subprocess;
  if (!subprocess?.spawn) {
    return { ok: false, exitCode: -1, error: "subprocess 服务不可用，无法运行 pmw.mjs", json: null };
  }

  const nodeBin = await subprocess.resolveExecutable("node");
  const argvTail = [PMW, command, ...args.map(String), "--json", "--no-color"];
  if (dir) argvTail.push("--dir", dir);
  if (root) argvTail.push("--root", root);

  const env = { ...process.env };
  // 插件装了之后，包在 profile 的 node_modules 里；项目数据应该落到用户指定的 root。
  // runPmw 的 root 参数优先，其次 PMF_ROOT，最后才是包目录（不推荐）。
  const effectiveRoot = root || ctx.__pmFlowRoot || env.PMF_ROOT;
  if (effectiveRoot) env.PMF_ROOT = effectiveRoot;

  const handle = subprocess.spawn({
    argv: [nodeBin, ...argvTail],
    cwd: effectiveRoot || PACKAGE_ROOT,
    stdio: { stdin: "ignore", stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: { maxBytes: 512 * 1024 } },
    graceMs: 3000,
    env,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const outcome = await handle.done;
  const outRead = handle.collected?.stdout?.readFrom(0);
  const errRead = handle.collected?.stderr?.readFrom(0);
  const stdout = outRead?.text ?? "";
  const stderr = errRead?.text ?? "";

  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    /* CLI 没吐合法 JSON：下面按退出码包装 */
  }

  if (json) {
    return { ok: json.ok !== false, json, exitCode: outcome.exitCode ?? 0, stderr };
  }
  return {
    ok: (outcome.exitCode ?? 1) === 0,
    json: null,
    exitCode: outcome.exitCode ?? 1,
    stderr: stderr || stdout.slice(0, 2000) || "pmw.mjs 没有返回可解析的 JSON",
  };
}

/* ===================== SKILL 正文 ===================== */

/** 把 SKILL.md 读进来并剥掉 YAML frontmatter（skills.register 只要正文 + 元数据）。 */
function loadSkillBody() {
  const p = path.join(PACKAGE_ROOT, "SKILL.md");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: raw.trim(), meta: {} };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, "");
  }
  return { body: raw.slice(m[0].length).trim(), meta };
}

/* ===================== 项目目录可写性探测 ===================== */

/**
 * 用一个小文件实测「项目目录能不能写」。
 * 子会话（subagent）跑在 owner 会话的沙箱里，root 是工作区；
 * 如果项目目录在工作区外，子会话会写不进去——必须在派活前告诉它，而不是等它撞墙。
 * 返回 true / false / null（目录不存在，无法判断）。
 */
async function probeWritable(ctx, dir) {
  if (!dir) return null;
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const probe = path.join(dir, ".pm-flow-write-probe");
  try {
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/* ===================== HTTP 路由（给 Web UI 的 Client 半取数） ===================== */

const STATE_ROUTE = "/pm-flow/state";
const GRAPH_ROUTE = "/pm-flow/graph";
const ACT_ROUTE = "/pm-flow/act";

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  res.end(payload);
}

/**
 * GET /pm-flow/state            → { projects:[...] }            没有选中项目时
 * GET /pm-flow/state?panel=<dir> → 该项目的完整摘要 + mermaid    选中项目时
 */
function registerStateRoute(ctx, getRoot) {
  ctx.inject(["webServer"], (sctx) => {
    const server = typeof ctx.get === "function" ? ctx.get("webServer") ?? sctx.webServer : sctx.webServer;
    if (!server?.register) return;
    const dispose = server.register({
      kind: "exact",
      path: STATE_ROUTE,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? STATE_ROUTE, "http://localhost");
          const panel = url.searchParams.get("panel");
          const root = getRoot() || undefined;

          if (panel) {
            const out = await runPmw(ctx, { command: "status", dir: panel, root });
            if (out.json?.ok) {
              // status 把流程图放在顶层 mermaid / taskMermaid；客户端会把 result 摊平到顶层，
              // 所以这里也补一份进 result，保证两个位置都拿得到。
              const j = out.json;
              writeJson(res, 200, {
                ok: true,
                ...j,
                result: {
                  ...(j.result ?? {}),
                  mermaid: j.result?.mermaid ?? j.mermaid ?? "",
                  taskMermaid: j.result?.taskMermaid ?? j.taskMermaid ?? "",
                },
              });
              return;
            }
            // 项目还没初始化（没有 req.json / project.json）：不是服务器错误，
            // 返回一个「空项目」结构，前端好渲染「这个目录还没开始」而不是白屏。
            const errText = out.json?.error || out.stderr || "读不到这个工作区";
            writeJson(res, 200, {
              ok: true,
              initialized: false,
              dir: panel,
              id: path.basename(panel),
              title: path.basename(panel),
              kind: "req",
              stage: "",
              stageName: "未开始",
              progress: "0/9",
              next: "把这个需求的材料放进这个目录，然后说「这个需求开始走流程」",
              canAdvance: false,
              gateFailures: [],
              openReviews: 0,
              blockers: 0,
              subs: [],
              tasks: [],
              todos: [],
              allProjects: [],
              mermaid: "",
              notice: errText,
            });
            return;
          }

          // 没指定项目：给看板行（board，带阶段进度 / 本阶段任务完成度 / 挂在别人手上的事）
          const out = await runPmw(ctx, { command: "board", root });
          const rows = out.json?.result?.active ?? out.json?.result?.projects ?? [];
          writeJson(res, 200, {
            ok: true,
            root: out.json?.result?.root ?? null,
            projects: rows,
            mermaid: out.json?.mermaid ?? "",
            total: rows.length,
          });
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message ?? err) });
        }
      },
    });
    return () => dispose();
  });
}

/**
 * POST /pm-flow/act  { op, dir, ...参数 }
 *
 * 面板上的按钮走这里。两个关键点：
 * 1. 所有写操作都带 --by user —— 这样模型下次看状态时，能分清
 *    「这一步是它自己推的」还是「用户自己点的」，不会拿着旧判断继续走。
 * 2. op 是白名单，不给面板开放任意命令，避免误点把状态搞坏。
 */
const PANEL_OPS = {
  advance: () => ["advance"],
  goto: (b) => ["goto", String(b.target || b.stage || "")],
  back: (b) => ["back", String(b.target || b.stage || ""), ...(b.reason ? ["--reason", String(b.reason)] : [])],
  kind: (b) => ["kind", String(b.target || "")],
  "task-done": (b) => ["task", "done", String(b.id || "")],
  "task-doing": (b) => ["task", "doing", String(b.id || "")],
  "task-block": (b) => ["task", "block", String(b.id || "")],
  "review-add": (b) => ["review", "add", String(b.text || ""), ...(b.who ? ["--who", String(b.who)] : [])],
  "review-answer": (b) => ["review", "answer", String(b.id || ""), String(b.text || "")],
  "review-defer": (b) => ["review", "defer", String(b.id || ""), ...(b.to ? ["--to", String(b.to)] : [])],
  "review-close": (b) => ["review", "close", String(b.id || "")],
  "reflect-start": (b) => ["reflect", "start", ...(b.focus ? ["--focus", String(b.focus)] : [])],
  "reflect-close": (b) => ["reflect", "close", ...(b.force ? ["--force"] : [])],
  "reflect-add": (b) => ["reflect", "add", String(b.text || "")],
  "reflect-fix": (b) => ["reflect", "fix", String(b.id || "")],
  "reflect-keep": (b) => ["reflect", "keep", String(b.id || ""), ...(b.reason ? ["--reason", String(b.reason)] : [])],
  reroute: () => ["reroute"],
  "reroute-apply": (b) => ["reroute", "apply", String(b.id || "")],
  "reroute-dismiss": (b) => ["reroute", "dismiss", String(b.id || ""), ...(b.reason ? ["--reason", String(b.reason)] : [])],
  sync: () => ["note", "sync"],
  ack: () => ["ack"],
  check: () => ["check"],
  lint: () => ["lint"],
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error(`请求体不是合法 JSON：${e.message}`));
      }
    });
    req.on("error", reject);
  });
}

function registerActRoute(ctx, getRoot) {
  ctx.inject(["webServer"], (sctx) => {
    const server = typeof ctx.get === "function" ? ctx.get("webServer") ?? sctx.webServer : sctx.webServer;
    if (!server?.register) return;
    const dispose = server.register({
      kind: "exact",
      path: ACT_ROUTE,
      handler: async (req, res) => {
        try {
          if ((req.method || "GET").toUpperCase() !== "POST") {
            writeJson(res, 405, { ok: false, error: "只接受 POST" });
            return;
          }
          const body = await readBody(req);
          const op = String(body.op || "");
          const build = PANEL_OPS[op];
          if (!build) {
            writeJson(res, 400, { ok: false, error: `不支持的 op：${op || '（空）'}` });
            return;
          }
          const dir = body.dir ? String(body.dir) : "";
          if (!dir) {
            writeJson(res, 400, { ok: false, error: "缺少 dir（需求工作区的绝对路径）" });
            return;
          }
          const root = getRoot() || undefined;
          // 写操作统一标 by=user；读操作（check/lint）不带也不影响
          const argv = build(body);
          const isWrite = !["check", "lint"].includes(op);
          const out = await runPmw(ctx, {
            command: argv[0],
            args: [...argv.slice(1), ...(isWrite ? ["--by", "user"] : [])],
            dir,
            root,
          });
          const state = await runPmw(ctx, { command: "status", dir, root });
          writeJson(res, 200, {
            ok: Boolean(out.json?.ok),
            op,
            acted: out.json ?? null,
            error: out.json?.ok ? null : out.json?.error || out.stderr || "执行失败",
            state: state.json?.ok ? { ...state.json.result, mermaid: state.json.mermaid ?? "", taskMermaid: state.json.taskMermaid ?? "" } : null,
          });
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message ?? err) });
        }
      },
    });
    return () => dispose();
  });
}

/**
 * GET /pm-flow/graph?panel=<dir>&kind=flow|tasks → archify 渲染出来的独立 HTML
 *
 * 面板里那张图是精简版（秒开、可内嵌）；想看 archify 完整版（泳道网格 / 阶段带 /
 * 主路径高亮 / 缩放 / 导出 PNG）就打开这个路由，浏览器里当独立页面看。
 */
function registerGraphRoute(ctx, getRoot) {
  ctx.inject(["webServer"], (sctx) => {
    const server = typeof ctx.get === "function" ? ctx.get("webServer") ?? sctx.webServer : sctx.webServer;
    if (!server?.register) return;
    const dispose = server.register({
      kind: "exact",
      path: GRAPH_ROUTE,
      handler: async (req, res) => {
        const url = new URL(req.url ?? GRAPH_ROUTE, "http://localhost");
        const dir = url.searchParams.get("panel") || "";
        const kind = url.searchParams.get("kind") === "tasks" ? "tasks" : "flow";
        const fail = (status, msg) => {
          res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(
            `<!doctype html><meta charset="utf-8"><body style="font:14px/1.7 system-ui;padding:40px;background:#0b1020;color:#cbd5e1">` +
              `<h2 style="color:#fb7185;margin:0 0 12px">画不出这张图</h2>` +
              `<p style="white-space:pre-wrap">${String(msg).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p>` +
              `<p style="opacity:.6">用法：/pm-flow/graph?panel=&lt;需求工作区绝对路径&gt;&amp;kind=flow|tasks</p></body>`,
          );
        };
        try {
          if (!dir) return fail(400, "缺少 panel 参数（需求工作区的绝对路径）。");
          if (!archifyAvailable()) return fail(503, "插件里没找到内置的 archify 渲染器（vendor/archify）。");

          // 取一次状态：阶段顺序来自 mermaid，任务来自 tasks.current
          const out = await runPmw(ctx, { command: "status", dir, root: getRoot() || undefined });
          if (!out.json?.ok) return fail(200, out.json?.error || out.stderr || "读不到这个工作区（可能还没开始走流程）。");
          const status = { ...(out.json.result ?? {}) };
          const stages = parseStagesFromMermaid(out.json.mermaid);
          const taskList = (status.tasks?.current ?? []).map((t) => ({ ...t }));

          const html = await renderGraph({
            kind,
            dir,
            status,
            title: status.title,
            stages,
            tasks: taskList,
          });
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(html);
        } catch (err) {
          fail(500, String(err?.message ?? err));
        }
      },
    });
    return () => dispose();
  });
}

/** 从 pmw 的 mermaid 里解析出阶段（和 client.js 的 parseStages 同一套规则，这里是 Node 侧） */
function parseStagesFromMermaid(src) {
  const text = String(src ?? "");
  if (!text) return [];
  const nodes = new Map();
  const classes = new Map();
  const order = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^(flowchart|graph|classDef|%%|style|class)\b/.test(line)) {
      const m = /^class\s+([A-Za-z_]\w*)\s+([\w-]+)$/.exec(line);
      if (m) classes.set(m[1], m[2]);
      continue;
    }
    const m = /^([A-Za-z_]\w*)\s*[\[({](.*?)[\])}]\s*$/.exec(line);
    if (m && !nodes.has(m[1])) {
      nodes.set(m[1], m[2].replace(/^"|"$/g, ""));
      order.push(m[1]);
    }
  }
  const out = [];
  order.forEach((id, i) => {
    const label = nodes.get(id) ?? "";
    const cls = classes.get(id);
    let state = cls;
    if (!state) {
      if (/✓/.test(label)) state = "done";
      else if (/◀/.test(label)) state = "current";
      else if (/阻塞|卡点/.test(label)) state = "blocked";
      else state = "pending";
    }
    const clean = label.replace(/[✓◀○✗△▶]/g, "").trim();
    const num = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.*)$/.exec(clean);
    out.push({
      key: id,
      no: num ? num[1] : "",
      name: num ? num[2] : clean,
      state: state === "done" || state === "current" || state === "blocked" ? state : "pending",
      goal: "",
      index: i,
    });
  });
  return out;
}

/* ===================== 插件 ===================== */
export function apply(ctx, config = {}) {
  const cfg = config && typeof config === "object" ? config : {};
  // root = 装需求的父目录（每个子目录是一个需求工作区）。
  // 配置里没写就退回「桌面\文档」，再退回 PMF_ROOT。
  const configuredRoot = typeof cfg.root === "string" && cfg.root.trim() ? path.resolve(cfg.root.trim()) : "";
  if (configuredRoot) ctx.__pmFlowRoot = configuredRoot;

  const currentRoot = () => configuredRoot || ctx.__pmFlowRoot || process.env.PMF_ROOT || readSettings().root || "";

  // ---- 工具 ----
  ctx.inject(["tools"], (sctx) => {
    const dispose = sctx.tools.register({
      name: "pm_flow",
      description: TOOL_DESCRIPTION,
      parameters: PARAMETERS,
      output: {
        schema: OUTPUT_SCHEMA,
        render(args, value) {
          return [{ type: "text", text: renderHuman(value) }];
        },
      },
      async execute(args) {
        const command = String(args?.command ?? "today");
        if (!ALL_COMMANDS.includes(command)) {
          throw new Error(`pm_flow: 未知命令 "${command}"。可选：${ALL_COMMANDS.join(", ")}`);
        }
        const out = await runPmw(ctx, {
          command,
          args: Array.isArray(args?.args) ? args.args : [],
          dir: args?.dir ? String(args.dir) : undefined,
          root: args?.root ? String(args.root) : currentRoot() || undefined,
        });

        if (!out.json) {
          return {
            ok: false,
            command,
            error: `pmw.mjs 执行失败（exit ${out.exitCode}）：${out.stderr || "无输出"}`,
            exitCode: out.exitCode,
            stderr: out.stderr,
          };
        }
        return {
          ...out.json,
          exitCode: out.exitCode,
          ...(out.stderr ? { stderr: out.stderr } : {}),
        };
      },
    });
    return () => dispose();
  });

  // ---- 技能 ----
  if (cfg.enableSkill !== false) {
    ctx.inject(["skills"], (sctx) => {
      const disposers = [];

      const loaded = loadSkillBody();
      if (!loaded?.body) {
        ctx.logger?.warn?.("pm-flow: SKILL.md 缺失或为空，跳过技能注册");
      } else {
        disposers.push(
          sctx.skills.register({
            name: "pm-flow",
            description:
              loaded.meta.description ||
              "产品经理全流程工作台：需求立项、PRD 写作、大需求拆模块、推研效通、评审问题台账、UAT 验收、Mermaid 进度图。",
            whenToUse: loaded.meta.whenToUse,
            content: loaded.body,
            invocation: { modelInvocable: true, userInvocable: true },
            source: "runtime",
            provider: "dsh-pm-flow",
            resourceBase: { kind: "directory", path: PACKAGE_ROOT },
          })
        );
      }

      // 六个角色各注册成一个技能，名字可被 @ 引用，也能被 Rester 按名派活
      const overview = loadOverview();

      // 业务域档案单独成技能：任何角色都能随时 @pm-domain 补背景知识
      const domainDef = domainSkillDefinition();
      if (domainDef) {
        disposers.push(
          sctx.skills.register({
            name: domainDef.name,
            description: domainDef.description,
            whenToUse: domainDef.whenToUse,
            content: domainDef.content,
            invocation: { modelInvocable: true, userInvocable: true },
            source: "runtime",
            provider: "dsh-pm-flow",
            resourceBase: { kind: "directory", path: ROLES_DIR },
          })
        );
      }

      for (const role of ROLES) {
        const def = skillDefinitionFor(role);
        if (!def) {
          ctx.logger?.warn?.(`pm-flow: 角色说明书缺失，跳过 ${role.label}`);
          continue;
        }
        disposers.push(
          sctx.skills.register({
            name: def.name,
            description: def.description,
            whenToUse: def.whenToUse,
            content: overview && role.key === "resid" ? `${def.content}\n\n---\n\n${overview}` : def.content,
            invocation: { modelInvocable: true, userInvocable: true },
            source: "runtime",
            provider: "dsh-pm-flow",
            resourceBase: { kind: "directory", path: ROLES_DIR },
          })
        );
      }

      return () => disposers.forEach((d) => d?.());
    });
  }

  // ---- 命令 ----
  if (cfg.enableCommand !== false) {
    ctx.inject(["commands"], (sctx) => {
      const dispose = sctx.commands.register({
        name: "pmw",
        description: "产品经理工作流：/pmw [status|today|next|review ...]",
        input: { hint: "status | today | next | review list | advance ..." },
        async handler(invocation) {
          const raw = String(invocation?.rawInput ?? "").trim();
          const parts = raw ? raw.split(/\s+/) : ["today"];
          const command = parts[0];
          if (!ALL_COMMANDS.includes(command)) {
            return {
              kind: "error",
              text: `未知子命令 "${command}"。可选：${ALL_COMMANDS.join(" / ")}`,
            };
          }
          const out = await runPmw(ctx, {
            command,
            args: parts.slice(1),
            root: currentRoot() || undefined,
          });
          if (!out.json) {
            return { kind: "error", text: out.stderr || `pmw.mjs 执行失败（exit ${out.exitCode}）` };
          }
          return { kind: "success", text: renderHuman(out.json) };
        },
      });
      return () => dispose();
    });
  }

  // ---- 角色派活工具 ----
  ctx.inject(["tools"], (sctx) => {
    const dispose = sctx.tools.register({
      name: "pm_role",
      description: `六个产品经理角色的派活入口。角色：${ROLES.map((r) => `${r.key}(${r.label.split(" · ")[0]})`).join("、")}。

- action=list     列出所有角色及其职责
- action=doc      读某个角色的完整说明书（role 必填）
- action=context  读某个角色要用的全部材料：说明书 + 共同底座 + 项目状态 + 任务 + 台账（role + dir 必填）
- action=prompt   生成派给该角色的子会话提示词（role + dir + task 必填，返回整段 prompt，原样交给 subagent）
- action=delegate 同上，但额外提示这活该用什么方式跑（不真正起子会话，子会话由模型用 subagent 工具起）

**派活的正确姿势**：先 action=prompt 拿到 prompt，再用 subagent 工具把 prompt 原样传进去。
子会话会自己读说明书，你不需要把说明书内容塞进 prompt。`,
      parameters: {
        action: {
          type: "string",
          enum: ["list", "doc", "context", "prompt", "delegate"],
          description: "要做的事。不确定就 list。",
        },
        role: {
          type: "string",
          enum: ROLES.map((r) => r.key),
          description: "角色 key。list 之外都要填。",
        },
        dir: {
          type: "string",
          description: "项目目录绝对路径。context / prompt / delegate 必填。",
        },
        task: {
          type: "string",
          description: "派给这个角色的一句话具体任务。prompt / delegate 必填。",
        },
        upstream: {
          type: "string",
          description: "上游角色留下的交接摘要，原样贴。没有就不填。",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" },
            action: { type: "string" },
            role: { type: "string" },
            label: { type: "string" },
            doc: { type: "string" },
            prompt: { type: "string" },
            roles: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
        render(args, value) {
          if (value?.ok === false) return [{ type: "text", text: `✗ ${value.error}` }];
          if (value.action === "list") {
            return [{ type: "text", text: `六角色：\n\n${rolesTable()}` }];
          }
          if (value.action === "doc") {
            return [{ type: "text", text: `# ${value.label}\n\n${value.doc}` }];
          }
          if (value.action === "prompt" || value.action === "delegate") {
            return [{ type: "text", text: value.prompt }];
          }
          return [{ type: "text", text: JSON.stringify(value, null, 2) }];
        },
      },
      async execute(args) {
        // 先算一次「项目目录能不能写」，提示词里据此告诉子会话该往哪落盘
        const projectDirWritable = await probeWritable(ctx, args?.dir ? String(args.dir).trim() : "");

        const action = String(args?.action ?? "list");
        if (action === "list") {
          return {
            ok: true,
            action,
            roles: ROLES.map((r) => ({ key: r.key, skill: r.skill, label: r.label, brief: r.brief, when: r.when })),
          };
        }

        const roleKey = String(args?.role ?? "");
        const role = ROLES.find((r) => r.key === roleKey);
        if (!role) {
          return { ok: false, error: `未知角色 "${roleKey}"。可选：${ROLES.map((r) => r.key).join(", ")}` };
        }

        if (action === "doc") {
          const doc = loadRoleDoc(roleKey, { withBase: false });
          if (!doc) return { ok: false, error: `角色说明书缺失：${role.file}` };
          const overview = loadOverview();
          return {
            ok: true,
            action,
            role: roleKey,
            label: role.label,
            doc: overview ? `${doc}\n\n---\n\n${overview}` : doc,
          };
        }

        // 以下都要项目
        const dir = args?.dir ? String(args.dir).trim() : "";
        if (!dir) {
          return { ok: false, error: "context / prompt / delegate 都需要 dir（项目目录绝对路径）" };
        }

        const st = await runPmw(ctx, { command: "status", dir, root: currentRoot() || undefined });
        const summary = st.json?.result ?? null;
        if (!st.json?.ok && !summary) {
          return { ok: false, error: `读不到项目状态（${st.stderr || "未知原因"}）。确认 --dir 指向的是项目目录。` };
        }

        if (action === "context") {
          const doc = loadRoleDoc(roleKey, { withBase: true });
          if (!doc) return { ok: false, error: `角色说明书缺失：${role.file}` };
          const parts = [
            doc,
            "",
            "---",
            "",
            "# 当前项目状态（来自 pmw status，唯一事实来源）",
            "```json",
            JSON.stringify(
              {
                dir,
                id: summary?.id,
                title: summary?.title,
                kind: summary?.kind,
                stage: summary?.stage,
                stageName: summary?.stageName,
                progress: summary?.progress,
                goal: summary?.goal,
                do: summary?.do,
                gateFailures: summary?.gateFailures,
                tasks: summary?.tasks,
                openReviews: summary?.openReviews,
                blockers: summary?.blockers,
                pendingByWho: summary?.pendingByWho,
                subs: summary?.subs,
              },
              null,
              2
            ),
            "```",
          ];
          return { ok: true, action, role: roleKey, label: role.label, doc: parts.join("\n") };
        }

        // prompt / delegate
        const task = args?.task ? String(args.task).trim() : "";
        if (!task) {
          return { ok: false, error: "prompt / delegate 都需要 task（一句话具体任务）" };
        }
        const prompt = buildDelegationPrompt(roleKey, {
          projectDir: dir,
          projectTitle: summary?.title,
          kind: summary?.kind,
          stageName: summary?.stageName,
          task,
          upstream: args?.upstream ? String(args.upstream) : "",
          writable: projectDirWritable,
        });
        if (!prompt) return { ok: false, error: `生成提示词失败：${role.file}` };
        return { ok: true, action, role: roleKey, label: role.label, prompt, writable: projectDirWritable };
      },
    });
    return () => dispose();
  });

  // ---- Web UI 数据路由 ----
  registerStateRoute(ctx, currentRoot);
  registerActRoute(ctx, currentRoot);
  registerGraphRoute(ctx, currentRoot);
  registerBrowserRoute(ctx);

  // ---- 浏览器操控工具 ----
  ctx.inject(["tools"], (sctx) => {
    const dispose = sctx.tools.register({
      name: BROWSER_TOOL_NAME,
      description: BROWSER_DESCRIPTION,
      parameters: BROWSER_PARAMETERS,
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            ok: { type: "boolean" },
            action: { type: "string" },
            text: { type: "string" },
            url: { type: "string" },
            title: { type: "string" },
            count: { type: "number" },
            error: { type: "string" },
            needsConfirm: { type: "boolean" },
            confirmPrompt: { type: "string" },
            markdown: { type: "string" },
          },
        },
        render(args, value) {
          return [{ type: "text", text: renderBrowser(value) }];
        },
      },
      async execute(args, exec) {
        return await runBrowserAction(args, exec);
      },
    });
    return () => dispose();
  });

  // ---- bash 执行工具（替代 PowerShell） ----
  ctx.inject(["tools"], (sctx) => {
    const dispose = sctx.tools.register({
      name: SH_TOOL_NAME,
      description: SH_DESCRIPTION,
      parameters: SH_PARAMETERS,
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            ok: { type: "boolean" },
            action: { type: "string" },
            exitCode: { type: "number" },
            stdout: { type: "string" },
            stderr: { type: "string" },
            truncated: { type: "boolean" },
            durationMs: { type: "number" },
            diagnosis: { type: "string" },
            background: { type: "boolean" },
            jobId: { type: "string" },
            pid: { type: "number" },
            jobs: { type: "array", items: { type: "object", additionalProperties: true } },
            job: { type: "object", additionalProperties: true },
            stopped: { type: "boolean" },
            error: { type: "string" },
            hint: { type: "string" },
            needsConfirm: { type: "boolean" },
            confirmPrompt: { type: "string" },
          },
        },
        render(args, value) {
          return [{ type: "text", text: renderSh(value) }];
        },
      },
      async execute(args) {
        return await runShAction(args);
      },
    });
    return () => dispose();
  });

  // ---- Obsidian 知识库工具（长期记忆） ----
  ctx.inject(["tools"], (sctx) => {
    const dispose = sctx.tools.register({
      name: OBSIDIAN_TOOL_NAME,
      description: OBSIDIAN_DESCRIPTION,
      parameters: OBSIDIAN_PARAMETERS,
      output: {
        schema: OBSIDIAN_OUTPUT_SCHEMA,
        render(args, value) {
          return renderObsidian(value);
        },
      },
      async execute(args) {
        try {
          return await runObsidianAction(args ?? {});
        } catch (e) {
          return { ok: false, action: args?.action ?? "?", error: `知识库操作失败：${String(e?.message ?? e)}` };
        }
      },
    });
    return () => dispose();
  });
}

/* ===================== bash 工具执行 ===================== */

async function runShAction(args = {}) {
  const bad = validateShArgs(args);
  if (bad) return { ok: false, action: args.action || "run", error: bad };

  const action = args.action || "run";

  if (action === "jobs") {
    return { ok: true, action, jobs: listJobs() };
  }
  if (action === "job") {
    return { ok: true, action, job: getJob(args.jobId) };
  }
  if (action === "stop" || action === "kill") {
    return { ok: true, action: "stop", jobId: args.jobId, stopped: await stopJob(args.jobId) };
  }

  // action === "run"
  const cmd = String(args.cmd || "");
  const why = looksDangerousSh(cmd);
  if (why && !args.confirmed) {
    return {
      ok: false,
      action,
      needsConfirm: true,
      confirmPrompt: [
        `这条命令看起来是「${why}」，不可逆。`,
        "",
        "```bash",
        cmd.trim(),
        "```",
        "",
        "先把这段给用户看，问清楚要不要执行。用户明确说可以，再带 confirmed=true 重发。",
      ].join("\n"),
    };
  }

  const bash = findBash();
  if (!bash) {
    return { ok: false, action, error: "找不到 bash", hint: missingBashHint() };
  }

  const opts = {
    cwd: args.cwd || undefined,
    timeoutMs: Number(args.timeoutMs) > 0 ? Number(args.timeoutMs) : 120_000,
    maxBytes: Number(args.maxBytes) > 0 ? Number(args.maxBytes) : 2 * 1024 * 1024,
    stdin: args.stdin,
  };

  if (args.background) {
    const jobId = await startJob(cmd, opts);
    const job = getJob(jobId);
    return { ok: true, action, background: true, jobId, pid: job?.pid };
  }

  const r = await runScript(cmd, opts);
  const diagnosis = diagnose({
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
    script: cmd,
  });
  return {
    ok: Boolean(r.ok),
    action,
    exitCode: Number.isFinite(r.exitCode) ? r.exitCode : -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    truncated: Boolean(r.truncated),
    durationMs: Number.isFinite(r.durationMs) ? r.durationMs : 0,
    diagnosis: diagnosis || "",
  };
}

/* ===================== 浏览器工具执行 ===================== */

function renderBrowser(v) {
  if (!v) return "（无结果）";
  if (v.ok === false) return `✗ ${v.error ?? "失败"}`;
  if (v.needsConfirm) return v.confirmPrompt;
  const parts = [];
  if (v.action === "screenshot") parts.push(`已截图（${Math.round((v.bytes ?? 0) / 1024)} KB）`);
  if (v.text) parts.push(v.text);
  if (v.markdown) parts.push(v.markdown);
  if (!parts.length) parts.push(JSON.stringify(v, null, 2));
  if (v.url && v.action !== "snapshot") parts.push(`\nURL: ${v.url}`);
  return parts.join("\n");
}

async function runBrowserAction(args = {}, exec) {
  const action = String(args?.action ?? "snapshot");
  if (!BROWSER_ACTIONS.includes(action)) {
    return { ok: false, action, error: `未知动作 "${action}"。可选：${BROWSER_ACTIONS.join(", ")}` };
  }
  const port = Number(process.env.PMF_BROWSER_PORT ?? 9222) || 9222;

  // launch 单独处理：不需要已有连接
  if (action === "launch") {
    try {
      const r = await launch({ port, headless: Boolean(args.headless), profileDir: args.profileDir || undefined });
      return {
        ok: true,
        action,
        text: `Chrome 已启动（端口 ${r.port}，profile ${r.profileDir}${r.headless ? "，无头模式" : "，有界面"}）。\n登录一次研效通/企微，之后登录态会留在这个 profile 里。`,
      };
    } catch (err) {
      return { ok: false, action, error: String(err?.message ?? err) };
    }
  }

  let b;
  try {
    b = await getBrowser({ port });
  } catch (err) {
    return {
      ok: false,
      action,
      error: `${err?.message ?? err}\n\n提示：先执行 action=launch 起一个带调试端口的 Chrome；登录一次研效通/企微后登录态会留在 ${process.env.USERPROFILE || "~"}\\.dsh\\browser-profile。`,
    };
  }

  try {
    switch (action) {
      case "snapshot": {
        const snap = await b.snapshot({ maxChars: Number(args.maxChars) || 14000 });
        return { ok: true, action, text: snap.text, url: snap.url, title: snap.title, count: snap.count };
      }

      case "goto": {
        if (!args.url) return { ok: false, action, error: "goto 需要 url" };
        const url = await b.goto(String(args.url));
        return { ok: true, action, url, text: `已打开 ${url}` };
      }

      case "back": {
        const url = await b.goBack();
        return { ok: true, action, url, text: `已后退到 ${url}` };
      }

      case "click": {
        if (!args.ref) return { ok: false, action, error: "click 需要 ref（形如 @e3，从 snapshot 拿）" };
        // 危险动作确认：先看这个元素叫什么
        const label = await b
          .evaluate(
            `(() => { const n = ${JSON.stringify(String(args.ref).replace(/^@e/, "e"))}; const el = document.querySelector('[data-pmf-ref="'+n+'"]'); return el ? ((el.innerText||el.value||el.getAttribute('aria-label')||'')+'').trim().slice(0,60) : ''; })()`,
            { returnByValue: true },
          )
          .catch(() => "");
        if (looksDangerous(label) && !args.confirmed) {
          return {
            ok: false,
            action,
            needsConfirm: true,
            confirmPrompt: `要点的这个元素是「${label}」，看起来是不可逆操作。\n先问用户是否可以点；用户同意后再用 action=click ref=${args.ref} confirmed=true 重发同一请求。`,
            error: "需要用户确认",
          };
        }
        const r = await b.click(String(args.ref));
        return { ok: true, action, text: `已点击 ${args.ref}${label ? `（${label}）` : ""}，方式 ${r.how}` };
      }

      case "clickText": {
        if (!args.text) return { ok: false, action, error: "clickText 需要 text" };
        if (looksDangerous(args.text) && !args.confirmed) {
          return {
            ok: false,
            action,
            needsConfirm: true,
            confirmPrompt: `要点的文字「${args.text}」看起来是不可逆操作。先问用户；同意后加 confirmed=true 重发。`,
            error: "需要用户确认",
          };
        }
        const r = await b.clickText(String(args.text));
        if (!r?.ok) {
          return { ok: false, action, error: `没找到文字「${args.text}」${r?.candidates?.length ? `。相近的有：${r.candidates.join(" | ")}` : ""}` };
        }
        return { ok: true, action, text: `已点击「${r.text || args.text}」` };
      }

      case "fill": {
        if (!args.ref) return { ok: false, action, error: "fill 需要 ref" };
        if (args.text === undefined) return { ok: false, action, error: "fill 需要 text" };
        const r = await b.fill(String(args.ref), String(args.text), { clear: args.clear !== false, submit: Boolean(args.submit) });
        return { ok: true, action, text: `已填入 ${args.ref}，当前值「${r.value ?? ""}」` };
      }

      case "select": {
        if (!args.ref || args.value === undefined) return { ok: false, action, error: "select 需要 ref 和 value" };
        const r = await b.select(String(args.ref), String(args.value));
        if (!r?.ok) {
          return { ok: false, action, error: `没选中：${r?.reason ?? "未知"}${r?.options ? `。可选项：${r.options.join(" | ")}` : ""}` };
        }
        return { ok: true, action, text: `已选择「${r.value}」` };
      }

      case "pressKey": {
        const r = await b.pressKey(String(args.key ?? "Enter"));
        return { ok: true, action, text: `已按下 ${r.key}` };
      }

      case "hover": {
        if (!args.ref) return { ok: false, action, error: "hover 需要 ref" };
        await b.hover(String(args.ref));
        return { ok: true, action, text: `已悬停 ${args.ref}` };
      }

      case "scroll": {
        const r = await b.scroll({
          direction: args.direction ?? "down",
          amount: Number(args.amount) || 600,
          ref: args.ref ? String(args.ref) : undefined,
        });
        return { ok: true, action, text: `已滚动，当前 scrollY=${r.scrollY}，页高 ${r.pageHeight}` };
      }

      case "waitFor": {
        const r = await b.waitFor({
          text: args.text ? String(args.text) : undefined,
          selector: args.selector ? String(args.selector) : undefined,
          ref: args.ref ? String(args.ref) : undefined,
          timeoutMs: Number(args.timeoutMs) || 15000,
        });
        return r.ok
          ? { ok: true, action, text: `等到了（${r.waitedMs}ms）` }
          : { ok: false, action, error: `${r.reason}（${r.waitedMs}ms）` };
      }

      case "screenshot": {
        const buf = await b.screenshot({ fullPage: Boolean(args.fullPage), ref: args.ref ? String(args.ref) : undefined });
        const url = await b.currentUrl().catch(() => "");
        // 落盘而不是塞进返回体：模型可以用 read_image 打开这个路径真正「看见」页面
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        let file;
        if (args.filePath) {
          // 用户指定了位置：给目录就用默认文件名，给文件名就直接用
          let target = String(args.filePath);
          let isDir = false;
          try { isDir = fs.existsSync(target) && fs.statSync(target).isDirectory(); } catch { /* 不存在按文件名处理 */ }
          if (isDir || /[\\/]$/.test(target) || !path.extname(target)) {
            target = path.join(target, `shot-${stamp}.png`);
          }
          if (!path.isAbsolute(target)) target = path.resolve(process.cwd(), target);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          file = target;
        } else {
          const dir = path.join(process.env.TEMP || process.env.TMPDIR || ".", "pm-flow-shots");
          fs.mkdirSync(dir, { recursive: true });
          file = path.join(dir, `shot-${stamp}.png`);
        }
        fs.writeFileSync(file, buf);
        return {
          ok: true,
          action,
          url,
          bytes: buf.length,
          path: file,
          text: `截图已保存：${file}\n（${Math.round(buf.length / 1024)} KB，整页=${Boolean(args.fullPage)}）\n想看这张图就用 read_image 打开这个路径；想写进 Word 就在 md 里写 ![说明](相对工作区的路径)。`,
        };
      }

      case "extract": {
        const data = await b.extract({ selector: args.selector ? String(args.selector) : undefined });
        const lines = [`# ${data.title}`, `URL: ${data.url}`, ""];
        (data.tables || []).forEach((t, i) => {
          lines.push(`## 表格 ${i}（${t.rows.length} 行）`);
          lines.push(t.headers.join(" | "));
          t.rows.slice(0, 50).forEach((r) => lines.push(r.join(" | ")));
          lines.push("");
        });
        (data.lists || []).slice(0, 5).forEach((l, i) => {
          lines.push(`## 列表 ${i}（${l.items.length} 项）`);
          l.items.slice(0, 30).forEach((it) => lines.push(`- ${it}`));
          lines.push("");
        });
        return { ok: true, action, text: lines.join("\n"), url: data.url, title: data.title };
      }

      case "extractMarkdown": {
        const r = await b.extractMarkdown({ selector: args.selector ? String(args.selector) : undefined, tableIndex: Number(args.tableIndex) || 0 });
        if (!r.ok) return { ok: false, action, error: `${r.reason}（整页共 ${r.tables ?? 0} 个表格）` };
        return { ok: true, action, markdown: r.markdown, text: `${r.rows} 行` };
      }

      case "upload": {
        if (!args.ref || !args.filePath) return { ok: false, action, error: "upload 需要 ref（上传控件）和 filePath" };
        const r = await b.upload(String(args.ref), String(args.filePath));
        return { ok: Boolean(r.ok), action, text: `已上传 ${r.file}（方式 ${r.how}）` };
      }

      case "download": {
        if (!args.ref) return { ok: false, action, error: "download 需要 ref（下载链接/按钮）" };
        const r = await b.download(String(args.ref), { intoDir: args.filePath ? String(args.filePath) : undefined });
        if (!r.ok) return { ok: false, action, error: `${r.reason}（目录 ${r.dir}）` };
        return { ok: true, action, text: `已下载到 ${r.file}（${Math.round(r.size / 1024)} KB）` };
      }

      case "listPages": {
        const pages = await b.listPages();
        const lines = pages.map((p, i) => `${i + 1}. [${p.type}] ${p.title || "(无标题)"} — ${p.url}`);
        return { ok: true, action, text: lines.join("\n") || "没有打开的页面" };
      }

      case "usePage": {
        const t = await b.usePage(args.page ? (/^\d+$/.test(String(args.page)) ? Number(args.page) : String(args.page)) : 1);
        return { ok: true, action, url: t.url, title: t.title, text: `已切到 ${t.title || t.url}` };
      }

      case "newPage": {
        const t = await b.newPage(args.url ? String(args.url) : "about:blank");
        return { ok: true, action, url: t.url, text: `已新开标签页 ${t.url}` };
      }

      case "closePage": {
        const r = await b.closePage(args.page ? (/^\d+$/.test(String(args.page)) ? Number(args.page) : String(args.page)) : 1);
        return r.ok ? { ok: true, action, text: "已关闭标签页" } : { ok: false, action, error: r.reason };
      }

      case "evaluate": {
        if (!args.expression) return { ok: false, action, error: "evaluate 需要 expression" };
        const v = await b.evaluate(String(args.expression), { returnByValue: true });
        return { ok: true, action, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) };
      }

      default:
        return { ok: false, action, error: `未实现的动作：${action}` };
    }
  } catch (err) {
    return { ok: false, action, error: String(err?.message ?? err) };
  }
}

/* ===================== 浏览器 ===================== */

/** 进程内复用一个浏览器连接：模型连续点几下不要每次都重连、重新 launched Chrome */
let sharedBrowser = null;
let sharedBrowserKey = "";

async function getBrowser({ port = 9222, headless = false } = {}) {
  const key = `${port}:${headless}`;
  if (sharedBrowser && sharedBrowserKey === key) return sharedBrowser;
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
  const b = await Browser.open({ port, mode: "attach", headless });
  sharedBrowser = b;
  sharedBrowserKey = key;
  return b;
}

function registerBrowserRoute(ctx) {
  ctx.inject(["webServer"], (sctx) => {
    const server = ctx.get?.("webServer") ?? sctx.webServer;
    if (!server?.register) return;
    try {
      const dispose = server.register({
        kind: "exact",
        path: "/pm-flow/browser",
        handler: async (req, res) => {
          try {
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            const port = Number(url.searchParams.get("port") ?? 9222) || 9222;
            const probed = await probe(port);
            const pages = probed.up ? await new Browser({ port, conn: null }).listPages().catch(() => []) : [];
            writeJson(res, 200, {
              ok: true,
              up: probed.up,
              port,
              browser: probed.info?.Browser ?? null,
              pages,
              chrome: findChrome(),
            });
          } catch (err) {
            writeJson(res, 500, { ok: false, error: String(err?.message ?? err) });
          }
        },
      });
      return () => dispose?.();
    } catch {
      return;
    }
  });
}

