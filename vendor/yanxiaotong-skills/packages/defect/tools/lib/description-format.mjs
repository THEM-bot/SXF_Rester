/**
 * 缺陷描述换行规范化（Web 详情为 v-html，纯文本 \\n 会被折叠）
 * - 仅对结构化段落标题（现象/期望/环境等）另起一行；字段名如【实际工时】不拆行
 * - 入库前将纯文本换行转为 <br>
 */

const HTML_HINT = /<(?:p|div|br|ul|ol|li|h[1-6]|span|table|strong|em)[\s>/]/i;

/** 结构化段落标题（不含业务字段名【实际工时】【状态】等） */
const SECTION_HEAD =
  '【(?:现象|期望|预期(?:\\/实际)?|复现步骤?|环境|价值|业务背景(?:\\/痛点)?|原始需求(?:描述)?|关联需求|验收标准|用户故事|标题来源)】';

/** 保证结构化段落标题另起一行（段首除外） */
export function normalizeStructuredDescription(text) {
  let s = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!s) return '';
  s = s.replace(new RegExp(`([^\\n])[ \\t]*(${SECTION_HEAD})`, 'g'), '$1\n$2');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function escapeHtmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open API / Web 存储：纯文本换行 → <br>；已是 HTML 则只做结构化换行补丁后原样倾向保留
 */
export function descriptionForApiStorage(text) {
  const normalized = normalizeStructuredDescription(text);
  if (!normalized) return '';
  if (HTML_HINT.test(normalized)) {
    // 已有 HTML：仍把裸换行补成 <br>，避免混排纯换行失效
    return normalized.replace(/\n/g, '<br>\n');
  }
  return normalized
    .split('\n')
    .map((line) => escapeHtmlText(line))
    .join('<br>\n');
}

/**
 * 对话确认表「缺陷描述」单元格：用 <br> 保留换行（Markdown 表内）
 */
export function descriptionForConfirmCell(text) {
  const normalized = normalizeStructuredDescription(text);
  if (!normalized) return '（无）';
  // 若已是 API HTML，先把 <br> 统一再输出
  const plain = normalized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain.split('\n').join('<br>');
}
