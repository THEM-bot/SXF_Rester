/**
 * 客户端半的渲染自测：把 lib/client.js 放进假壳子里真跑一遍，
 * 用「会重渲染」的迷你 React 渲染面板，确认：
 *   1. 三个入口都注册上（Rester 标记 / 侧栏图标 / 面板）
 *   2. 面板不抛 React 错误（最重要：以前这里会白屏）
 *   3. 阶段带、泳道、archify 链接都真的渲染出来了
 *
 * 用法：node tools/selftest-client.mjs [工作区目录]
 *   不给参数就用 .selftest-client 里现造的一个小需求工作区。
 *
 * 为什么要有这个文件：面板白屏过一次，原因是 pmw 的 JSON 字段类型
 * （gateFailures 是对象数组、openReviews 是数组、tasks 是对象）被直接
 * 当 React 子节点渲染。这个测试就是为了让这种错再也回不来。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const CLIENT = path.join(PKG, "lib", "client.js");
const TMP_ROOT = path.join(PKG, ".selftest-client");

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, extra) => {
  failures += 1;
  console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
};

/* ---- 造一个最小工作区（或直接用用户给的）---- */
function pmw(args, env) {
  return JSON.parse(
    execFileSync(process.execPath, [path.join(HERE, "pmw.mjs"), ...args, "--json"], {
      encoding: "utf8",
      env: env ?? process.env,
      maxBuffer: 32 * 1024 * 1024,
      cwd: PKG,
    }),
  );
}

let DIR = process.argv[2];
let ENV = process.env;
if (!DIR) {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  DIR = path.join(TMP_ROOT, "UISELFTEST");
  fs.mkdirSync(DIR, { recursive: true });
  ENV = { ...process.env, PMF_ROOT: TMP_ROOT };
  pmw(["init", "--here", "--dir", DIR, "--kind", "req", "--title", "面板渲染自测", "--id", "REQ-UITEST"], ENV);
  pmw(["goto", "S4_DEV_REVIEW", "--dir", DIR], ENV);
  pmw(["review", "add", "金额列能填负数吗", "--who", "开发", "--dir", DIR], ENV);
  pmw(["review", "defer", "1", "--to", "业务", "--dir", DIR], ENV);
  pmw(["task", "add", "开评审会，逐条记录问题", "--who", "我", "--dir", DIR], ENV);
  pmw(["task", "add", "答不了的转业务确认", "--who", "业务", "--dir", DIR], ENV);
  console.log(`用临时工作区：${DIR}\n`);
} else {
  console.log(`用现成工作区：${DIR}\n`);
}

/* ---- 取真实数据 ---- */
const boardJson = pmw(["board"], ENV);
const statusJson = pmw(["status", "--dir", DIR], ENV);
if (!statusJson?.ok) {
  bad("status 跑不通，没法测渲染", JSON.stringify(statusJson).slice(0, 300));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  process.exit(1);
}

/* ---- 按路由形状造夹具 ----
   GET /pm-flow/state            → {ok, root, projects, mermaid, total}
   GET /pm-flow/state?panel=xxx  → {ok:true, ...statusJson}                */
const boardFixture = {
  ok: true,
  root: boardJson?.result?.root ?? "",
  projects: boardJson?.result?.active ?? [],
  mermaid: boardJson?.mermaid ?? "",
  total: (boardJson?.result?.active ?? []).length,
};
const detailFixture = {
  ok: true,
  ...statusJson,
  // 和 lib/index.js 的路由保持一致：result 里也带一份 mermaid
  result: {
    ...(statusJson.result ?? {}),
    mermaid: statusJson.result?.mermaid ?? statusJson.mermaid ?? "",
    taskMermaid: statusJson.result?.taskMermaid ?? statusJson.taskMermaid ?? "",
  },
};

// 和 lib/client.js 的 loadDetail 保持一致：它做的是 setDetail({...d, ...(d.result||{})})
Object.assign(detailFixture, detailFixture.result);

console.log("数据：");
boardFixture.projects.length === 1
  ? ok(`board 返回 1 条在跟需求（${boardFixture.projects[0].title}）`)
  : bad(`board 返回 ${boardFixture.projects.length} 条`);
statusJson.mermaid
  ? ok(`status 带 mermaid（${statusJson.mermaid.length} 字符）`)
  : bad("status 没有 mermaid", `顶层字段：${Object.keys(statusJson).join(",")}`);
statusJson.taskMermaid ? ok(`status 带 taskMermaid（${statusJson.taskMermaid.length} 字符）`) : bad("status 没有 taskMermaid");

/* ---- 迷你 React：真的按 hooks 顺序走，setter 触发重渲染 ---- */
const effects = [];
const seenDeps = [];
const hookStore = [];
let hookCursor = 0;
let pendingRender = false;

