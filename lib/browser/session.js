/**
 * 浏览器会话层：把 CDP 封装成「一个浏览器 + 若干页面」。
 *
 * 两种模式：
 *   attach —— 连你已经登录的那个 Chrome（日常模式）。
 *   launch —— 起一个带独立 profile 的 Chrome（第一次之后就一直用它，登录态留着）。
 *
 * 页面里的元素用 @eN 编号（每次 snapshot 重建）。点击/填值都靠这个编号定位，
 * 比让模型猜 CSS 选择器稳。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connect, httpJson } from "./cdp.js";
import { SNAPSHOT_JS, CLICK_JS, CLICK_TEXT_JS, FILL_JS, SELECT_JS, EXTRACT_JS } from "./scripts.js";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export const DEFAULT_PORT = 9222;

export function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 忽略 */
    }
  }
  return null;
}

export async function probe(port = DEFAULT_PORT) {
  try {
    const info = await httpJson(`http://127.0.0.1:${port}/json/version`, { timeoutMs: 2500 });
    return { up: true, info };
  } catch {
    return { up: false };
  }
}

async function waitFor(fn, { tries = 60, gapMs = 250 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}

/**
 * 起一个带调试端口的 Chrome。
 * 用固定的独立 profile 目录 `~/.dsh/browser-profile`：
 * 登录一次研效通/企微之后，下次启动还在（Chrome 不允许对「正在使用的日常 profile」再加调试端口）。
 */
export async function launch({ port = DEFAULT_PORT, headless = false, profileDir, chromePath } = {}) {
  const exe = chromePath || findChrome();
  if (!exe) throw new Error("找不到 Chrome 或 Edge");
  const dir = profileDir || path.join(os.homedir(), ".dsh", "browser-profile");
  fs.mkdirSync(dir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    "--restore-last-session",
  ];
  if (headless) args.push("--headless=new");
  const child = spawn(exe, args, { detached: true, stdio: "ignore" });
  child.unref();
  let ok = await waitFor(async () => (await probe(port)).up, { tries: 24 });
  if (!ok) {
    // 很常见的原因：上一次崩了，profile 目录里留着 SingletonLock，Chrome 认为自己已在运行
    for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      try {
        fs.rmSync(path.join(dir, f), { force: true });
      } catch {
        /* 删不掉就算了 */
      }
    }
    const retry = spawn(exe, args, { detached: true, stdio: "ignore" });
    retry.unref();
    ok = await waitFor(async () => (await probe(port)).up, { tries: 24 });
  }
  if (!ok) {
    throw new Error(
      `Chrome 起来了但 ${port} 端口一直不通。多半是「这个 profile 已经被另一个 Chrome 窗口占用」——\n` +
        `  关掉所有用 ${dir} 这个目录的 Chrome 窗口再试；或换端口（参数 port）。`,
    );
  }
  return { port, profileDir: dir, pid: child.pid, headless, exe };
}

export class Browser {
  constructor({ port = DEFAULT_PORT, conn }) {
    this.port = port;
    this.conn = conn;
    this.sessionId = null;
    this.pageId = null;
    this._autoDialog = "accept";
  }

  static async open({ port = DEFAULT_PORT, mode = "attach", headless = false, profileDir, launchIfDown = true } = {}) {
    let p = port;
    let probed = await probe(p);
    if (!probed.up && mode === "attach" && launchIfDown) {
      // attach 模式下端口没起来：帮用户起一个（同一套 profile，登录态延续）
      await launch({ port: p, headless: false, profileDir });
      probed = await probe(p);
    }
    if (!probed.up) {
      throw new Error(
        `127.0.0.1:${p} 上没有可接管的浏览器。\n` +
          `手动启动一次即可（之后登录态会保留）：\n` +
          `  chrome.exe --remote-debugging-port=${p} --user-data-dir=%USERPROFILE%\\.dsh\\browser-profile`,
      );
    }
    const conn = await connect(probed.info.webSocketDebuggerUrl);
    const b = new Browser({ port: p, conn });
    const pages = (await b.listPages()).filter((t) => t.type === "page");
    if (pages[0]) await b.usePage(pages[0].id);
    return b;
  }

  async listPages() {
    const list = await httpJson(`http://127.0.0.1:${this.port}/json/list`);
    return list.map((t) => ({ id: t.id, type: t.type, url: t.url, title: t.title }));
  }

