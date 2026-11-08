/**
 * 极简 docx 读取器：无第三方依赖，直接读 OOXML。
 * 目标：把 .docx（会议纪要 / 业务文档 / 总 PRD / 模块 PRD）转成结构清晰的 Markdown，
 *       供 Agent 做需求抽取，而不是把整坨 XML 丢进上下文。
 *
 * 用法：
 *   node tools/lib/docx.mjs <file.docx> [--out out.md]
 *   import { docxToMarkdown } from './lib/docx.mjs';
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ---------------- ZIP（只读，够用） ---------------- */

function readCentralDirectory(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 66560);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 docx/zip 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    entries.set(name, { method, csize, lho });
    off += 46 + nlen + elen + clen;
  }
  return entries;
}

function readEntry(buf, e) {
  const nlen = buf.readUInt16LE(e.lho + 26);
  const elen = buf.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nlen + elen;
  const raw = buf.subarray(start, start + e.csize);
  return e.method === 0 ? raw : zlib.inflateRawSync(raw);
}

/* ---------------- 极简 XML 扫描 ---------------- */

/** 取标签内所有 w:t 文本 */
function textOf(xml) {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml))) out += decode(m[1]);
  if (/<w:tab\s*\/>/.test(xml)) out = out.replace(/\u0009/g, ' ');
  return out;
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** 顶层按标签切块（够用版：只处理 body 的直接子节点） */
function topLevelBlocks(bodyXml) {
  const blocks = [];
  const re = /<w:(p|tbl)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:\1>)/g;
  let m;
  let cursor = 0;
  // 逐个匹配，跳过嵌套：靠"最短匹配 + 之后 reset"对 p 有效；tbl 用配对计数
  while ((m = re.exec(bodyXml))) {
    const start = m.index;
    const tag = m[1];
    if (tag === 'tbl') {
      // 重新用计数法找到配对结束
      const end = findClose(bodyXml, start, 'tbl');
      if (end < 0) break;
      blocks.push({ tag: 'tbl', xml: bodyXml.slice(start, end) });
      re.lastIndex = end;
      cursor = end;
    } else {
      blocks.push({ tag: 'p', xml: m[0] });
      cursor = re.lastIndex;
    }
    if (cursor >= bodyXml.length) break;
  }
  return blocks;
}

function findClose(xml, from, tag) {
  const openRe = new RegExp(`<w:${tag}\\b[^>]*?(?<!/)>`, 'g');
  const closeRe = new RegExp(`</w:${tag}>`, 'g');
  if (/^<w:tbl\b[^>]*\/>/.test(xml.slice(from))) return from + xml.slice(from).indexOf('/>') + 2;
  openRe.lastIndex = from;
  let depth = 0;
  let idx = from;
  const events = [];
  let m;
  while ((m = openRe.exec(xml))) {
    if (m.index < from) continue;
    events.push({ at: m.index, d: 1, len: m[0].length });
    if (events.length > 20000) break;
  }
  while ((m = closeRe.exec(xml))) {
    if (m.index < from) continue;
    events.push({ at: m.index, d: -1, len: m[0].length });
  }
  events.sort((a, b) => a.at - b.at || a.d - b.d);
  for (const e of events) {
    depth += e.d;
    if (depth === 0) {
      idx = e.at + e.len;
      return idx;
    }
  }
  return -1;
}

function styleOf(pXml) {
  const m = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  return m ? m[1] : '';
}

function cellProps(tcXml) {
  const span = tcXml.match(/<w:gridSpan\s+w:val="(\d+)"/);
  const vmerge = /<w:vMerge\b([^>]*)\/?>/.exec(tcXml);
  let v = '';
  if (vmerge) v = /w:val="(restart|continue)"/.exec(vmerge[1])?.[1] || 'continue';
  const widthM = tcXml.match(/<w:tcW\s+w:w="(\d+)"/);
  return { span: span ? Math.max(1, Number(span[1])) : 1, vmerge: v, width: widthM ? Number(widthM[1]) : 0 };
}

function rowsOf(tblXml) {
  const grid = [];
  const gre = /<w:gridCol\s+w:w="(\d+)"/g;
  let g;
  while ((g = gre.exec(tblXml))) grid.push(Number(g[1]));
  const rows = [];
  const meta = [];
  const re = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let m;
  while ((m = re.exec(tblXml))) {
    const cells = [];
    const infos = [];
    let col = 0;
    const cre = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let c;
    while ((c = cre.exec(m[1]))) {
      const info = cellProps(c[1]);
      if (!info.width && grid[col]) info.width = grid[col];
      info.col = col;
      col += info.span;
      infos.push(info);
      const paras = [];
      const pre = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
      let p;
      while ((p = pre.exec(c[1]))) {
        const t = textOf(p[1]).trim();
        if (t) paras.push(t);
      }
      if (!paras.length) {
        const t = textOf(c[1]).trim();
        if (t) paras.push(t);
      }
      cells.push(paras.join('<br>').replace(/\|/g, '\\|'));
    }
    if (cells.length) { rows.push(cells); meta.push(infos); }
  }
  return { rows, meta };
}

