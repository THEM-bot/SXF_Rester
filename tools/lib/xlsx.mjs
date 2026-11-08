/**
 * 极简 xlsx 读写器：零依赖，直接读写 OOXML。
 *
 * 为什么自己写：这个插件读 docx 就是手写 zip+XML，xlsx 同一套手法，
 * 不值得为「读个表」引入 exceljs（1MB+，还得担心和 docx@9 打架）。
 *
 * 读的能力（覆盖真实工作里见过的表）：
 *   - 多 sheet、sheet 名、列宽、合并单元格、冻结行
 *   - 单元格类型：共享字符串 / 内联字符串 / 公式字符串 / 数字 / 布尔 / 错误
 *   - 日期：靠 styles.xml 的 numFmtId 判断，转成 2026-11-07 这样的文本
 *   - 稀疏单元格按列号对齐（A1,B1,D1 → 第三列留空，不会错位）
 *
 * 写的能力：
 *   - 多 sheet、表头灰底加粗居中、细边框、自动换行、列宽、冻结表头、自动筛选
 *   - 数字右对齐、文本左对齐；表头冻结后滚动仍可见
 *
 * 用法：
 *   node tools/lib/xlsx.mjs read <file.xlsx> [--sheet 名字或序号] [--max-rows N] [--out out.md]
 *   node tools/lib/xlsx.mjs sheets <file.xlsx>
 *   node tools/lib/xlsx.mjs write <spec.json> <out.xlsx>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/* ==========================================================================
 * ZIP：读 + 写（够 xlsx 用；跟 docx 那套同源，但这里自带一份，互不影响）
 * ========================================================================== */

function readCentralDirectory(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 66560);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 xlsx（找不到 zip 结束记录）");
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
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
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