  async usePage(which) {
    const pages = (await this.listPages()).filter((t) => t.type === "page");
    let target = null;
    if (typeof which === "number") target = pages[which - 1];
    else if (which) target = pages.find((t) => t.id === which) || pages.find((t) => (t.url || "").includes(which));
    if (!target) {
      const { targetId } = await this.conn.send("Target.createTarget", { url: "about:blank" });
      await this.attach(targetId);
      this.pageId = targetId;
      return { id: targetId, url: "about:blank", title: "" };
    }
    if (this.pageId !== target.id) await this.attach(target.id);
    this.pageId = target.id;
    return target;
  }

  async newPage(url = "about:blank") {
    const { targetId } = await this.conn.send("Target.createTarget", { url });
    await this.attach(targetId);
    this.pageId = targetId;
    return { id: targetId, url };
  }

  async closePage(which) {
    const pages = (await this.listPages()).filter((t) => t.type === "page");
    const target = typeof which === "number" ? pages[which - 1] : pages.find((t) => t.id === which);
    if (!target) return { ok: false, reason: "没找到这个页面" };
    await this.conn.send("Target.closeTarget", { targetId: target.id });
    if (this.pageId === target.id) {
      this.pageId = null;
      this.sessionId = null;
      const left = (await this.listPages()).filter((t) => t.type === "page");
      if (left[0]) await this.usePage(left[0].id);
    }
    return { ok: true };
  }

  async attach(targetId) {
    if (this.sessionId) this.conn.unbindSession(this.sessionId);
    const { sessionId } = await this.conn.send("Target.attachToTarget", { targetId, flatten: true });
    this.sessionId = sessionId;
    this.conn.bindSession(sessionId, (msg) => this._onEvent(msg));
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Page.setDownloadBehavior", { behavior: "allow" }).catch(() => {});
    return sessionId;
  }

  _onEvent(msg) {
    if (msg.method === "Page.javascriptDialogOpening") {
      if (this._autoDialog === "dismiss") {
        this.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
      } else if (this._autoDialog !== "pause") {
        this.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
      }
    }
  }

  send(method, params = {}) {
    return this.conn.send(method, params, this.sessionId);
  }

  /* ---------------- 导航 ---------------- */

  async goto(url, { timeoutMs = 30000 } = {}) {
    const full = /^[a-zA-Z][\w+.-]*:/.test(url) ? url : `https://${url}`;
    await this.send("Page.navigate", { url: full }).catch(() => ({}));
    await this.waitReady({ timeoutMs });
    return this.currentUrl();
  }

  async goBack() {
    await this.send("Page.navigateToHistoryEntry", { entryId: 0 }).catch(() => {});
    // 更稳的做法：用 history.back()（上面在某些页面不生效）
    await this.evaluate("history.back(); true", { returnByValue: true }).catch(() => {});
    await this.waitReady({ timeoutMs: 10000 });
    return this.currentUrl();
  }

