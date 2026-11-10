/**
 * 需求池创建 · 标题/描述提炼（基于用户输入或原始需求正文）
 * SSOT：reference/create-defaults.md §3
 */

const TITLE_MAX = 40;
const TITLE_HARD_MAX = 200;

/**
 * 去掉 HTML/实体，压成可读纯文本
 */
export function stripToPlainText(htmlOrText) {
  let t = String(htmlOrText || '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/p>/gi, '\n');
  t = t.replace(/<\/div>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return t.trim();
}

/**
 * 是否仅为创建路由壳（与 parse-create-intent.isCreateRoutingShellOnly 对齐）
 */
function isCreateRoutingShellOnlyPlain(text) {
  const t = String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，,、；;：:.\-_/\\|]+/g, '');
  if (!t) return true;
  return /^(?:@?\/?yanxiaotong-skills|原始需求(?:编号)?(?:为|是)?)+$/i.test(t);
}

/**
 * 是否有可提炼的实质正文（非仅路由短句）
 */
export function isSubstantialText(text) {
  const t = stripToPlainText(text);
  if (!t) return false;
  if (t.length < 4) return false;
  // 纯标点/序号不算
  if (/^[\d\s\-_/\\|:：,，.。;；]+$/.test(t)) return false;
  // 「原始需求为」「@yanxiaotong-skills」等不得当实质正文
  if (isCreateRoutingShellOnlyPlain(t)) return false;
  return true;
}

/**
 * 从纯文本提炼标题（默认 ≤40，硬上限 200）
 */
export function refineTitleFromText(text, { maxLen = TITLE_MAX } = {}) {
  const plain = stripToPlainText(text);
  if (!plain) return null;
  const firstLine = plain.split('\n')[0].trim();
  const firstSentence = firstLine.split(/[。！？!?;；，,]/)[0].trim() || firstLine;
  let title = firstSentence.replace(/^[#*\-\s]+/, '').trim();
  const limit = Math.min(Math.max(Number(maxLen) || TITLE_MAX, 1), TITLE_HARD_MAX);
  if (title.length > limit) {
    title = `${title.slice(0, limit - 1)}…`;
  }
  return title || null;
}

/**
 * 从用户输入提炼标题 + 描述
 * - 标题：首句/首行摘要 ≤40
 * - 描述：整理后的全文（必填，不得为空）
 */
export function refineFromUserInput(userText) {
  const plain = stripToPlainText(userText);
  if (!isSubstantialText(plain)) {
    return { title: null, description: null, refine_source: null };
  }
  const title = refineTitleFromText(plain);
  // 多段时：首段作标题，全文作描述；单段时标题=摘要、描述=全文（描述必填）
  const segments = plain
    .split(/[，,。；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let description = plain;
  if (segments.length > 1) {
    const rest = segments.slice(1).join('，');
    description = rest || plain;
  }
  if (!description) {
    return { title, description: null, refine_source: 'user' };
  }
  return { title, description, refine_source: 'user' };
}

/**
 * 从原始需求详情提炼标题 + 描述
 * 优先字段：title / userNeedDesc / businessPain / valueDescription
 */
export function refineFromOriginalRequirement(orDetail) {
  const d = orDetail && typeof orDetail === 'object' ? orDetail : {};
  const orTitle = stripToPlainText(d.title || d.originalTitle || '');
  const need = stripToPlainText(d.userNeedDesc || '');
  const pain = stripToPlainText(d.businessPain || '');
  const value = stripToPlainText(d.valueDescription || '');

  const parts = [];
  if (pain) parts.push(`【业务背景/痛点】\n${pain}`);
  if (need) parts.push(`【原始需求描述】\n${need}`);
  if (value) parts.push(`【价值】\n${value}`);
  if (!parts.length && orTitle) parts.push(orTitle);

  const description = parts.join('\n\n').trim() || null;
  const titleSource = orTitle || need || pain || value;
  const title = titleSource ? refineTitleFromText(titleSource) : null;

  if (!title && !description) {
    return { title: null, description: null, refine_source: null };
  }
  return {
    title,
    description,
    refine_source: 'original',
    original_title: orTitle || null,
    original_no: d.originalNo || d.original_no || null,
    original_id: d.id != null ? String(d.id) : d.originalRequirementId != null ? String(d.originalRequirementId) : null,
  };
}

/**
 * 基于原始需求创建：有用户实质输入则用用户；否则用 OR 正文
 */
export function resolveCreateTitleDescription({ userText, orDetail } = {}) {
  const fromUser = refineFromUserInput(userText);
  if (fromUser.refine_source === 'user' && fromUser.description) {
    return fromUser;
  }
  if (orDetail) {
    const fromOr = refineFromOriginalRequirement(orDetail);
    if (fromOr.description || fromOr.title) return fromOr;
  }
  // 用户有标题级短句但无描述时：保留标题，描述仍缺
  if (fromUser.title) {
    return { title: fromUser.title, description: null, refine_source: 'user_partial' };
  }
  return { title: null, description: null, refine_source: null };
}

export default {
  stripToPlainText,
  isSubstantialText,
  refineTitleFromText,
  refineFromUserInput,
  refineFromOriginalRequirement,
  resolveCreateTitleDescription,
};
