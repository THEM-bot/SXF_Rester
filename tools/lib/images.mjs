/**
 * 图片处理：读真实像素尺寸、找文件、算版心适配。
 *
 * 为什么单独一个文件：Word 里插图最容易出两类错——比例被拉变形、路径找不到。
 * 这里把「读尺寸」和「找文件」两件事做扎实，wdocx.mjs 只负责排版。
 *
 * 支持的格式：PNG / JPEG / GIF / BMP / WEBP（webp 尺寸读得到，但 docx 不支持内嵌）
 */
import fs from 'node:fs';
import path from 'node:path';

/** A4 纵向、左右各 24mm 页边距后的版心宽度（px，按 96 dpi 折算）。 */
export const CONTENT_WIDTH_PX = 600;

/**
 * 读图片像素尺寸。
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, type: string } | null}
 */
export function imageSize(buf) {
  if (!buf || buf.length < 16) return null;

  // PNG：8 字节签名 + IHDR（宽高各 4 字节大端）
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }

  // GIF：头 6 字节 + 逻辑屏幕宽高（小端 2 字节）
  if (buf.length >= 10 && buf.slice(0, 3).toString('latin1') === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
  }

  // BMP：偏移 18/22 的 4 字节小端有符号
  if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)), type: 'bmp' };
  }

  // WEBP：RIFF....WEBP，再按 VP8 / VP8L / VP8X 分别读
  if (buf.length >= 30 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    const kind = buf.slice(12, 16).toString('latin1');
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), type: 'webp' };
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: 'webp' };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: 'webp' };
    }
    return null;
  }

  // JPEG：扫 SOF0-SOF15（排除 DHT/JPG/ DAC），段内宽高各 2 字节大端
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      // 无长度字段的标记
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: 'jpg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * 把常见后缀映射成 docx 认的类型。docx 只吃 png/jpg/gif/bmp。
 * @returns {'png'|'jpg'|'gif'|'bmp'}
 */
export function docxImageType(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (e === 'png') return 'png';
  if (e === 'gif') return 'gif';
  if (e === 'bmp') return 'bmp';
  return 'jpg'; // jpg / jpeg / jfif / webp（webp 会失败，调用方先拦）
}

/**
 * 按多级候选目录找图片。用户写 `shots/a.png` 时，可能相对于 md 文件、
 * 也可能相对于工作区根（很多人习惯把 shots 放在工作区下）。
 *
 * @param {string} p 用户写的路径
 * @param {{ baseDir?: string, extraDirs?: string[] }} ctx
 * @returns {{ file: string } | { missing: string, tried: string[] }}
 */
export function resolveImagePath(p, ctx = {}) {
  const raw = String(p || '').trim().replace(/^file:\/\//i, '');
  if (!raw) return { missing: '', tried: [] };
  if (/^[a-z]+:\/\//i.test(raw)) return { missing: raw, tried: [] }; // http(s) 等外链，不内嵌

  const cands = [];
  if (path.isAbsolute(raw)) cands.push(raw);
  else {
    if (ctx.baseDir) cands.push(path.resolve(ctx.baseDir, raw));
    for (const d of ctx.extraDirs || []) if (d) cands.push(path.resolve(d, raw));
    cands.push(path.resolve(raw));
  }
  // 去重，保持顺序
  const tried = [...new Set(cands.map((c) => path.normalize(c)))];
  for (const c of tried) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: c };
    } catch { /* 权限等问题，当作没找到 */ }
  }
  return { missing: raw, tried };
}

/**
 * 按版心宽度与原始比例算最终尺寸。
 *
 * @param {{width:number,height:number}|null} nat 原始尺寸（读不到时传 null）
 * @param {{ width?: number, height?: number, scale?: number }} spec 用户指定的尺寸
 * @returns {{ width: number, height: number }}
 */
export function fitImage(nat, spec = {}) {
  const maxW = CONTENT_WIDTH_PX;
  // 读不到尺寸时退化成 4:3，至少不会算出 0 或 NaN
  const nw = nat && nat.width > 0 ? nat.width : maxW;
  const nh = nat && nat.height > 0 ? nat.height : Math.round(maxW * 0.75);
  const ratio = nh / nw;

  let w = Number(spec.width) || 0;
  let h = Number(spec.height) || 0;

  if (!w && !h) {
    // 默认：撑满版心；但比版心小的图不放大（放大只会变糊）
    w = Math.min(nw, maxW);
    h = Math.round(w * ratio);
  } else if (w && h) {
    // 两个都给了就尊重，但要卡在版心内
    if (w > maxW) { const k = maxW / w; w = maxW; h = Math.round(h * k); }
  } else if (w) {
    if (w > maxW) w = maxW;
    h = Math.round(w * ratio);
  } else {
    h = Math.min(h, Math.round(maxW * ratio));
    w = Math.round(h / ratio);
    if (w > maxW) { w = maxW; h = Math.round(w * ratio); }
  }

  // 极矮或极窄的图，给个下限免得显示不出来
  return { width: Math.max(24, Math.round(w)), height: Math.max(12, Math.round(h)) };
}

/**
 * 解析 md 图片行尾的尺寸后缀：
 *   ![说明](a.png)              → 默认
 *   ![说明](a.png){400}         → 宽 400，按比例
 *   ![说明](a.png){400x220}     → 400×220
 *   ![说明](a.png){50%}         → 版心的 50%
 *   ![说明](a.png)!            → 不编号也没图注（只出图）
 */
export function parseImageLine(line) {
  const m = String(line).match(/^\s*!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)\s*(\{[^}]*\})?\s*$/);
  if (!m) return null;
  const alt = m[1].trim();
  const src = m[2].trim();
  const sizeRaw = (m[3] || '').replace(/[{}]/g, '').trim();

  const spec = {};
  if (sizeRaw) {
    const pct = sizeRaw.match(/^(\d+(?:\.\d+)?)%$/);
    const pair = sizeRaw.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    const single = sizeRaw.match(/^(\d+)$/);
    if (pct) spec.width = Math.round(CONTENT_WIDTH_PX * Number(pct[1]) / 100);
    else if (pair) { spec.width = Number(pair[1]); spec.height = Number(pair[2]); }
    else if (single) spec.width = Number(single[1]);
  }
  return { alt, src, spec };
}
