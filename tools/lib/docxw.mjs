/**
 * 极简 docx 写出器：Markdown → .docx（无第三方依赖）。
 * 为什么需要它：你的 PRD 最终要作为 Word 附件传给研效通 / 企业微信文档，
 * 而工作流里的源文件是 Markdown。这样"本地为准、一键出 Word"才成立。
 *
 * 支持：# 标题（1-3级）、段落、- / 1. 列表、| 表格 |、``` 代码块、**加粗**、水平线 ---
 *
 * 用法：
 *   node tools/lib/docxw.mjs <in.md> <out.docx> [--title "文档标题"]
 *   import { markdownToDocx } from './lib/docxw.mjs';
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

/* ---------------- CRC32 ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ---------------- 极简 zip 写入（deflate） ---------------- */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.from(f.data, 'utf8');
    const comp = zlib.deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(dataBuf.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/* ---------------- XML 片段 ---------------- */
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** **bold** → runs */
function runs(text, extra = '') {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter((s) => s !== '');
  if (!parts.length) return `<w:r>${extra ? `<w:rPr>${extra}</w:rPr>` : ''}<w:t xml:space="preserve"></w:t></w:r>`;
  return parts
    .map((p) => {
      let t = p;
      let bold = false;
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        t = p.slice(2, -2);
        bold = true;
      }
      const rpr = [extra, bold ? '<w:b/>' : ''].filter(Boolean).join('');
      return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    })
    .join('');
}

function para(text, style, opts = {}) {
  const ppr = [];
  if (style) ppr.push(`<w:pStyle w:val="${style}"/>`);
  if (opts.num) ppr.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${opts.num}"/></w:numPr>`);
  if (opts.indent) ppr.push(`<w:ind w:left="${opts.indent}"/>`);
  return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${runs(text)}</w:p>`;
}

function table(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  const grid = `<w:tblGrid>${Array.from({ length: width }, () => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`;
  const border =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`)
      .join('') +
    '</w:tblBorders>';
  const trs = rows
    .map((cells, ri) => {
      const tcs = cells
        .map((c) => {
          const shd = ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
          const body = String(c)
            .split(/<br\s*\/?>/i)
            .map((line) => (ri === 0 ? `<w:p>${runs(`**${line}**`)}</w:p>` : `<w:p>${runs(line)}</w:p>`))
            .join('');
          return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shd}</w:tcPr>${body || '<w:p/>'}</w:tc>`;
        })
        .join('');
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${grid}${trs}</w:tbl><w:p/>`;
}

/* ---------------- Markdown → docx body ---------------- */
function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '\\' && t[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function markdownToBodyXml(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listId = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line.trim())) {
      i += 1;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      for (const l of buf) {
        out.push(
          `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr><w:r>${`<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="等线"/><w:sz w:val="18"/></w:rPr>`}<w:t xml:space="preserve">${esc(l || ' ')}</w:t></w:r></w:p>`,
        );
      }
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(table(rows));
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(3, h[1].length);
      out.push(para(h[2].trim(), lvl === 1 ? 'Title' : `Heading${lvl - 1}`));
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>');
      i += 1;
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      out.push(para(ul[1].trim(), 'ListParagraph', { indent: 420 }));
      i += 1;
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      listId += 1;
      out.push(para(`${ol[1].trim()}`, 'ListParagraph', { indent: 420 }));
      i += 1;
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    out.push(para(line.trim(), 'Normal'));
    i += 1;
  }

  return out.join('');
}

function stylesXml() {
  const h = (id, name, sz, color) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${id === 'Title' ? 0 : Number(id.replace('Heading', ''))}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles ${NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="微软雅黑"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:line="320" w:lineRule="auto" w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    h('Title', 'Title', 36, '1F3864') +
    h('Heading1', 'heading 1', 30, '1F3864') +
    h('Heading2', 'heading 2', 26, '2E5496') +
    h('Heading3', 'heading 3', 23, '2E5496') +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>' +
    '</w:styles>'
  );
}

export function markdownToDocx(md, outPath, title) {
  const body = markdownToBodyXml(md);
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document ${NS}><w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const coreXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${esc(title || path.basename(outPath, '.docx'))}</dc:title>` +
    '<cp:revision>1</cp:revision></cp:coreProperties>';

  const zip = buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: stylesXml() },
  ]);

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, zip);
  return outPath;
}

/* ---------------- CLI ---------------- */
if (process.argv[1] && process.argv[1].endsWith('docxw.mjs')) {
  const args = process.argv.slice(2);
  const md = args[0];
  const out = args[1];
  const ti = args.indexOf('--title');
  if (!md || !out) {
    console.error('用法: node tools/lib/docxw.mjs <in.md> <out.docx> [--title "..."]');
    process.exit(2);
  }
  const text = fs.readFileSync(md, 'utf8');
  markdownToDocx(text, out, ti >= 0 ? args[ti + 1] : undefined);
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`已生成 ${out}（${kb} KB）`);
}
