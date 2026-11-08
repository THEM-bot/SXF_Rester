/**
 * Markdown → Word（基于 docx@9）。
 *
 * 为什么有它：PRD 的源文件是 Markdown，最终要交成 Word。旧实现 docxw.mjs 是
 * 手写 OOXML，做不了合并单元格 / 目录 / 页眉页脚 / 图片。这里用官方 docx 库，
 * 把企业 PRD 常用的排版一次做全。
 *
 * 支持的 Markdown 子集（够写 PRD）：
 *   # / ## / ### / ####      标题（1-4 级，进导航窗格、可生成目录）
 *   ---                      分页符（单独一行）
 *   ***                      水平分隔线
 *   - / * / 1. / 1)          项目符号 / 编号列表
 *   > 引用                    浅灰底引用块
 *   ``` 代码块 ```            等宽字体 + 灰底
 *   | 表格 |                  表格；`^^` 表示向上合并、`>>` 表示向右合并
 *   [文字](链接)              超链接
 *   **加粗** / *斜体* / `代码` 行内样式
 *   ![说明](图片路径)          图片（相对 md 文件目录或绝对路径）
 *   <br>                     单元格内换行
 *
 * 表格合并语法：
 *   | 变更型号 | 盘古供 | 必填 |
 *   | ^^       | OMS   | 拦截 |   ← 第一列与上一行合并
 *   | 横向     | >>    | >>   |   ← 横向合并到右边
 *
 * 用法：
 *   node tools/lib/wdocx.mjs <in.md> <out.docx> [--title "..."] [--no-toc] [--no-header]
 *   import { markdownToDocx } from './lib/wdocx.mjs';
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageSize, docxImageType, resolveImagePath, fitImage, parseImageLine } from './images.mjs';

const DOCX = 'docx';

let mod = null;
async function loadDocx() {
  if (mod) return mod;
  try {
    mod = await import(DOCX);
  } catch {
    // 退化：插件安装在 profile 里时，依赖在插件自己的 node_modules
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const local = path.join(here, '..', '..', 'node_modules', 'docx', 'dist', 'index.mjs');
    if (!fs.existsSync(local)) {
      throw new Error('缺少 docx 依赖：在插件目录执行 `npm install`（package.json 里已声明）');
    }
    mod = await import(pathToFileURL(local).href);
  }
  return mod;
}

/* ---------------- 行内样式 ---------------- */

/** 把一段行内 Markdown 拆成 runs。不递归，够用。 */
function inlineRuns(d, text, base = {}) {
  const { TextRun, ExternalHyperlink } = d;
  const runs = [];
  // 统一占位，先保护行内代码，避免 **`x`** 被拆坏
  const codes = [];
  let s = String(text ?? '').replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });

  const re = /(\*\*(?:[^*]|\*(?!\*))+\*\*)|(\*(?:[^*\n])+\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m;
  const push = (t, opts) => {
    if (!t) return;
    // 还原占位
    const parts = t.split(/\u0000(\d+)\u0000/);
    parts.forEach((p, idx) => {
      if (idx % 2 === 1) {
        runs.push(new TextRun({ ...base, ...opts, text: codes[Number(p)] || '', font: 'Consolas', shading: { fill: 'F2F2F2' } }));
      } else if (p) {
        runs.push(new TextRun({ ...base, ...opts, text: p }));
      }
    });
  };

  while ((m = re.exec(s))) {
    push(s.slice(last, m.index), {});
    if (m[1]) {
      push(m[1].slice(2, -2), { bold: true });
    } else if (m[2]) {
      push(m[2].slice(1, -1), { italics: true });
    } else if (m[3]) {
      const label = m[4];
      const url = m[5];
      runs.push(new ExternalHyperlink({
        children: [new TextRun({ ...base, text: label, style: 'Hyperlink', color: '0563C1', underline: {} })],
        link: url,
      }));
    }
    last = m.index + m[0].length;
  }
  push(s.slice(last), {});
  return runs.length ? runs : [new TextRun({ ...base, text: '' })];
}

/* ---------------- 表格 ---------------- */

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const isSepRow = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && isSepRow(lines[i + 1]);
}

function alignmentsFrom(sep) {
  return splitRow(sep).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    if (l && r) return 'center';
    if (r) return 'right';
    return 'left';
  });
}

