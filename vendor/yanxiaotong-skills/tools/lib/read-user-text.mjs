/**
 * Windows 用户原文读取（P-391 补充）
 * 含中文时禁止把全文放进 PowerShell `--text "…"`（系统代码页非 UTF-8 会乱码）。
 * 须 Cursor Write / Node 将 UTF-8 无 BOM 落到系统 temp，再 `--text-file`。
 */
import fs from 'node:fs';

/**
 * @param {string} text
 * @returns {string}
 */
export function stripBomText(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

/**
 * @param {Record<string, unknown>} args parseCli 结果
 * @param {{ positional?: boolean }} [opts] positional=true 时允许 args._[0] 作为 --text 回退（入口 CLI）
 * @returns {string}
 */
export function readUserTextFromArgs(args, opts = {}) {
  const file = args?.['text-file'] || args?.textFile;
  if (file && file !== true) {
    return stripBomText(fs.readFileSync(String(file), 'utf8'));
  }
  if (args?.text != null && args.text !== true) {
    return String(args.text);
  }
  if (opts.positional) {
    return String(args?._?.[0] || '');
  }
  return '';
}