  async waitReady({ timeoutMs = 30000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const st = await this.evaluate("document.readyState", { returnByValue: true });
        if (st === "complete") {
          await new Promise((r) => setTimeout(r, 120));
          return true;
        }
      } catch {
        /* 导航中会有瞬时失败，忽略 */
      }
      await new Promise((r) => setTimeout(r, 130));
    }
    return false;
  }

  async currentUrl() {
    try {
      return String((await this.evaluate("location.href", { returnByValue: true })) ?? "");
    } catch {
      return "";
    }
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue, userGesture: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`页面脚本报错：${d.text || ""} ${d.exception?.description || ""}`.trim());
    }
    return returnByValue ? r.result?.value : r.result;
  }

  /* ---------------- 观察 ---------------- */

  async snapshot({ maxChars = 14000, includeText = true } = {}) {
    const data = await this.evaluate(SNAPSHOT_JS, { returnByValue: true });
    const lines = [`# ${data.title || "(无标题)"}`, `URL: ${data.url}`];
    if (includeText && data.text) {
      lines.push("", "## 页面文字", data.text);
    }
    if (data.elements?.length) {
      lines.push("", "## 可操作元素");
      for (const el of data.elements) {
        const bits = [`${el.ref} <${el.role}>`];
        if (el.name) bits.push(el.name);
        if (el.checked !== undefined) bits.push(el.checked ? "[已勾选]" : "[未勾选]");
        else if (el.value) bits.push(`值="${el.value}"`);
        if (el.href) bits.push(`→ ${el.href}`);
        if (el.disabled) bits.push("[禁用]");
        lines.push(bits.join(" "));
      }
    }
    let text = lines.join("\n");
    if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…（已截断 ${text.length} 字符，可用 selector 缩小范围或加大 maxChars）`;
    return { text, count: data.elements?.length ?? 0, url: data.url, title: data.title, truncated: text.length > maxChars };
  }

  /** 截图，返回 base64 PNG */
  async screenshot({ fullPage = false, ref } = {}) {
    let clip;
    if (ref) {
      const box = await this._boxOf(ref);
      clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.max(8, box.w + 16), height: Math.max(8, box.h + 16), scale: 1 };
    }
    const params = { format: "png", captureBeyondViewport: fullPage };
    if (clip) params.clip = clip;
    if (fullPage) {
      const m = await this.send("Page.getLayoutMetrics").catch(() => null);
      const cs = m?.cssContentSize;
      if (cs) {
        params.clip = { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 6000), scale: 1 };
        params.captureBeyondViewport = true;
      }
    }
    const r = await this.send("Page.captureScreenshot", params);
    return Buffer.from(r.data, "base64");
  }

  /* ---------------- 定位与操作 ---------------- */

  _refName(ref) {
    const m = /^@?e?(\d+)$/.exec(String(ref || "").trim());
    if (!m) throw new Error(`引用格式不对：${ref}。应该是 @e1 这种，先 action=snapshot 看一眼。`);
    return `e${m[1]}`;
  }

  async _tagged(ref) {
    const name = this._refName(ref);
    const exists = await this.evaluate(`!!document.querySelector('[data-pmf-ref="${name}"]')`, { returnByValue: true });
    if (!exists) {
      throw new Error(`页面上没有 ${ref}（很多 SPA 点一下就整块重渲染，编号会全部换掉）。先 action=snapshot 重新看一遍。`);
    }
    return name;
  }

  async _boxOf(ref) {
    const name = await this._tagged(ref);
    const box = await this.evaluate(
      `(() => { const el=document.querySelector('[data-pmf-ref="${name}"]'); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`,
      { returnByValue: true },
    );
    if (!box) throw new Error(`${ref} 已不在页面上`);
    return box;
  }

  async click(ref) {
    const name = await this._tagged(ref);
    const ok = await this.evaluate(CLICK_JS(name), { returnByValue: true });
    if (!ok) {
      const box = await this._boxOf(ref);
      const x = box.x + box.w / 2;
      const y = box.y + box.h / 2;
      await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      return { ok: true, how: "mouse" };
    }
    await new Promise((r) => setTimeout(r, 80));
    return { ok: true, how: "element" };
  }

  async clickText(text, { nth = 0 } = {}) {
    const r = await this.evaluate(CLICK_TEXT_JS(JSON.stringify(text), { nth }), { returnByValue: true });
    return r;
  }

  async hover(ref) {
    const box = await this._boxOf(ref);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.w / 2, y: box.y + box.h / 2 });
    return { ok: true };
  }

  async fill(ref, text, { clear = true, submit = false } = {}) {
    const name = await this._tagged(ref);
    const r = await this.evaluate(FILL_JS(name, JSON.stringify(String(text)), { clear, submit }), { returnByValue: true });
    if (!r?.ok) throw new Error(`填值失败：${r?.reason || "未知原因"}`);
    return r;
  }

  async select(ref, value) {
    const name = await this._tagged(ref);
    const r = await this.evaluate(SELECT_JS(name, JSON.stringify(String(value))), { returnByValue: true });
    return r;
  }

  async pressKey(key) {
    const map = {
      Enter: { code: "Enter", keyCode: 13, text: "\r" },
      Tab: { code: "Tab", keyCode: 9 },
      Escape: { code: "Escape", keyCode: 27 },
      Backspace: { code: "Backspace", keyCode: 8 },
      ArrowDown: { code: "ArrowDown", keyCode: 40 },
      ArrowUp: { code: "ArrowUp", keyCode: 38 },
    };
    const k = map[key] || { code: key, keyCode: 0 };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: k.code, windowsVirtualKeyCode: k.keyCode, ...(k.text ? { text: k.text } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.keyCode });
    return { ok: true, key };
  }

  async scroll({ direction = "down", amount = 600, ref } = {}) {
    if (ref) {
      const box = await this._boxOf(ref);
      await this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x + box.w / 2, y: box.y + box.h / 2, deltaX: 0, deltaY: direction === "up" ? -amount : amount });
    } else {
      const dy = direction === "up" ? -amount : direction === "top" ? -1e6 : amount;
      await this.evaluate(`window.scrollBy(0, ${dy});`, { returnByValue: true });
    }
    await new Promise((r) => setTimeout(r, 150));
    const y = await this.evaluate("window.scrollY", { returnByValue: true }).catch(() => 0);
    const h = await this.evaluate("document.body.scrollHeight", { returnByValue: true }).catch(() => 0);
    return { ok: true, scrollY: y, pageHeight: h };
  }

  /** 等某个条件成立（文字出现 / 元素出现 / 网络空闲） */
  async waitFor({ text, selector, ref, timeoutMs = 15000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let hit = false;
      if (text) {
        hit = await this.evaluate(`(document.body && document.body.innerText || '').includes(${JSON.stringify(text)})`, { returnByValue: true });
      } else if (selector) {
        hit = await this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`, { returnByValue: true });
      } else if (ref) {
        hit = await this.evaluate(`!!document.querySelector('[data-pmf-ref="${this._refName(ref)}"]')`, { returnByValue: true });
      } else {
        hit = await this.evaluate("document.readyState === 'complete'", { returnByValue: true });
      }
      if (hit) return { ok: true, waitedMs: Date.now() - start };
      await new Promise((r) => setTimeout(r, 200));
    }
    return { ok: false, waitedMs: Date.now() - start, reason: "等到超时" };
  }

  /** 提取表格与列表 */
  async extract({ selector, kind = "auto" } = {}) {
    return this.evaluate(EXTRACT_JS({ selector, kind }), { returnByValue: true });
  }

  /** 把页面里的数据整理成 Markdown 表，方便直接贴进 PRD */
  async extractMarkdown({ selector, tableIndex = 0 } = {}) {
    const data = await this.extract({ selector });
    const t = data.tables?.[tableIndex];
    if (!t) return { ok: false, reason: "这一页没找到表格", tables: data.tables?.length ?? 0 };
    const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const head = t.headers.length ? t.headers : t.rows[0] || [];
    const body = t.headers.length ? t.rows : t.rows.slice(1);
    const md = [`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
    return { ok: true, markdown: md, rows: body.length, headers: head };
  }

  /* ---------------- 文件 ---------------- */

  /** 把本地文件塞进 <input type=file> */
  async upload(ref, filePath) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) throw new Error(`本地没有这个文件：${abs}`);
    const name = await this._tagged(ref);
    const el = await this.evaluate(
      `(() => { const e=document.querySelector('[data-pmf-ref="${name}"]'); return e ? { tag:e.tagName.toLowerCase(), type:(e.getAttribute('type')||'').toLowerCase() } : null; })()`,
      { returnByValue: true },
    );
    if (!el) throw new Error(`${ref} 不在页面上`);
    if (el.tag === "input" && el.type === "file") {
      const { root } = await this.send("DOM.getDocument", { depth: 1 });
      const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-pmf-ref="${name}"]` });
      if (!nodeId) throw new Error("没定位到上传控件");
      await this.send("DOM.setFileInputFiles", { nodeId, files: [abs] });
      return { ok: true, how: "input", file: abs };
    }
    // 拖拽型上传：构造 DataTransfer 塞进 drop 区域
    const b64 = fs.readFileSync(abs).toString("base64");
    const fileName = path.basename(abs);
    const ok = await this.evaluate(
      `(async () => {
        const target = document.querySelector('[data-pmf-ref="${name}"]');
        if (!target) return false;
        const bin = atob(${JSON.stringify(b64)});
        const arr = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
        const file = new File([arr], ${JSON.stringify(fileName)});
        const dt = new DataTransfer();
        dt.items.add(file);
        for (const type of ['dragenter','dragover','drop']) {
          const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
          target.dispatchEvent(ev);
        }
        return true;
      })()`,
      { returnByValue: true, awaitPromise: true },
    );
    return { ok: Boolean(ok), how: "drop", file: abs };
  }

  /** 触发下载并等它落盘（返回目录里的新文件） */
  async download(ref, { intoDir } = {}) {
    const dir = intoDir ? path.resolve(intoDir) : path.join(os.homedir(), ".dsh", "browser-downloads");
    fs.mkdirSync(dir, { recursive: true });
    const before = new Set(fs.readdirSync(dir));
    await this.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir }).catch(() => {});
    await this.click(ref);
    const start = Date.now();
    let found = null;
    while (Date.now() - start < 60000) {
      await new Promise((r) => setTimeout(r, 400));
      const now = fs.readdirSync(dir);
      const fresh = now.filter((f) => !before.has(f) && !f.endsWith(".crdownload"));
      if (fresh.length) {
        const f = fresh[0];
        const full = path.join(dir, f);
        const size = fs.statSync(full).size;
        if (size > 0) {
          found = { file: full, size };
          break;
        }
      }
    }
    if (!found) return { ok: false, reason: "等了一分钟没等到下载完成", dir };
    return { ok: true, ...found };
  }

  async close() {
    try {
      this.conn.close();
    } catch {
      /* 已断开 */
    }
  }
}

export { DEFAULT_PORT as PORT };