/** 解析表格行 → 二维 {text, up, right} 网格（处理 ^^ 与 >>） */
function cellGrid(bodyRows) {
  return bodyRows.map((r) => r.map((t) => ({
    text: t,
    up: t === '^^',
    right: t === '>>',
  })));
}

function buildTable(d, header, body, aligns, opts = {}) {
  const { Table, TableRow, TableCell, Paragraph, WidthType, AlignmentType, ShadingType, VerticalAlign, BorderStyle } = d;
  const cols = header.length;
  const headShade = opts.headerShade || 'F2F2F2';
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const alignOf = (j) => (aligns[j] === 'center' ? AlignmentType.CENTER : aligns[j] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT);

  const para = (text, j, boldHint) => new Paragraph({
    alignment: alignOf(j),
    spacing: { before: 40, after: 40, line: 280 },
    children: text
      ? String(text).split('<br>').flatMap((seg, k) => {
        const rs = inlineRuns(d, seg.trim(), { bold: boldHint });
        if (k === 0) return rs;
        return [new d.TextRun({ break: 1 }), ...rs];
      })
      : [new Paragraph({ children: [] })].length ? [new d.TextRun({ text: '' })] : [],
  });

  // 计算竖向合并跨度：某个 ^^ 向上找最近的非 ^^ 行，累加到它的 rowSpan
  const spans = Array.from({ length: body.length }, () => Array(cols).fill(1));
  const skipMap = Array.from({ length: body.length }, () => Array(cols).fill(false));
  const grid = cellGrid(body);
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (cell.up) {
        skipMap[r][c] = true;
        let up = r - 1;
        while (up >= 0 && (skipMap[up][c] || grid[up]?.[c]?.up)) up -= 1;
        if (up >= 0) spans[up][c] += 1;
      }
    }
  }

  const mkCell = (text, j, extra = {}) => new TableCell({
    children: [para(text, j, extra.bold)],
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...extra.props,
  });

  const headRow = new TableRow({
    tableHeader: true,
    children: header.map((h, j) => mkCell(h, j, {
      bold: true,
      props: { shading: { type: ShadingType.CLEAR, fill: headShade } },
    })),
  });

  const rows = [headRow];
  for (let r = 0; r < grid.length; r += 1) {
    const children = [];
    for (let c = 0; c < cols; c += 1) {
      if (skipMap[r][c]) continue;
      const cell = grid[r][c];
      if (!cell) continue;
      // 横向合并：数右边连续几个 >>
      let span = 1;
      while (c + span < cols && grid[r][c + span]?.right) span += 1;
      const props = {};
      if (span > 1) props.columnSpan = span;
      if (spans[r][c] > 1) props.rowSpan = spans[r][c];
      children.push(mkCell(cell.text, c, { props }));
      c += span - 1;
    }
    if (children.length) rows.push(new TableRow({ children }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows,
  });
}

/* ---------------- 主转换 ---------------- */

/**
 * @param {string} md
 * @param {{title?:string, toc?:boolean, header?:string, footer?:boolean, author?:string, baseDir?:string}} opts
 * @returns {Promise<Buffer>}
 */
export async function markdownToBuffer(md, opts = {}) {
  return (await _render(md, opts)).buffer;
}

