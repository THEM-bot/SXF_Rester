/**
 * 意图前缀：隔离命令词与粘贴正文（标题/内容/Markdown 标题之后不参与 env / 弱路由匹配）
 *
 * 先展平平台「标题+链接」复制块，避免把 Web 详情卡的「标题：」误当正文截断点。
 */

import { normalizePlatformTitledLinks } from './platform-titled-link.mjs';

const BODY_MARKERS = [
  /\n?\s*标题\s*[:：]/,
  /\n?\s*内容\s*[:：]/,
  /\n#{1,6}\s/,
];

const MAX_PREFIX_LEN = 400;

/**
 * @param {string} userText
 * @returns {string}
 */
export function extractIntentPrefix(userText) {
  const t = normalizePlatformTitledLinks(String(userText || ''));
  if (!t) return '';

  let cut = t.length;
  for (const re of BODY_MARKERS) {
    const m = re.exec(t);
    if (m && m.index > 0 && m.index < cut) {
      cut = m.index;
    }
  }

  if (cut === t.length) {
    const firstNl = t.indexOf('\n');
    if (firstNl > 0) {
      cut = Math.min(firstNl, MAX_PREFIX_LEN);
    } else {
      cut = Math.min(t.length, MAX_PREFIX_LEN);
    }
  }

  return t.slice(0, cut).trim();
}