function unzip(file) {
  const buf = fs.readFileSync(file);
  const entries = readCentralDirectory(buf);
  const out = new Map();
  for (const [name, e] of entries) out.set(name, readEntry(buf, e));
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8");
    const comp = zlib.deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    chunks.push(local, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(dataBuf.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/* ==========================================================================
 * XML 小工具
 * ========================================================================== */

function decode(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : "";
}

/** 列字母 → 0 基列号（A=0, Z=25, AA=26） */
export function colIndex(ref) {
  const letters = String(ref).replace(/[^A-Za-z]/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colName(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ==========================================================================
 * 读
 * ========================================================================== */

const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function parseStyles(xml) {
  const custom = new Map(); // numFmtId -> formatCode
  for (const m of String(xml).matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1], "numFmtId"));
    const code = decode(attr(m[1], "formatCode"));
    if (Number.isFinite(id)) custom.set(id, code);
  }
  const xfFmt = []; // cellXfs 顺序 → numFmtId
  const cellXfs = String(xml).match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (cellXfs) {
    for (const m of cellXfs[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
      xfFmt.push(Number(attr(m[1], "numFmtId") || 0));
    }
  }
  return { custom, xfFmt };
}

function isDateStyle(styles, s) {
  const id = styles.xfFmt[s];
  if (id === undefined) return false;
  if (DATE_FMT_IDS.has(id)) return true;
  const code = styles.custom.get(id);
  if (!code) return false;
  // 带 y/m/d/h/s 且不是纯文本格式
  return /[ymdhs]/i.test(code) && !/^[#0.,%\s]+$/.test(code) && !/"$/.test(code);
}

function serialToDate(n) {
  // Excel 1900 日期系统：序列 1 = 1900-01-01；序列 60 是那个不存在的 2/29
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(n);
  const hasTime = n % 1 !== 0;
  const pad = (v) => String(v).padStart(2, "0");
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (!hasTime) return ymd;
  return `${ymd} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  const s = String(xml);
  for (const m of s.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // si 里可能是单个 <t>，也可能是若干 <r><t>（富文本）
    let text = "";
    for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decode(t[1]);
    out.push(text);
  }
  return out;
}

function parseSheet(xml, shared, styles) {
  const s = String(xml);
  const rows = [];
  const merges = [];
  let maxCol = 0;

  for (const rm of s.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rAttr = Number(attr(rm[1], "r") || 0);
    const cells = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1];
      const body = cm[2] || "";
      const ref = attr(a, "r");
      const t = attr(a, "t");
      const sIdx = Number(attr(a, "s") || 0);
      const col = ref ? colIndex(ref) : cells.length;

      let value = null;
      if (t === "inlineStr") {
        let text = "";
        for (const tm of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decode(tm[1]);
        value = text;
      } else {
        const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw = vm ? decode(vm[1]) : "";
        if (t === "s") value = shared[Number(raw)] ?? "";
        else if (t === "str") value = raw;
        else if (t === "b") value = raw === "1";
        else if (t === "e") value = raw;
        else if (raw === "") value = null;
        else if (isDateStyle(styles, sIdx) && Number.isFinite(Number(raw))) value = serialToDate(Number(raw));
        else value = Number.isFinite(Number(raw)) ? Number(raw) : raw;
      }
      cells[col] = value;
      if (col + 1 > maxCol) maxCol = col + 1;
    }
    // 稀疏单元格补空
    const arr = [];
    for (let i = 0; i < maxCol; i += 1) arr.push(cells[i] === undefined ? null : cells[i]);
    rows[rAttr > 0 ? rAttr - 1 : rows.length] = arr;
  }

  // 补齐行，保证 rows 是稠密二维数组
  const dense = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const arr = [];
    for (let j = 0; j < maxCol; j += 1) arr.push(r[j] === undefined ? null : r[j]);
    dense.push(arr);
  }

  for (const mm of s.matchAll(/<mergeCell\b([^>]*)\/?>/g)) {
    const ref = attr(mm[1], "ref");
    if (ref) merges.push(ref);
  }

  const merges2 = merges.map((ref) => {
    const [a, b] = ref.split(":");
    return { ref, from: a, to: b };
  });

  const cols = [];
  for (const cm of s.matchAll(/<col\b([^>]*)\/?>/g)) {
    const min = Number(attr(cm[1], "min") || 1) - 1;
    const max = Number(attr(cm[1], "max") || 1) - 1;
    const width = Number(attr(cm[1], "width") || 0);
    for (let i = min; i <= max; i += 1) cols[i] = width;
  }

  const frozen = /state="frozen"/.test(s) ? { ySplit: Number((s.match(/<pane\b[^>]*ySplit="(\d+)"/) || [])[1] || 0) } : null;

  return { rows: dense, cols, merges: merges2, maxCol, frozen };
}

function sheetTargets(zip) {
  const wb = zip.get("xl/workbook.xml");
  const rels = zip.get("xl/_rels/workbook.xml.rels");
  const relMap = new Map();
  if (rels) {
    for (const m of String(rels).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = attr(m[1], "Id");
      let target = attr(m[1], "Target");
      if (target.startsWith("/")) target = target.slice(1);
      else if (!target.startsWith("xl/")) target = `xl/${target}`;
      relMap.set(id, target);
    }
  }
  const out = [];
  if (wb) {
    for (const m of String(wb).matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const name = decode(attr(m[1], "name"));
      const rid = attr(m[1], "r:id") || attr(m[1], "id");
      const hidden = attr(m[1], "state") === "hidden";
      out.push({ name, path: relMap.get(rid) || "", hidden });
    }
  }
  return out;
}

/** 读一个 xlsx → { sheets: [{name, rows, cols, merges, hidden}], good } */
export function readXlsx(file) {
  const zip = unzip(file);
  const styles = parseStyles(zip.get("xl/styles.xml")?.toString("utf8") || "");
  const shared = parseSharedStrings(zip.get("xl/sharedStrings.xml")?.toString("utf8") || "");
  const targets = sheetTargets(zip);

  const sheets = [];
  targets.forEach((t, i) => {
    const key = t.path || `xl/worksheets/sheet${i + 1}.xml`;
    const xml = zip.get(key)?.toString("utf8");
    if (!xml) return;
    const data = parseSheet(xml, shared, styles);
    sheets.push({ name: t.name || `Sheet${i + 1}`, hidden: t.hidden, ...data });
  });

  // 兜底：workbook 里没登记但文件包里有 sheet
  if (!sheets.length) {
    for (const [name, buf] of zip) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
      const data = parseSheet(buf.toString("utf8"), shared, styles);
      sheets.push({ name: path.basename(name, ".xml"), hidden: false, ...data });
    }
  }
  return { sheets, paths: [...zip.keys()] };
}

function cellText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v).replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

/** 一个 sheet → Markdown 表格（首行当表头；行数超限截断并注明） */
export function sheetToMarkdown(sheet, { maxRows = 200, headerRows = 1 } = {}) {
  const rows = sheet.rows.filter((r) => r.some((v) => v !== null && v !== ""));
  if (!rows.length) return `_（${sheet.name} 是空表）_`;
  const head = rows.slice(0, headerRows);
  const body = rows.slice(headerRows);
  const shown = body.slice(0, maxRows);
  const colCount = Math.max(sheet.maxCol, head[0]?.length || 0);

  const line = (arr) => {
    const cells = [];
    for (let i = 0; i < colCount; i += 1) cells.push(cellText(arr[i]) || " ");
    return `| ${cells.join(" | ")} |`;
  };

  const out = [];
  const headRows = head.length && head[0].some((v) => v !== null && v !== "") ? head : [new Array(colCount).fill("")];
  for (const h of headRows) out.push(line(h));
  out.push(`| ${new Array(colCount).fill("---").join(" | ")} |`);
  for (const r of shown) out.push(line(r));
  if (body.length > shown.length) out.push(`\n_（共 ${rows.length} 行，只显示前 ${headerRows + shown.length} 行）_`);
  return out.join("\n");
}

/** 读 xlsx → Markdown（多 sheet 分节） */
export function xlsxToMarkdown(file, { sheet = null, maxRows = 200 } = {}) {
  const { sheets } = readXlsx(file);
  const picked =
    sheet === null || sheet === undefined
      ? sheets
      : sheets.filter((s, i) => String(s.name) === String(sheet) || String(i + 1) === String(sheet));
  if (!picked.length) throw new Error(`没有这个 sheet：${sheet}（有：${sheets.map((s) => s.name).join(" / ")}）`);
  const parts = picked.map((s) => `## ${s.name}\n\n${sheetToMarkdown(s, { maxRows })}`);
  return { markdown: parts.join("\n\n"), sheets: sheets.map((s) => s.name), picked: picked.map((s) => s.name) };
}

/* ==========================================================================
 * 写
 * ========================================================================== */

const XLSX_CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
%s
</Types>`;

const XLSX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

// 样式表：
//  0 默认
//  1 表头（加粗、灰底、细边框、居中、换行）
//  2 正文文本（细边框、左对齐、顶部对齐、换行）
//  3 正文数字（细边框、右对齐）
//  4 标题行（大号加粗、无边框）
//  5 说明行（灰色小字、无边框、换行）
const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><name val="Microsoft YaHei"/></font>
<font><b/><sz val="11"/><name val="Microsoft YaHei"/></font>
<font><sz val="14"/><b/><name val="Microsoft YaHei"/></font>
<font><sz val="10"/><color rgb="FF666666"/><name val="Microsoft YaHei"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

function sheetXml(sheet, idx) {
  const cols = sheet.columns || [];
  const rows = sheet.rows || [];
  const title = sheet.title ? String(sheet.title) : "";
  const note = sheet.note ? String(sheet.note) : "";
  const colCount = Math.max(cols.length, ...rows.map((r) => (r ? r.length : 0)), 1);

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  parts.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`);

  if (title || note) {
    const top = 1;
    parts.push(`<sheetData/>`);
    // 用 sheetData 里的行承载标题（简化：标题也走行）
    parts.pop();
  }

  if (cols.length) {
    parts.push(`<cols>`);
    cols.forEach((c, i) => {
      const w = Number(c.width) > 0 ? Number(c.width) : 14;
      parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`);
    });
    parts.push(`</cols>`);
  }

  const allRows = [];
  if (title) allRows.push({ kind: "title", cells: [title] });
  if (note) allRows.push({ kind: "note", cells: [note] });
  if (cols.length) allRows.push({ kind: "header", cells: cols.map((c) => c.header ?? "") });
  for (const r of rows) allRows.push({ kind: "body", cells: r || [] });

  const freezeRow = (title ? 1 : 0) + (note ? 1 : 0) + (cols.length ? 1 : 0);
  const showFilter = cols.length > 0 && rows.length >= 1;

  parts.push(`<sheetViews><sheetView workbookViewId="0">`);
  if (freezeRow > 0) {
    parts.push(
      `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/>`
    );
  }
  parts.push(`</sheetView></sheetViews>`);
  parts.push(`<sheetFormatPr defaultRowHeight="15"/>`);
  parts.push(`<sheetData>`);

  allRows.forEach((row, ri) => {
    const r = ri + 1;
    const hAttr = row.kind === "title" ? ` ht="26" customHeight="1"` : row.kind === "header" ? ` ht="28" customHeight="1"` : "";
    parts.push(`<row r="${r}"${hAttr}>`);
    const cells = row.cells;
    for (let ci = 0; ci < Math.max(cells.length, row.kind === "header" ? colCount : 0); ci += 1) {
      const v = cells[ci];
      const ref = `${colName(ci)}${r}`;
      if (v === null || v === undefined || v === "") {
        if (row.kind === "body" || row.kind === "header") parts.push(`<c r="${ref}" s="${row.kind === "header" ? 1 : 2}"/>`);
        continue;
      }
      if (row.kind === "title") {
        parts.push(`<c r="${ref}" s="4" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
        continue;
      }
      if (row.kind === "note") {
        parts.push(`<c r="${ref}" s="5" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
        continue;
      }
      if (row.kind === "header") {
        parts.push(`<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
        continue;
      }
      // body
      if (typeof v === "number" && Number.isFinite(v)) {
        parts.push(`<c r="${ref}" s="3"><v>${v}</v></c>`);
      } else if (typeof v === "boolean") {
        parts.push(`<c r="${ref}" s="2" t="b"><v>${v ? 1 : 0}</v></c>`);
      } else {
        parts.push(`<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
    }
    // 表头行补足空列，保持底色连续
    if (row.kind === "header") {
      for (let ci = cells.length; ci < colCount; ci += 1) {
        parts.push(`<c r="${colName(ci)}${r}" s="1"/>`);
      }
    }
    parts.push(`</row>`);
  });

  parts.push(`</sheetData>`);
  if (showFilter) {
    parts.push(
      `<autoFilter ref="A${freezeRow}:${colName(colCount - 1)}${freezeRow + Math.max(rows.length, 1)}"/>`
    );
  }
  parts.push(`</worksheet>`);
  return parts.join("");
}

/**
 * 写 xlsx。
 * spec = {
 *   sheets: [{
 *     name: "需求总览",
 *     title: "可选的大标题",
 *     note: "可选的灰色说明",
 *     columns: [{ header: "编号", width: 14 }, ...],
 *     rows: [["REQ-1", "标题", 3], ...]
 *   }]
 * }
 */
export function writeXlsx(file, spec) {
  const sheets = (spec.sheets || []).filter(Boolean);
  if (!sheets.length) throw new Error("没有 sheet 可写");
  const names = sheets.map((s, i) => String(s.name || `Sheet${i + 1}`).slice(0, 31).replace(/[[\]:*?/\\]/g, "_"));

  const files = [];
  files.push({ name: "[Content_Types].xml", data: XLSX_CT.replace("%s", names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")) });
  files.push({ name: "_rels/.rels", data: XLSX_RELS });
  files.push({
    name: "xl/workbook.xml",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 2}"/>`).join("") +
      `</sheets></workbook>`,
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      names
        .map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("") +
      `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  });
  files.push({ name: "xl/styles.xml", data: XLSX_STYLES });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, i) }));

  const buf = buildZip(files);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, buf);
  return { path: path.resolve(file), bytes: buf.length, sheets: names, rows: sheets.reduce((n, s) => n + (s.rows?.length || 0), 0) };
}

/* ==========================================================================
 * CLI
 * ========================================================================== */

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const has = (name) => rest.includes(`--${name}`);
  const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));

  if (cmd === "read") {
    const file = positional[0];
    if (!file) {
      console.error("用法：node tools/lib/xlsx.mjs read <file.xlsx> [--sheet 名字] [--max-rows N] [--out out.md]");
      process.exit(2);
    }
    const { markdown, sheets } = xlsxToMarkdown(file, {
      sheet: flag("sheet") ?? null,
      maxRows: Number(flag("max-rows") || 200),
    });
    const out = flag("out");
    if (out) {
      fs.writeFileSync(out, markdown, "utf8");
      console.error(`✓ ${sheets.join(" / ")} → ${out}（${markdown.length} 字）`);
    } else {
      console.log(markdown);
    }
    return;
  }

  if (cmd === "sheets") {
    const file = positional[0];
    if (!file) {
      console.error("用法：node tools/lib/xlsx.mjs sheets <file.xlsx>");
      process.exit(2);
    }
    const { sheets } = readXlsx(file);
    for (const s of sheets) {
      console.log(`${s.name}  ${s.rows.length} 行 × ${s.maxCol} 列${s.hidden ? "（隐藏）" : ""}${s.merges.length ? `  合并 ${s.merges.length} 处` : ""}`);
    }
    return;
  }

  if (cmd === "write") {
    const [specFile, out] = positional;
    if (!specFile || !out) {
      console.error("用法：node tools/lib/xlsx.mjs write <spec.json> <out.xlsx>");
      process.exit(2);
    }
    const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
    const r = writeXlsx(out, spec);
    console.error(`✓ ${r.sheets.join(" / ")} → ${r.path}（${r.bytes} 字节，${r.rows} 行）`);
    return;
  }

  console.error("可用命令：read / sheets / write");
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("xlsx.mjs")) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