async function _render(md, opts = {}) {
  const d = await loadDocx();
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Header, Footer, PageNumber, TableOfContents, PageBreak, convertInchesToTwip,
  } = d;

  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const children = [];
  const baseDir = opts.baseDir || process.cwd();
  const FONT_BODY = { ascii: 'Microsoft YaHei', hAnsi: 'Microsoft YaHei', eastAsia: '微软雅黑', cs: 'Microsoft YaHei' };
  let inFence = false;
  let fenceBuf = [];
  let firstH1 = '';
  let headingSeen = 0;
  let figureNo = 0;
  const usedImages = [];
  const missingImages = [];

  const headingLevel = (n) => [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][n - 1] || HeadingLevel.HEADING_4;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // 代码块
    if (/^\s*```/.test(line)) {
      if (inFence) {
        children.push(new Paragraph({
          children: [new TextRun({ text: fenceBuf.join('\n'), font: 'Consolas', size: 18 })],
          shading: { fill: 'F5F5F5' },
          spacing: { before: 60, after: 120, line: 260 },
        }));
        fenceBuf = [];
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      continue;
    }

    // 空行
    if (!line.trim()) continue;

    // 分页符
    if (/^\s*---\s*$/.test(line)) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }

    // 水平线
    if (/^\s*(\*\s*\*\s*\*|___)\s*$/.test(line)) {
      children.push(new Paragraph({
        children: [],
        border: { bottom: { style: 'single', size: 6, color: 'BFBFBF', space: 1 } },
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    // 表格
    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const aligns = alignmentsFrom(lines[i + 1]);
      const body = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        if (isSepRow(lines[j])) { j += 1; continue; }
        body.push(splitRow(lines[j]));
        j += 1;
      }
      while (aligns.length < header.length) aligns.push('left');
      children.push(buildTable(d, header, body, aligns, opts));
      children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
      i = j - 1;
      continue;
    }

    // 标题
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = Math.min(hm[1].length, 4);
      const text = hm[2].trim();
      if (lvl === 1 && !firstH1) firstH1 = text;
      headingSeen += 1;
      // `#` 直接映射 Heading1（大纲一级），Word 导航窗格和目录才对得上；
      // 文档大标题不走 Markdown，用 --title 生成在正文之前。
      children.push(new Paragraph({ heading: headingLevel(lvl), children: inlineRuns(d, text) }));
      continue;
    }

    // 图片
    const im = parseImageLine(line);
    if (im) {
      const found = resolveImagePath(im.src, { baseDir, extraDirs: opts.extraDirs || [] });
      if (!found.file) {
        const hint = found.tried?.length ? `（试过 ${found.tried.join('、')}）` : '';
        missingImages.push({ src: im.src, alt: im.alt, tried: found.tried || [] });
        children.push(new Paragraph({
          children: [new TextRun({ text: `[图片缺失] ${im.alt || ''} ${im.src}${hint}`, italics: true, color: 'C00000' })],
          spacing: { before: 60, after: 60 },
        }));
        continue;
      }
      const buf = fs.readFileSync(found.file);
      const nat = imageSize(buf);
      const ext = path.extname(found.file).toLowerCase();
      if (ext === '.webp') {
        missingImages.push({ src: im.src, alt: im.alt, reason: 'webp 格式 Word 不支持，请先转成 png/jpg' });
        children.push(new Paragraph({
          children: [new TextRun({ text: `[图片格式不支持] ${im.alt || ''} ${im.src}（webp 请转 png/jpg）`, italics: true, color: 'C00000' })],
          spacing: { before: 60, after: 60 },
        }));
        continue;
      }
      const box = fitImage(nat, im.spec);
      figureNo += 1;
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 40 },
        keepNext: true,
        children: [new d.ImageRun({
          data: buf,
          transformation: { width: box.width, height: box.height },
          type: docxImageType(ext),
          altText: im.alt ? { name: im.alt, description: im.alt } : undefined,
        })],
      }));
      if (im.alt) {
        // 图注：图 N 说明，居中灰色小字，跟着图不跨页
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: [new TextRun({ text: `图 ${figureNo} ${im.alt}`, size: 18, color: '666666', font: FONT_BODY })],
        }));
      } else {
        // 没写说明的图也要留点间距
        children.push(new Paragraph({ children: [], spacing: { after: 100 } }));
      }
      usedImages.push({ src: path.relative(baseDir, found.file) || found.file, width: box.width, height: box.height });
      continue;
    }

    // 引用
    const qm = line.match(/^\s*>\s?(.*)$/);
    if (qm) {
      children.push(new Paragraph({
        children: inlineRuns(d, qm[1]),
        shading: { fill: 'F7F7F7' },
        indent: { left: convertInchesToTwip(0.25) },
        spacing: { before: 60, after: 60 },
        border: { left: { style: 'single', size: 12, color: 'C9C9C9', space: 8 } },
      }));
      continue;
    }

    // 列表
    const bm = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bm) {
      const level = Math.min(Math.floor(bm[1].length / 2), 3);
      children.push(new Paragraph({ bullet: { level }, children: inlineRuns(d, bm[2]) }));
      continue;
    }
    const om = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (om) {
      const level = Math.min(Math.floor(om[1].length / 2), 3);
      children.push(new Paragraph({ numbering: { reference: 'pmf-numbering', level }, children: inlineRuns(d, om[2]) }));
      continue;
    }

    // 普通段落
    children.push(new Paragraph({ children: inlineRuns(d, line.trim()) }));
  }

  if (inFence && fenceBuf.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: fenceBuf.join('\n'), font: 'Consolas', size: 18 })],
      shading: { fill: 'F5F5F5' },
    }));
  }

  const docTitle = opts.title || firstH1 || '文档';
  // 自己数标题个数（docx 的 Paragraph 实例上 heading 不是自有属性，读不到）
  const withToc = opts.toc !== false && headingSeen >= 2;
  const body = [];
  // 文档大标题用 Title 样式（不占大纲级别，目录从 `#` 那一级开始编号）
  if (opts.title !== false) {
    body.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: docTitle })] }));
  }
  if (withToc) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '目录' })] }));
    body.push(new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' }));
    body.push(new Paragraph({ children: [new PageBreak()] }));
  }
  body.push(...children);

  const section = {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1360, bottom: 1440, left: 1360, header: 851, footer: 992 },
      },
    },
    children: body,
  };

  if (opts.header !== false) {
    section.headers = {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: 'single', size: 4, color: 'D0D0D0', space: 2 } },
          children: [new TextRun({ text: opts.header || docTitle, size: 16, color: '888888' })],
        })],
      }),
    };
  }
  if (opts.footer !== false) {
    section.footers = {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '第 ', size: 16, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }),
            new TextRun({ text: ' 页 / 共 ', size: 16, color: '888888' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888' }),
            new TextRun({ text: ' 页', size: 16, color: '888888' }),
          ],
        })],
      }),
    };
  }

  const FONT = { ascii: 'Microsoft YaHei', hAnsi: 'Microsoft YaHei', eastAsia: '微软雅黑', cs: 'Microsoft YaHei' };
  const doc = new Document({
    creator: 'pm-flow',
    title: docTitle,
    description: opts.description || '',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21, color: '262626' },
          paragraph: { spacing: { line: 330, after: 100 } },
        },
        title: {
          run: { size: 36, bold: true, color: '1F3864', font: FONT },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 } },
        },
        heading1: {
          run: { size: 30, bold: true, color: '1F3864', font: FONT },
          paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0 },
        },
        heading2: {
          run: { size: 26, bold: true, color: '2E5496', font: FONT },
          paragraph: { spacing: { before: 240, after: 110 }, outlineLevel: 1 },
        },
        heading3: {
          run: { size: 23, bold: true, color: '2E5496', font: FONT },
          paragraph: { spacing: { before: 200, after: 90 }, outlineLevel: 2 },
        },
        heading4: {
          run: { size: 21, bold: true, color: '404040', font: FONT },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 3 },
        },
        hyperlink: { run: { color: '0563C1', underline: {} } },
      },
    },
    numbering: {
      config: [{
        reference: 'pmf-numbering',
        levels: [
          { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START },
          { level: 1, format: 'lowerLetter', text: '%2)', alignment: AlignmentType.START },
          { level: 2, format: 'lowerRoman', text: '%3.', alignment: AlignmentType.START },
          { level: 3, format: 'decimal', text: '%4.', alignment: AlignmentType.START },
        ],
      }],
    },
    sections: [section],
  });

  return { buffer: await Packer.toBuffer(doc), usedImages, missingImages, figureCount: figureNo };
}

