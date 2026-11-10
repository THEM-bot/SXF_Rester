import fs from 'node:fs';
import path from 'node:path';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function dosTime(date) {
  return ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
}

function dosDate(date) {
  return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
}

/** 去掉 UTF-8 BOM 后的可见长度判定。 */
export function isIndexHtmlContentEmpty(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').trim();
  return text.length === 0;
}

/**
 * 出包前门禁：源目录根下必须有非空 `index.html`（禁止 0 字节 / 仅空白）。
 * @param {string} sourceDir
 * @returns {string} 校验通过的 index.html 绝对路径
 */
export function assertPackableIndexHtml(sourceDir) {
  const src = path.resolve(sourceDir);
  const indexPath = path.join(src, 'index.html');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
    throw new Error(
      [
        '打包失败：源目录根下缺少 index.html，禁止打出无内容 Demo 包。',
        `路径：${src}`,
        '要求：须存在非空（去掉 BOM/空白后仍有内容）的 index.html。请补全页面后重试。',
      ].join('\n'),
    );
  }
  const buf = fs.readFileSync(indexPath);
  if (buf.length === 0 || isIndexHtmlContentEmpty(buf.toString('utf8'))) {
    throw new Error(
      [
        '打包失败：index.html 为空，禁止打出无内容 Demo 包。',
        `路径：${indexPath}`,
        '要求：index.html 去掉 BOM/空白后须有可见内容。请补全页面后重试。',
      ].join('\n'),
    );
  }
  return indexPath;
}

/**
 * Store-only ZIP (method 0) with forward slashes. No external deps.
 * @param {string} sourceDir
 * @param {string} outZip
 */
export function createZipFromDir(sourceDir, outZip) {
  const src = path.resolve(sourceDir);
  if (!fs.statSync(src).isDirectory()) {
    throw new Error(`Source is not a directory: ${src}`);
  }
  assertPackableIndexHtml(src);

  /** @type {{ name: string, data: Buffer, mtime: Date }[]} */
  const entries = [];
  function walk(dir, prefix = '') {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else {
        entries.push({
          name: rel.replace(/\\/g, '/'),
          data: fs.readFileSync(full),
          mtime: fs.statSync(full).mtime,
        });
      }
    }
  }
  walk(src);
  if (entries.length === 0) throw new Error(`No files under source: ${src}`);

  const parts = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const size = e.data.length;
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime(e.mtime), 10);
    local.writeUInt16LE(dosDate(e.mtime), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    parts.push(local, e.data);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(dosTime(e.mtime), 12);
    cen.writeUInt16LE(dosDate(e.mtime), 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(size, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);

    offset += local.length + e.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  const outDir = path.dirname(path.resolve(outZip));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outZip, Buffer.concat([...parts, centralBuf, end]));
}
