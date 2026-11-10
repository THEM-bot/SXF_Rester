/**
 * P-239：无 BOM UTF-8 JSON 落盘（Windows 创建 body 推荐路径）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { plainTextToDescriptionHtml, stripBomText } from './org-todo-tools.mjs';

export { stripBomText };

export function isTempPath(value) {
  const p = path.resolve(String(value || ''));
  const tempRoot = path.resolve(os.tmpdir());
  const norm = (s) => s.replace(/\\/g, '/').toLowerCase();
  return norm(p).startsWith(`${norm(tempRoot)}/`) || norm(p) === norm(tempRoot);
}

export function writeJsonBodyFile(outPath, body, opts = {}) {
  const target = path.resolve(String(outPath || ''));
  if (!target || target === '.') {
    throw new Error('write-json-body 须提供 --out <绝对或相对路径>');
  }
  if (opts.requireTemp && !isTempPath(target)) {
    throw new Error(
      `write-json-body：body 须落系统临时目录（当前：${target}；tmpdir=${os.tmpdir()}）`,
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

function readTextFile(file) {
  if (!file || file === true) return '';
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/**
 * 合并描述文件到 descriptionHtml（对齐 Web：仅待办描述，无标题字段）
 * `--title-file` 仍可解析但**创建轨禁止使用**（见 create-defaults）；若误传且无 description-file，会写入 HTML（兼容旧调用）。
 */
export function mergeDescriptionFile(body, descriptionFile, titleFile) {
  const out = { ...(body || {}) };
  if (out.descriptionHtml) return out;

  const title = readTextFile(titleFile)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const desc = readTextFile(descriptionFile)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();

  // 创建对齐 Web：有描述时只用描述；无描述仅有 title 时兼容旧调用
  if (desc) {
    out.descriptionHtml = plainTextToDescriptionHtml(desc);
  } else if (title) {
    out.descriptionHtml = plainTextToDescriptionHtml(title);
  }
  return out;
}