function createElement(type, props, ...children) {
  const flat = [];
  for (const c of children) {
    if (Array.isArray(c)) flat.push(...c.flat(9));
    else flat.push(c);
  }
  for (const c of flat) {
    if (c && typeof c === "object" && c.$$el !== true) {
      throw new Error(`对象被当子节点渲染：${JSON.stringify(c).slice(0, 200)}`);
    }
  }
  return { $$el: true, type, props: props ?? {}, children: flat };
}
function useState(init) {
  const i = hookCursor++;
  if (!(i in hookStore)) hookStore[i] = typeof init === "function" ? init() : init;
  const set = (v) => {
    const next = typeof v === "function" ? v(hookStore[i]) : v;
    if (Object.is(next, hookStore[i])) return;
    hookStore[i] = next;
    pendingRender = true;
  };
  return [hookStore[i], set];
}
function useEffect(fn, deps) {
  const i = hookCursor++;
  const prev = seenDeps[i];
  const changed = !deps || !prev || deps.length !== prev.length || deps.some((d, k) => !Object.is(d, prev[k]));
  if (changed) {
    seenDeps[i] = deps ? [...deps] : null;
    effects.push(fn);
  }
}
function useMemo(fn, deps) {
  const i = hookCursor++;
  const prev = seenDeps[i];
  if (prev && deps && prev.length === deps.length && deps.every((d, k) => Object.is(d, prev[k]))) return prev.value;
  const value = fn();
  seenDeps[i] = deps ? Object.assign([...deps], { value }) : null;
  return value;
}
const useCallback = (fn, deps) => useMemo(() => fn, deps);
function useRef(v) {
  const i = hookCursor++;
  if (!(i in hookStore)) hookStore[i] = { current: v };
  return hookStore[i];
}
const react = { createElement, useState, useEffect, useCallback, useMemo, useRef };

/* ---- 假壳子 ---- */
const fetchCalls = [];
const win = {
  __ModuleLoader__: {
    load({ id, factory }) {
      const module = { exports: {} };
      const require = (n) => {
        if (n === "react") return react;
        if (n === "@deepseek-ai/dsh-client-ui-primitives") return { IconSkillOutlineRegular: () => null };
        return {};
      };
      win.__loaded = { id, exports: factory(require) };
    },
  },
};
const sandbox = {
  window: win,
  fetch: async (url) => {
    fetchCalls.push(String(url));
    const body = String(url).includes("panel=") ? detailFixture : boardFixture;
    return { ok: true, status: 200, json: async () => body };
  },
  console,
  setTimeout,
  clearTimeout,
  Promise,
  AbortController,
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(CLIENT, "utf8"), sandbox);
if (!win.__loaded) {
  bad("client.js 没有调用 window.__ModuleLoader__.load");
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  process.exit(1);
}

const registrations = [];
const slots = {
  inject: (_n, cb) => { const d = cb(); return () => d && d(); },
  register: (def, Comp) => { registrations.push({ def, Comp }); return () => {}; },
};
win.__loaded.exports.apply({ get: (k) => (k === "slots" ? slots : undefined), slots, effect: (fn) => { fn(); return () => {}; } });

/* ---- 注册断言 ---- */
console.log("\n注册：");
const byName = (n) => registrations.find((r) => r.def.name === n);
const badge = byName("conversation.input.right");
badge && badge.def.id === "pm-flow-agent" && badge.def.order === 90
  ? ok("Rester 标记挂在 conversation.input.right（模型名左边，不是替换）")
  : bad("Rester 标记注册不对", JSON.stringify(badge?.def));
const sideIcon = byName("sidebar.panellist");
sideIcon && sideIcon.def.label?.() === "需求进度看板"
  ? ok("侧栏图标已注册，名字「需求进度看板」")
  : bad("侧栏图标注册不对", JSON.stringify(sideIcon?.def));
const mainReg = byName("main");
mainReg && mainReg.def.key === "pm-flow" ? ok("面板挂在 main 槽，key=pm-flow") : bad("面板注册不对");
registrations.length === 3 ? ok("共 3 个注册，没有多也没少") : bad(`注册数 ${registrations.length}`);

/* ---- 渲染 ---- */
function walk(node, out) {
  if (node == null || node === false || node === true) return;
  if (typeof node === "string" || typeof node === "number") { out.text.push(String(node)); return; }
  if (Array.isArray(node)) { node.forEach((c) => walk(c, out)); return; }
  if (node.$$el !== true) throw new Error(`非法节点：${typeof node}`);
  if (typeof node.type === "function") {
    hookCursor = 0;
    walk(node.type(node.props), out);
    return;
  }
  out.tags.add(String(node.type));
  walk(node.children, out);
}

const out = { text: [], tags: new Set() };
const renderOnce = () => { out.text.length = 0; out.tags.clear(); walk(createElement(mainReg.Comp, { services: {} }), out); };

