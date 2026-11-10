/**
 * D03 M01/M03 名称模糊匹配（用户口语 → 列表候选）
 * SSOT：upload-phase.md §8.3.3.1 / §8.3.3.2
 */

/**
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeMetaName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-·/\\（）()【】\[\]]+/g, '');
}

/**
 * @param {string} query
 * @param {string} name
 * @returns {number} 0～100；0 表示不命中
 */
export function scoreMetaName(query, name) {
  const q = normalizeMetaName(query);
  const n = normalizeMetaName(name);
  if (!q || !n) return 0;
  if (q === n) return 100;

  const rawTokens = String(name ?? '')
    .split(/[-_/·\s（）()【】\[\]]+/)
    .map((t) => normalizeMetaName(t))
    .filter(Boolean);
  if (rawTokens.some((t) => t === q)) return 92;

  if (n.includes(q)) return Math.min(89, 72 + Math.min(17, q.length));
  if (q.includes(n) && n.length >= 2) return 70;

  if (rawTokens.some((t) => t.includes(q) || (q.length >= 2 && q.includes(t)))) return 68;

  return 0;
}

/**
 * @param {Array<{ id?: string, name?: string, label?: string }>} records
 * @param {string} keyword
 * @param {{ minScore?: number, maxResults?: number }} [opts]
 * @returns {Array<{ id: string, name: string, score: number }>}
 */
export function fuzzyMatchMetadata(records, keyword, opts = {}) {
  const minScore = opts.minScore ?? 68;
  const maxResults = opts.maxResults ?? 5;
  const list = Array.isArray(records) ? records : [];
  const ranked = list
    .map((r) => {
      const name = String(r?.name || r?.label || '').trim();
      const id = String(r?.id ?? '');
      return { id, name, score: scoreMetaName(keyword, name) };
    })
    .filter((x) => x.name && x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'));
  return ranked.slice(0, maxResults);
}

/**
 * @param {{ kindLabel: string, userKeyword: string, matches: Array<{ name: string }> }} p
 * @returns {string}
 */
export function formatMetaMatchConfirm({ kindLabel, userKeyword, matches }) {
  const kw = String(userKeyword || '').trim() || '（未填写）';
  const hits = Array.isArray(matches) ? matches : [];
  if (hits.length === 0) {
    throw new Error('formatMetaMatchConfirm requires at least one match');
  }

  if (hits.length === 1) {
    const name = hits[0].name;
    return [
      `您指定${kindLabel}：${kw}`,
      `已匹配到：${name}`,
      '',
      `**请确认${kindLabel}**`,
      '',
      `1. 确认使用「${name}」`,
      '2. 不对，从完整列表重新选择',
      '',
      '请回复序号（如 `1`）。',
    ].join('\n');
  }

  const lines = [
    `您指定${kindLabel}：${kw}`,
    '已模糊匹配到以下候选：',
    '',
  ];
  hits.forEach((m, i) => {
    const tag = i === 0 ? '（最相近）' : '';
    lines.push(`${i + 1}. ${m.name}${tag}`);
  });
  lines.push('');
  lines.push(`**请确认${kindLabel}**`);
  lines.push('');
  hits.forEach((m, i) => {
    lines.push(`${i + 1}. 使用「${m.name}」`);
  });
  lines.push(`${hits.length + 1}. 都不对，从完整列表重新选择`);
  lines.push('');
  lines.push('请回复序号（如 `1`）。');
  return lines.join('\n');
}

/**
 * @param {{ kindLabel: string, userKeyword: string, pickListText: string }} p
 * @returns {string}
 */
export function formatMetaMatchMiss({ kindLabel, userKeyword, pickListText }) {
  const kw = String(userKeyword || '').trim() || '（未填写）';
  const body = String(pickListText || '').trim();
  return [
    `未在${kindLabel}列表中匹配到与「${kw}」相近的项，请从完整列表点选：`,
    '',
    body,
    '',
    '请回复序号。',
  ].join('\n');
}
