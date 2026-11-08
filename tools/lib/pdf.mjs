/**
 * PDF 读写：不引第三方库，借本机已有的两样东西。
 *
 *   读 → pdftotext（Git for Windows 自带 xpdf 4.x，在 <Git>/mingw64/bin/）
 *       自己有 PDF 解析器也能写，但中文 PDF 多半是 CID 字体 + ToUnicode CMap，
 *       手写解析在「看起来能跑」和「真的不丢字」之间隔着一整个月。
 *
 *   写 → Chrome headless --print-to-pdf
 *       不用 LibreOffice（这台机器没装），不用 PDF 库手搓字体子集（中文字体子集化是深坑）。
 *       Chrome 本来就在（浏览器工具要用它），排版用 CSS 写字，中文断行/分页都是现成的。
 *
 * 用法：
 *   node tools/lib/pdf.mjs read <file.pdf> [--layout] [--pages 1-5] [--out out.md]
 *   node tools/lib/pdf.mjs make <file.md> <out.pdf> [--title "标题"]
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/* ------------------------------------------------------------------ 找外部工具 */

const PDFTOTEXT_CANDIDATES = [
  "C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe",
  "C:\\Program Files\\Git\\usr\\bin\\pdftotext.exe",
  "C:\\Program Files (x86)\\Git\\mingw64\\bin\\pdftotext.exe",
  "C:\\Program Files\\xpdf-tools-win\\bin64\\pdftotext.exe",
  "/usr/bin/pdftotext",
  "/usr/local/bin/pdftotext",
  "/opt/homebrew/bin/pdftotext",
];

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

let cachedPdfToText;
let cachedChrome;

function firstExisting(list, envKey) {
  const fromEnv = envKey ? process.env[envKey] : "";
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const p of list) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 忽略 */
    }
  }
  return null;
}

export function findPdfToText() {
  if (cachedPdfToText !== undefined) return cachedPdfToText;
  cachedPdfToText = firstExisting(PDFTOTEXT_CANDIDATES, "PMF_PDFTOTEXT");

  // 再试 PATH
  if (!cachedPdfToText) {
    const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    const exe = process.platform === "win32" ? "pdftotext.exe" : "pdftotext";
    for (const d of dirs) {
      try {
        const p = path.join(d, exe);
        if (fs.existsSync(p)) {
          cachedPdfToText = p;
          break;
        }
      } catch {
        /* 忽略 */
      }
    }
  }
  return cachedPdfToText;
}

export function findChrome() {
  if (cachedChrome !== undefined) return cachedChrome;
  cachedChrome = firstExisting(CHROME_CANDIDATES, "PMF_CHROME");
  return cachedChrome;
}

export function missingPdfHint() {
  return [
    "找不到 pdftotext（读 PDF 需要它）。",
    "  最省事的办法：装 Git for Windows（大概率你已经装了，插件跑 bash 就靠它），",
    "    pdftotext.exe 会在 C:\\Program Files\\Git\\mingw64\\bin\\ 下。",
    "  或者：设环境变量 PMF_PDFTOTEXT 指向你机器上的 pdftotext.exe。",
    "  实在没有：把 PDF 用 Word 打开另存成 .docx，再用 pmw digest 转。",
  ].join("\n");
}

/* ------------------------------------------------------------------ 读 */

/**
 * PDF → 纯文本。
 * @param {string} file
 * @param {{layout?: boolean, firstPage?: number, lastPage?: number, raw?: boolean}} opts
 */
