/**
 * Demo 上传参数预览表（用户可见 · 对应用户确认模板 T-DEMO-PREVIEW）
 */

/**
 * @param {{
 *   zipPath?: string,
 *   environment: string,
 *   name: string,
 *   nameNote?: string,
 *   domainDisplay: string,
 *   domainNote?: string,
 *   serviceDisplay: string,
 *   serviceNote?: string,
 *   readyForD03: boolean,
 * }} p
 */
export function formatDemoUploadPreview(p) {
  const zip = p.zipPath ? String(p.zipPath) : '（本次出包完成后填入）';
  const lines = [
    'zip 已生成：' + zip,
    '',
    '已在后台整理 Demo 信息预览（领域/所属组已尝试模糊匹配）：',
    '',
    '| 项目 | 内容 |',
    '|------|------|',
    `| 上传环境 | ${p.environment || '—'} |`,
    `| Demo 名称 | ${cell(p.name, p.nameNote)} |`,
    `| 业务领域 | ${cell(p.domainDisplay, p.domainNote)} |`,
    `| 所属服务/组 | ${cell(p.serviceDisplay, p.serviceNote)} |`,
    `| 压缩包 | \`${zip}\` |`,
    '',
  ];
  if (!p.readyForD03) {
    lines.push(
      '说明：业务领域或所属服务尚未齐全时，请先「修改」补齐后再确认上传。',
      '',
    );
  }
  lines.push(
    '**请确认以上 Demo 信息**',
    '',
    '1. 确认，继续上传',
    '2. 修改某项信息',
    '',
    '请回复序号（如 `1`）。',
  );
  return lines.join('\n');
}

/**
 * @param {string} value
 * @param {string} [note]
 */
function cell(value, note) {
  const v = String(value || '').trim() || '（待填写）';
  const n = String(note || '').trim();
  return n ? `${v}（${n}）` : v;
}

/**
 * @param {{ kind: 'domain' | 'service', keyword: string, matches: Array<{ id: string, name: string, score: number }> }} p
 */
export function summarizeMatchField(p) {
  const kw = String(p.keyword || '').trim();
  const hits = Array.isArray(p.matches) ? p.matches : [];
  if (!kw && hits.length === 0) {
    return {
      display: '（待填写）',
      note: '',
      id: '',
      name: '',
      status: 'missing',
    };
  }
  if (hits.length === 0) {
    return {
      display: '未匹配',
      note: kw ? `口语「${kw}」无相近项，请修改点选` : '请修改点选',
      id: '',
      name: '',
      status: 'unmatched',
    };
  }
  const best = hits[0];
  const noteParts = [];
  if (kw) noteParts.push(`匹配「${kw}」`);
  if (hits.length > 1) noteParts.push(`另有 ${hits.length - 1} 个候选，可修改`);
  return {
    display: best.name,
    note: noteParts.join('；'),
    id: best.id,
    name: best.name,
    status: hits.length > 1 ? 'ambiguous' : 'matched',
    matches: hits,
  };
}