/** 转 Word 并返回图片统计（不写文件）。 */
export async function renderMarkdown(md, opts = {}) {
  return _render(md, opts);
}

export async function markdownToDocx(md, outPath, opts = {}) {
  const r = await _render(md, opts);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, r.buffer);
  return outPath;
}

/** 转 Word 并返回图片统计（不写文件）。 */
export async function markdownToDocxDetailed(md, outPath, opts = {}) {
  const r = await _render(md, opts);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, r.buffer);
  return { path: outPath, bytes: r.buffer.length, usedImages: r.usedImages, missingImages: r.missingImages };
}

export async function mdFileToDocx(mdPath, outPath, opts = {}) {
  const md = fs.readFileSync(mdPath, 'utf8');
  return markdownToDocx(md, outPath, { baseDir: path.dirname(path.resolve(mdPath)), ...opts });
}

/* ---------------- CLI ---------------- */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('wdocx.mjs')) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const val = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const [mdFile, out] = positional;
  if (!mdFile || !out) {
    console.error('用法: node tools/lib/wdocx.mjs <in.md> <out.docx> [--title "..."] [--no-toc] [--no-header]');
    process.exit(2);
  }
  await mdFileToDocx(mdFile, out, {
    title: val('--title'),
    toc: !flag('--no-toc'),
    header: flag('--no-header') ? false : (val('--header') || undefined),
  });
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`已生成 ${out}（${kb} KB）`);
}