console.log("\n渲染：");
let renderError = "";
try {
  renderOnce();
  for (let round = 0; round < 14; round++) {
    hookCursor = 0;
    const pending = effects.splice(0, effects.length);
    for (const fn of pending) {
      const p = fn();
      if (p && typeof p.then === "function") await p;
    }
    await new Promise((r) => setTimeout(r, 40));
    renderOnce();
    if (!effects.length && !pendingRender) break;
    pendingRender = false;
  }
  renderOnce();
} catch (e) {
  renderError = String(e?.message ?? e);
}

renderError ? bad("渲染抛错（这就是白屏的原因）", renderError) : ok("渲染不抛错");

const flat = out.text.join(" | ");
// <style> 里的 CSS 也要过一遍：不能有对象被塞进来（那是另一条白屏路径）
const contentText = out.text.filter((t) => !t.includes(".pmf-wrap{")).join(" | ");
const hasCss = out.text.some((t) => t.includes(".pmf-wrap{"));

hasCss ? ok("样式表已渲染") : bad("没有样式表");
/在跟的需求/.test(contentText) ? ok("左列标题在") : bad("左列标题不在");
new RegExp(`任务 \\d+/\\d+`).test(contentText) ? ok("左列三字段：任务 a/b") : bad("左列缺任务进度");
/等 .+×\d/.test(contentText) || !boardFixture.projects[0]?.waitingTotal ? ok("左列「等谁」字段在") : bad("左列缺等谁");

/* 阶段带 */
const stageNames = (statusJson.result?.stageName ? [statusJson.result.stageName] : []);
stageNames.every((n) => contentText.includes(n)) ? ok(`阶段带里有当前阶段「${stageNames[0]}」`) : bad("阶段带缺当前阶段");
/✓/.test(contentText) ? ok("阶段带上有已完成的 ✓") : bad("阶段带没有 ✓ 标记");
out.tags.has("a") ? ok("有 archify 链接（<a>）") : bad("没有 archify 链接");

/* 泳道 */
const whoSet = new Set();
for (const t of statusJson.result?.tasks?.current ?? []) if (t.who) whoSet.add(t.who);
const shown = [...whoSet].filter((w) => contentText.includes(w));
shown.length === whoSet.size
  ? ok(`泳道覆盖所有负责人（${[...whoSet].join("/") || "无任务"}）`)
  : bad(`泳道缺人：应有 ${[...whoSet].join("/")}，实际出现 ${shown.join("/")}`);

/* 任务编号 */
const taskIds = (statusJson.result?.tasks?.current ?? []).map((t) => t.id).filter(Boolean);
const shownIds = taskIds.filter((id) => contentText.includes(id));
shownIds.length === taskIds.length
  ? ok(`任务卡都带编号（${taskIds.join("/")}）`)
  : bad(`有任务卡缺编号：${taskIds.filter((i) => !shownIds.includes(i)).join("/")}`);

/* 评审台账 */
const openReviews = (statusJson.result?.openReviews ?? []).length;
if (openReviews) {
  /评审待闭环/.test(contentText) ? ok(`评审台账渲染了 ${openReviews} 条未闭环`) : bad("评审台账没渲染");
} else {
  ok("没有未闭环评审，跳过");
}

/* 老毛病回归：这几类值绝不能被当成子节点 */
console.log("\n回归（白屏的三条老路）：");
/* ---- 面板可操作性：按钮真的渲染出来了 ---- */
out.tags.has("button") ? ok("面板上有按钮（不再只是只读）") : bad("面板没有任何按钮");
/推进到下一阶段|同步知识库|体检/.test(contentText) ? ok("操作条渲染了（推进/同步/体检）") : bad("操作条没渲染");
/反思/.test(contentText) ? ok("反思卡片渲染了") : bad("反思卡片没渲染");
/路线/.test(contentText) ? ok("路线卡片渲染了") : bad("路线卡片没渲染");
/开一轮反思|收尾本轮|再开一轮/.test(contentText) ? ok("反思按钮可用") : bad("反思按钮缺失");
if ((detailFixture.changes?.total ?? 0) > 0) {
  /条改动/.test(contentText) ? ok(`「被改过」提示渲染了（${detailFixture.changes.total} 条，用户 ${detailFixture.changes.byUser} 条）`) : bad("有改动但没提示");
  /我已知晓/.test(contentText) ? ok("有「我已知晓」按钮") : bad("缺 ack 按钮");
} else {
  ok("当前没有未读改动，跳过提示断言");
}

out.tags.size > 0 && contentText.length > 0 ? ok("界面有实际内容，不是空白") : bad("界面是空的");
!/object Object/i.test(flat) ? ok("没有 [object Object] 漏到界面上") : bad("界面上出现了 [object Object]");

/* ---- 清理 ---- */
if (!process.argv[2]) fs.rmSync(TMP_ROOT, { recursive: true, force: true });

console.log(failures === 0 ? "\n全部通过 ✓" : `\n${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
