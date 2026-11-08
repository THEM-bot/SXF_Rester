/**
 * 浏览器工具自测：真起一个无头 Chrome，跑完一圈「打开 → 看 → 填 → 点 → 抓表 → 截图」。
 *
 * 用法：node tools/selftest-browser.mjs
 *
 * 用独立端口（默认 9334）和临时 profile，不影响你日常那个浏览器。
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { apply } from "../lib/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TMP = path.join(PKG, ".selftest-browser");
const PORT = Number(process.env.PMF_BROWSER_PORT || 9334);

process.env.PMF_BROWSER_PORT = String(PORT);

let pass = 0;
let fail = 0;
const ok = (l) => {
  pass += 1;
  console.log(`  ✓ ${l}`);
};
const bad = (l, extra) => {
  fail += 1;
  console.log(`  ✗ ${l}${extra ? ` — ${extra}` : ""}`);
};

/* ---- 假的 ctx：只为拿到注册的 browser 工具 ---- */
const registered = { tools: [] };
function makeCtx() {
  const services = {};
  const ctx = {
    logger: { warn() {} },
    get: (k) => services[k],
    inject: (keys, fn) => fn(ctx),
    effect: (fn) => fn(),
  };
  Object.defineProperty(ctx, "tools", {
    get: () => ({
      register(def) {
        registered.tools.push(def);
        return () => {};
      },
    }),
  });
  Object.defineProperty(ctx, "skills", { get: () => ({ register: () => () => {} }) });
  Object.defineProperty(ctx, "commands", { get: () => ({ register: () => () => {} }) });
  return ctx;
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

apply(makeCtx(), { root: TMP });

const browserTool = registered.tools.find((t) => t.name === "browser");
if (!browserTool) {
  console.log("✗ 没注册 browser 工具");
  process.exit(1);
}
console.log(`browser 工具已注册，参数 ${Object.keys(browserTool.parameters).length} 个\n`);

// 测试页
const html = `<!doctype html><html><head><meta charset="utf-8"><title>自测页</title></head><body>
<h1>预算导入</h1>
<form><label>金额 <input id="amt" type="text" placeholder="金额"></label>
<label>科目 <select id="s"><option value="">请选择</option><option value="A">办公费</option><option value="B">差旅费</option></select></label>
<button type="button" id="go" onclick="document.getElementById('o').innerText='结果 '+document.getElementById('amt').value+'/'+document.getElementById('s').value">提交</button></form>
<div id="o"></div>
<table><tr><th>部门</th><th>预算</th></tr><tr><td>销售</td><td>100</td></tr></table>
</body></html>`;
const pageFile = path.join(TMP, "t.html");
fs.writeFileSync(pageFile, html, "utf8");

const call = (args) => browserTool.execute(args, {});
const render = (v) => browserTool.output.render({}, v)?.[0]?.text ?? "";

/* ---- 1. launch ---- */
const launched = await call({ action: "launch", headless: true, profileDir: path.join(TMP, "prof") });
launched?.ok ? ok("launch 起了浏览器") : bad("launch 失败", render(launched));

/* ---- 2. goto ---- */
const g = await call({ action: "goto", url: `file:///${pageFile.replace(/\\/g, "/")}` });
g?.ok ? ok(`goto → ${g.url}`) : bad("goto 失败", render(g));

/* ---- 3. snapshot ---- */
const snap = await call({ action: "snapshot" });
const snapText = render(snap);
snapText.includes("预算导入") ? ok("snapshot 看到标题") : bad("snapshot 没看到标题", snapText.slice(0, 200));
const amtRef = (snapText.match(/(@e\d+) <input>/) || [])[1];
const selRef = (snapText.match(/(@e\d+) <select>/) || [])[1];
const btnRef = (snapText.match(/(@e\d+) <button>/) || [])[1];
amtRef ? ok(`找到输入框 ${amtRef}`) : bad("没找到输入框", snapText);
selRef ? ok(`找到下拉 ${selRef}`) : bad("没找到下拉");
btnRef ? ok(`找到按钮 ${btnRef}`) : bad("没找到按钮");

/* ---- 4. fill / select ---- */
if (amtRef) {
  const f = await call({ action: "fill", ref: amtRef, text: "2048" });
  f?.ok ? ok("fill 成功") : bad("fill 失败", render(f));
}
if (selRef) {
  const s = await call({ action: "select", ref: selRef, value: "差旅费" });
  s?.ok ? ok("select 成功") : bad("select 失败", render(s));
}

/* ---- 5. 危险动作确认 ---- */
if (btnRef) {
  const guarded = await call({ action: "click", ref: btnRef });
  guarded?.needsConfirm ? ok("「提交」被拦下等确认") : bad("危险动作没被拦", render(guarded));

  const confirmed = await call({ action: "click", ref: btnRef, confirmed: true });
  confirmed?.ok ? ok("确认后点击成功") : bad("确认后点击失败", render(confirmed));
  await new Promise((r) => setTimeout(r, 250));
  const txt = await call({ action: "evaluate", expression: "document.getElementById('o').innerText" });
  String(txt?.text || "").includes("2048") ? ok("页面响应了输入") : bad("页面没响应", txt?.text);
}

/* ---- 6. extract ---- */
const md = await call({ action: "extractMarkdown" });
String(md?.markdown || "").includes("| 部门 | 预算 |") ? ok("extractMarkdown 出表格") : bad("抽表格失败", render(md));

/* ---- 7. screenshot ---- */
const shot = await call({ action: "screenshot" });
if (shot?.ok && shot.path && fs.existsSync(shot.path)) {
  const size = fs.statSync(shot.path).size;
  size > 1000 ? ok(`screenshot 落盘（${Math.round(size / 1024)} KB）`) : bad("截图文件太小");
} else {
  bad("screenshot 失败", render(shot));
}

/* ---- 8. waitFor + clickText ---- */
const w = await call({ action: "waitFor", text: "结果", timeoutMs: 3000 });
w?.ok ? ok("waitFor 等到文字") : bad("waitFor 超时", render(w));

/* ---- 9. listPages / scroll / pressKey ---- */
const lp = await call({ action: "listPages" });
String(lp?.text || "").includes("file://") ? ok("listPages 有页面") : bad("listPages 空", render(lp));
const sc = await call({ action: "scroll", amount: 100 });
sc?.ok ? ok("scroll 成功") : bad("scroll 失败", render(sc));
const pk = await call({ action: "pressKey", key: "Tab" });
pk?.ok ? ok("pressKey 成功") : bad("pressKey 失败", render(pk));

/* ---- 10. 未知动作 ---- */
const un = await call({ action: "fly" });
un?.ok === false ? ok("未知动作被拒绝") : bad("未知动作没被拒绝");

console.log(`\n通过 ${pass}，失败 ${fail}`);

// 收拾：先把无头 Chrome 关掉，再删临时目录（关不干净就算了，不因此判失败）
try {
  const port = PORT;
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
  for (const t of list) {
    if (t.type === "page") await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
  }
  const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  if (ver) await fetch(`http://127.0.0.1:${port}/json/close/${(list[0] || {}).id ?? ""}`).catch(() => {});
} catch {
  /* 忽略 */
}
await new Promise((r) => setTimeout(r, 800));
for (let i = 0; i < 5; i += 1) {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 600));
  }
}
process.exit(fail ? 1 : 0);
