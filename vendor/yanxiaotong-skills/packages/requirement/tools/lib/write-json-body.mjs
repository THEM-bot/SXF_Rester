/**
 * P-239：无 BOM UTF-8 JSON 落盘（Windows 创建 body 唯一推荐 CLI 路径）
 * 禁止依赖 PowerShell / node -e 内联中文拼 JSON。
 * P-241：合并 description-file 时同步转 HTML。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeDescriptionHtml, applyDescriptionHtml } = require('../../scripts/lib/description-to-html.cjs');

/**
 * @param {string} text
 * @returns {string}
 */
export function stripBomText(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTempPath(value) {
  const p = path.resolve(String(value || ''));
  const tempRoot = path.resolve(os.tmpdir());
  const norm = (s) => s.replace(/\\/g, '/').toLowerCase();
  return norm(p).startsWith(`${norm(tempRoot)}/`) || norm(p) === norm(tempRoot);
}

/**
 * 写入无 BOM JSON（Node fs 默认 utf8 无 BOM）
 * @param {string} outPath
 * @param {object} body
 * @param {{ requireTemp?: boolean }} [opts]
 * @returns {{ path: string, bytes: number }}
 */
export function writeJsonBodyFile(outPath, body, opts = {}) {
  const target = path.resolve(String(outPath || ''));
  if (!target || target === '.') {
    throw new Error('write-json-body 须提供 --out <绝对或相对路径>');
  }
  if (opts.requireTemp && !isTempPath(target)) {
    throw new Error(
      `write-json-body：R01/R04 body 须落系统临时目录（当前：${target}；tmpdir=${os.tmpdir()}）`,
    );
  }
  const text = `${JSON.stringify(body)}\n`;
  fs.writeFileSync(target, text, 'utf8');
  const head = fs.readFileSync(target);
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    throw new Error('write-json-body 写出了 BOM，禁止提交');
  }
  return { path: target, bytes: Buffer.byteLength(text, 'utf8') };
}

/**
 * @param {object} body
 * @param {string|null|undefined} descriptionFile
 * @returns {object}
 */
export function mergeDescriptionFile(body, descriptionFile) {
  if (!descriptionFile || descriptionFile === true) return body;
  const raw = fs.readFileSync(String(descriptionFile), 'utf8');
  // P-241：description-file 合并时即转 HTML，避免绕过 normalizeCreateBody 的手写 body
  return { ...body, description: normalizeDescriptionHtml(stripBomText(raw)) };
}

export { applyDescriptionHtml, normalizeDescriptionHtml };
