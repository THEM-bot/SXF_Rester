/**
 * 平台 Web 复制块：标题 + 链接 → 展平为裸 URL（保留前后文）
 *
 * 平台形态：
 *   标题：鸟之诗
 *   链接：http://localhost:5173/app/requirements/pool/requirement/4314
 *
 * 旧形态（仍兼容）：直接粘贴裸 URL。
 *
 * 不得误伤故事卡正文「标题: …\n内容: …」（其后无「链接:」行）。
 */

/** URL 捕获：允许紧跟「下/喜爱」等中文连接词，不含空白与常见中文标点 */
const URL_CAPTURE = '(https?:\\/\\/[^\\s，,；;）\\]\\u3000]+)';

/** 多行：标题行 + 链接行 */
const TITLED_LINK_BLOCK = new RegExp(
  String.raw`标题\s*[:：]\s*[^\n\r]+[\n\r]+\s*链接\s*[:：]\s*${URL_CAPTURE}`,
  'gi',
);

/** 同行：标题：x 链接：url */
const TITLED_LINK_INLINE = new RegExp(
  String.raw`标题\s*[:：]\s*[^\n\r]+?\s+链接\s*[:：]\s*${URL_CAPTURE}`,
  'gi',
);

/** 仅「链接：url」（无标题行）；保留前导空白/在/于 */
const LINK_LABEL_ONLY = new RegExp(
  String.raw`(^|[\s，,；;在于])链接\s*[:：]\s*${URL_CAPTURE}`,
  'gi',
);

/**
 * @param {string} userText
 * @returns {string}
 */
export function normalizePlatformTitledLinks(userText) {
  let t = String(userText || '');
  if (!t) return '';

  t = t.replace(TITLED_LINK_BLOCK, '$1');
  t = t.replace(TITLED_LINK_INLINE, '$1');
  t = t.replace(LINK_LABEL_ONLY, '$1$2');

  return t;
}