function tableToMarkdown(rows, meta = []) {
  if (!rows.length) return '';
  // 真实列数：优先用 tblGrid 的列数；没有则取各行按 span 累加后的最大值
  const spanSum = (i) => (meta[i] || []).reduce((n, x) => n + (x.span || 1), 0);
  const totalCols = Math.max(...rows.map((_, i) => spanSum(i)));
  const widthOf = (() => {
    const counts = new Map();
    rows.forEach((_, i) => {
      const m = meta[i] || [];
      m.forEach((info) => {
        if (info.vmerge === 'continue' || info.span > 1) return;
        const key = info.col ?? 0;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return (i, col, info) => {
      const m = meta[i] || [];
      if (m.length === 1) return 1;
      const siblings = m.filter((x) => x.vmerge !== 'continue').length;
      if (siblings <= 1) return 1;
      if (!info || info.span > 1) return 1;
      // 本行有几个正常格子，就说明这些列是「本行主列」；只有本行格子数达到最多行的口径才判为满宽
      return m.filter((x) => x.vmerge !== 'continue' && x.span === 1).length >= Math.max(...rows.map((_, k) => (meta[k] || []).filter((x) => x.vmerge !== 'continue' && x.span === 1).length)) ? 1 : 1;
    };
  })();
  void widthOf;
  const norm = rows.map((r, i) => {
    const m = meta[i] || [];
    const out = [];
    r.forEach((txt, j) => {
      const info = m[j] || { span: 1, vmerge: '' };
      out.push(info.vmerge === 'continue' ? '' : txt);
      for (let k = 1; k < (info.span || 1); k += 1) out.push('');
    });
    while (out.length < totalCols) out.push('');
    return out;
  });
  const head = norm[0];
  const body = norm.slice(1);
  const line = (a) => `| ${a.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...body.map(line)].join('\n');
}

/* ---------------- 主转换 ---------------- */

export function docxToMarkdown(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = readCentralDirectory(buf);
  const doc = entries.get('word/document.xml');
  if (!doc) throw new Error('docx 内缺少 word/document.xml');
  const xml = readEntry(buf, doc).toString('utf8');

  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : xml;
  const blocks = topLevelBlocks(bodyXml);

  const out = [];
  let inTable = false;
  let titleDone = false;
  for (const b of blocks) {
    if (b.tag === 'tbl') {
      const { rows, meta } = rowsOf(b.xml);
      if (rows.length) {
        out.push('');
        out.push(tableToMarkdown(rows, meta));
        out.push('');
      }
      inTable = true;
      continue;
    }
    const style = styleOf(b.xml);
    const text = textOf(b.xml).trim();
    if (!text) continue;
    // 约定：# = Heading 1 = 大纲一级；Title 是文档大标题，不属于章节层级，
    // 单独标成 <title>，避免把整篇标题层级顶掉一级（pmw 的 md→docx 也遵守此约定）
    if (/^Title$/i.test(style)) {
      if (!titleDone) {
        out.push(`<!-- title: ${text} -->`);
        titleDone = true;
      }
      inTable = false;
      continue;
    }
    const hm = style.match(/^(?:Heading|heading)(\d)$/);
    if (hm) out.push(`${'#'.repeat(Math.min(6, Number(hm[1])))} ${text}`);
    else if (/^(TOC|Contents)/i.test(style)) continue;
    else out.push(`${inTable ? '' : ''}${text}`);
    inTable = false;
    out.push('');
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------------- CLI ---------------- */

if (process.argv[1] && process.argv[1].endsWith('docx.mjs')) {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const oi = args.indexOf('--out');
  if (!input) {
    console.error('用法: node tools/lib/docx.mjs <file.docx> [--out out.md]');
    process.exit(2);
  }
  const md = docxToMarkdown(input);
  if (oi >= 0 && args[oi + 1]) {
    fs.writeFileSync(args[oi + 1], md, 'utf8');
    console.log(`已写出 ${args[oi + 1]}（${md.length} 字）`);
  } else {
    process.stdout.write(`${md}\n`);
  }
}
