'use strict';

/**
 * P-241：需求描述入库前转 HTML（详情页富文本）
 * P-240：中和裸 XSS 风险字面量，避免服务端清洗截断后续正文
 *
 * 策略：
 * - 已含块级 HTML → 中和危险字面量后原样
 * - Markdown / 纯文本 → 转 HTML（正文 escape，避免 `<script>` 等被当标签）
 */

const EVENT_ATTR =
  /\bon(?:error|click|load|mouseover|focus|blur|submit|change|input)\s*=/gi;

function looksLikeHtml(text) {
  return /<(p|ul|ol|li|br|div|h[1-6]|strong|em|table|thead|tbody|tr|td|th|pre|code|blockquote)\b/i.test(
    String(text || ''),
  );
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} text
 * @returns {{ text: string, changed: boolean, hits: string[] }}
 */
function neutralizeHtmlRiskLiterals(text) {
  const raw = String(text ?? '');
  if (!raw) return { text: '', changed: false, hits: [] };

  const hits = [];
  let s = raw;

  if (/<\/?script\b/i.test(s)) hits.push('script');
  s = s.replace(/<\/?script\b[^>]*>/gi, (m) => m.replace(/</g, '＜').replace(/>/g, '＞'));
  s = s.replace(/<(?=\/?script\b)/gi, '＜');

  if (/<\s*iframe\b/i.test(s)) hits.push('iframe');
  s = s.replace(/<\/?iframe\b[^>]*>/gi, (m) => m.replace(/</g, '＜').replace(/>/g, '＞'));
  s = s.replace(/<(?=\/?iframe\b)/gi, '＜');

  if (EVENT_ATTR.test(s)) hits.push('event-handler');
  EVENT_ATTR.lastIndex = 0;
  s = s.replace(EVENT_ATTR, (m) => m.replace(/=/, '＝'));

  if (/javascript\s*:/i.test(s)) hits.push('javascript-url');
  s = s.replace(/javascript\s*:/gi, 'javascript：');

  const changed = s !== raw;
  return { text: s, changed, hits: changed ? [...new Set(hits)] : [] };
}

function inlineFormat(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
}

function parseTableRow(line) {
  const raw = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return raw.split('|').map((c) => c.trim());
}

/**
 * Markdown / 纯文本 → HTML
 */
function markdownOrPlainToHtml(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!raw) return '';

  const lines = raw.split('\n');
  const out = [];
  let i = 0;
  let listBuf = [];
  let listOrdered = false;

  const flushList = () => {
    if (!listBuf.length) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag}>${listBuf.map((li) => `<li>${inlineFormat(li)}</li>`).join('')}</${tag}>`);
    listBuf = [];
    listOrdered = false;
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // fenced code
    if (/^```/.test(t)) {
      flushList();
      i += 1;
      const codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (!t) {
      flushList();
      i += 1;
      continue;
    }

    // GFM table: header + separator
    if (
      t.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1].trim())
    ) {
      flushList();
      const header = parseTableRow(t);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes('|') && !isTableSeparator(lines[i].trim())) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${header.map((c) => `<th>${inlineFormat(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    const heading = t.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(t)) {
      flushList();
      out.push(`<blockquote><p>${inlineFormat(t.replace(/^>\s?/, ''))}</p></blockquote>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushList();
      out.push('<hr/>');
      i += 1;
      continue;
    }

    const ul = t.match(/^[-*·•]\s+(.+)$/);
    const ol = t.match(/^\d+[.)、．]\s*(.+)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (listBuf.length && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listBuf.push((ul || ol)[1]);
      i += 1;
      continue;
    }

    flushList();
    // markdown-ish section titles without #
    if (
      /^(切片声明|切片自检|用户故事|验收标准|背景|问题描述|本卡闭环|验收四块|UI 操作路径|交互逻辑|详细字段)/.test(
        t,
      ) &&
      t.length <= 40
    ) {
      out.push(`<p><strong>${inlineFormat(t)}</strong></p>`);
    } else {
      out.push(`<p>${inlineFormat(t)}</p>`);
    }
    i += 1;
  }

  flushList();
  return out.join('') || `<p>${escapeHtml(raw)}</p>`;
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeDescriptionHtml(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) {
    return neutralizeHtmlRiskLiterals(raw).text;
  }
  // 转 HTML 时 escape 已覆盖裸标签；再跑中和兜底（例如未闭合片段）
  return neutralizeHtmlRiskLiterals(markdownOrPlainToHtml(raw)).text;
}

/**
 * R01/R04 body.description 统一规范化
 * @param {object} body
 * @returns {object}
 */
function applyDescriptionHtml(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.description == null || body.description === '') return body;
  return { ...body, description: normalizeDescriptionHtml(body.description) };
}

module.exports = {
  looksLikeHtml,
  escapeHtml,
  neutralizeHtmlRiskLiterals,
  markdownOrPlainToHtml,
  normalizeDescriptionHtml,
  applyDescriptionHtml,
  /** @deprecated alias · P-240 兼容名 */
  descriptionForPlatformStorage: normalizeDescriptionHtml,
};