export async function pdfToText(file, opts = {}) {
  const bin = findPdfToText();
  if (!bin) {
    const err = new Error(missingPdfHint());
    err.code = "NO_PDFTOTEXT";
    throw err;
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`找不到文件：${abs}`);

  const args = ["-enc", "UTF-8"];
  if (opts.layout !== false) args.push("-layout");
  if (opts.raw) args.push("-raw");
  if (opts.firstPage) args.push("-f", String(opts.firstPage));
  if (opts.lastPage) args.push("-l", String(opts.lastPage));
  args.push(abs, "-"); // 输出到 stdout

  try {
    const { stdout } = await run(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return stdout.replace(/\r\n/g, "\n");
  } catch (e) {
    const msg = String(e.stderr || e.message || "");
    if (/Incorrect password|encrypted/i.test(msg)) throw new Error("这个 PDF 加密了，需要密码才能读。");
    if (/May not be a PDF|not a PDF/i.test(msg)) throw new Error("这不是有效的 PDF 文件。");
    throw new Error(`pdftotext 失败：${msg.split("\n")[0] || e.message}`);
  }
}

/** PDF 页数（顺带用 pdfinfo，没有就数换页符） */
export async function pdfPageCount(file) {
  const bin = findPdfToText();
  if (!bin) return null;
  const infoBin = bin.replace(/pdftotext(\.exe)?$/i, `pdfinfo${path.extname(bin)}`);
  try {
    if (fs.existsSync(infoBin)) {
      const { stdout } = await run(infoBin, ["-enc", "UTF-8", path.resolve(file)], { encoding: "utf8", windowsHide: true });
      const m = stdout.match(/^Pages:\s+(\d+)/m);
      if (m) return Number(m[1]);
    }
  } catch {
    /* 忽略 */
  }
  try {
    const text = await pdfToText(file, { layout: false });
    return text.split("\f").filter((s) => s.trim()).length || null;
  } catch {
    return null;
  }
}

/** 把 pdftotext 的输出整理成可读 Markdown（去页眉页脚重复行、合并断行、识别标题） */
export function cleanPdfText(text, { dropRunningHeads = true } = {}) {
  const pages = text.split("\f");
  let lines = pages.map((p) => p.split("\n"));

  // 页眉页脚：出现在多数页面的首行/末行且很短 → 去掉
  if (dropRunningHeads && pages.length >= 3) {
    const edgeFreq = (pick) => {
      const count = new Map();
      for (const pg of lines) {
        const raw = pick(pg);
        const s = (raw || "").trim();
        if (!s || s.length > 60) continue;
        count.set(s, (count.get(s) || 0) + 1);
      }
      return count;
    };
    const headFreq = edgeFreq((pg) => pg.find((l) => l.trim()));
    const tailFreq = edgeFreq((pg) => [...pg].reverse().find((l) => l.trim()));
    const threshold = Math.max(2, Math.ceil(pages.length * 0.5));
    const isRunning = (s) => (headFreq.get(s) || 0) >= threshold || (tailFreq.get(s) || 0) >= threshold;
    lines = lines.map((pg) => {
      const out = pg.filter((l) => !isRunning((l || "").trim()));
      return out;
    });
  }

  const flat = lines.flat();

  // 合并被版面硬切断的句子：上一行结尾不是句号/冒号/表格符号，且下一行不以序号/符号开头
  const merged = [];
  for (const raw of flat) {
    const line = raw.replace(/\s+$/g, "");
    const prev = merged[merged.length - 1];
    const startsNew =
      /^\s*([一二三四五六七八九十]+[、.]|第[一二三四五六七八九十\d]+[章节条]|[\d]+(\.[\d]+)*[、.\s]|[-*•·]|[（(][\d一二三四五六七八九十]+[)）]|#|\|)/.test(line);
    const prevEndsSoft = prev && !/[。！？；：.!?;:）)】」』"']$/.test(prev) && prev.trim().length > 12;
    if (prev !== undefined && prevEndsSoft && !startsNew && line.trim() && !/^\s*$/.test(line)) {
      merged[merged.length - 1] = `${prev}${/[\u4e00-\u9fa5]$/.test(prev) && /^[\u4e00-\u9fa5]/.test(line.trim()) ? "" : " "}${line.trim()}`;
    } else {
      merged.push(line);
    }
  }

  const out = merged.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // 保守识别标题：短行、无句号、下一行是正文
  const rows = out.split("\n");
  const md = rows.map((line) => {
    const t = line.trim();
    if (!t) return "";
    // 一、二、三 → 二级
    if (/^[一二三四五六七八九十]+、/.test(t) && t.length <= 40 && !/[。！？]/.test(t)) return `## ${t}`;
    // 1. 2. 3. 这种整节标题 → 二级；1.1 1.2 这种 → 三级
    if (/^\d+[.、]\s*\S/.test(t) && t.length <= 40 && !/[。！？]/.test(t)) return `## ${t}`;
    if (/^\d+\.\d+[\s.、]/.test(t) && t.length <= 50 && !/[。！？]/.test(t)) return `### ${t}`;
    return t;
  });
  return md.join("\n");
}

/** PDF → Markdown（一步到位） */
export async function pdfToMarkdown(file, opts = {}) {
  const text = await pdfToText(file, opts);
  const markdown = cleanPdfText(text, opts);
  const pages = text.split("\f").filter((s) => s.trim()).length;
  return { markdown, pages, chars: markdown.length };
}

/* ------------------------------------------------------------------ 写 */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

/** 极简 Markdown → HTML（够 PRD 排版用） */
export function markdownToHtml(md, { title = "", subtitle = "" } = {}) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let listType = null;
  let tableBuf = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
      .map((l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
      );
    if (rows.length) {
      out.push("<table>");
      out.push(
        `<thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`
      );
      out.push("<tbody>");
      for (const r of rows.slice(1)) {
        out.push(`<tr>${r.map((c) => `<td>${inline(c).replace(/&lt;br&gt;/g, "<br>")}</td>`).join("")}</tr>`);
      }
      out.push("</tbody></table>");
    }
    tableBuf = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^```/.test(line.trim())) {
      closeList();
      flushTable();
      if (inCode) out.push("</pre>");
      else out.push("<pre>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(raw));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      tableBuf.push(line);
      continue;
    }
    flushTable();

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lv = Math.min(h[1].length + 0, 6);
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      closeList();
      out.push("<hr>");
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      out.push("");
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  flushTable();
  if (inCode) out.push("</pre>");

  const body = out.join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title || "文档")}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif; font-size: 10.5pt;
         line-height: 1.75; color: #1a1a1a; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 6pt; letter-spacing: .5pt; }
  h2 { font-size: 14pt; margin: 18pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.5pt solid #2f5597; }
  h3 { font-size: 12pt; margin: 14pt 0 6pt; color: #2f5597; }
  h4, h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  .subtitle { color: #666; font-size: 9.5pt; margin: 0 0 16pt; padding-bottom: 8pt; border-bottom: .5pt solid #ddd; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 9pt;
          page-break-inside: auto; }
  th { background: #e8eef7; font-weight: 600; text-align: left; }
  th, td { border: .5pt solid #bfbfbf; padding: 4pt 6pt; vertical-align: top; }
  tr { page-break-inside: avoid; }
  ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
  li { margin: 2pt 0; }
  code { font-family: Consolas, "Courier New", monospace; background: #f4f4f4; padding: 0 2pt; font-size: 9pt; }
  pre { background: #f6f8fa; border: .5pt solid #e1e4e8; padding: 8pt; font-size: 8.5pt;
        font-family: Consolas, monospace; white-space: pre-wrap; word-break: break-all; overflow: hidden; }
  hr { border: none; border-top: .5pt solid #ddd; margin: 14pt 0; }
  h2, h3 { page-break-after: avoid; }
</style></head>
<body>
${title ? `<h1>${esc(title)}</h1>` : ""}
${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ""}
${body}
</body></html>`;
}

/**
 * Markdown → PDF（Chrome headless 打印）。
 * @param {string} md
 * @param {string} outPath
 * @param {{title?: string, subtitle?: string, keepHtml?: boolean}} opts
 */
export async function markdownToPdf(md, outPath, opts = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "找不到 Chrome/Edge（出 PDF 需要它来做排版渲染）。\n  装一个 Chrome，或设环境变量 PMF_CHROME 指向 chrome.exe。"
    );
  }
  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmf-pdf-"));
  const htmlPath = path.join(tmpDir, "doc.html");
  const headerPath = path.join(tmpDir, "header.html");
  const footerPath = path.join(tmpDir, "footer.html");
  const profileDir = path.join(tmpDir, "profile");

  const html = markdownToHtml(md, { title: opts.title || "", subtitle: opts.subtitle || "" });
  fs.writeFileSync(htmlPath, html, "utf8");
  // 页眉页脚留空（Chrome 默认会打印 URL 和日期，很难看）
  fs.writeFileSync(headerPath, "<html><body></body></html>", "utf8");
  fs.writeFileSync(footerPath, "<html><body></body></html>", "utf8");

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--virtual-time-budget=8000",
    `--user-data-dir=${profileDir}`,
    "--no-pdf-header-footer",
    `--print-to-pdf=${abs}`,
    fileUrl,
  ];

  try {
    await run(chrome, args, { timeout: 120000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    // Chrome 有时先输出文件再以非零码退出，检查文件是否已生成
    if (!fs.existsSync(abs) || fs.statSync(abs).size < 800) {
      throw new Error(`Chrome 打印 PDF 失败：${String(e.stderr || e.message).split("\n")[0]}`);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }

  if (!fs.existsSync(abs)) throw new Error("PDF 没有生成（Chrome 可能被占用了默认 profile）");
  const size = fs.statSync(abs).size;
  if (size < 800) throw new Error(`生成的 PDF 太小（${size} 字节），可能是空文档`);
  return { path: abs, bytes: size };
}

/* ------------------------------------------------------------------ CLI */

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  const flag = (n) => {
    const i = rest.indexOf(`--${n}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));

  if (cmd === "read") {
    const file = positional[0];
    if (!file) {
      console.error("用法：node tools/lib/pdf.mjs read <file.pdf> [--pages 1-5] [--out out.md]");
      process.exit(2);
    }
    let firstPage;
    let lastPage;
    const range = flag("pages");
    if (range) {
      const [a, b] = range.split("-");
      firstPage = Number(a) || undefined;
      lastPage = Number(b) || firstPage;
    }
    const { markdown, pages } = await pdfToMarkdown(file, { firstPage, lastPage });
    const out = flag("out");
    if (out) {
      fs.writeFileSync(out, markdown, "utf8");
      console.error(`✓ ${pages} 页 → ${out}（${markdown.length} 字）`);
    } else {
      console.log(markdown);
    }
    return;
  }

  if (cmd === "make") {
    const [mdFile, out] = positional;
    if (!mdFile || !out) {
      console.error('用法：node tools/lib/pdf.mjs make <file.md> <out.pdf> [--title "标题"]');
      process.exit(2);
    }
    const md = fs.readFileSync(mdFile, "utf8");
    const r = await markdownToPdf(md, out, { title: flag("title") || "" });
    console.error(`✓ → ${r.path}（${Math.round(r.bytes / 1024)} KB）`);
    return;
  }

  if (cmd === "doctor") {
    const bin = findPdfToText();
    const chrome = findChrome();
    console.log(`pdftotext: ${bin || "✗ 没找到"}`);
    console.log(`chrome   : ${chrome || "✗ 没找到"}`);
    return;
  }

  console.error("可用命令：read / make / doctor");
  process.exit(2);
}

if (process.argv[1]?.endsWith("pdf.mjs")) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
