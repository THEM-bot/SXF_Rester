'use strict';

const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

const FIELD_LABELS = {
  defectNo: '缺陷编号',
  defectId: '缺陷 ID',
  title: '缺陷标题',
  status: '状态',
  severity: '严重性',
  discoveryPhase: '发现阶段',
  defectType: '缺陷类型',
  defectTypeLabel: '缺陷类型',
  requirementNo: '所属需求编号',
  requirementTitle: '所属需求标题',
  iterationName: '开发迭代',
  assigneeName: '修复人',
  assigneeId: '修复人',
  regressionTesterName: '回归人',
  regressionTesterId: '回归人',
  creatorName: '创建人',
  creatorNumber: '创建人工号',
  description: '描述',
  clearRegressionTester: '清空回归人',
  clearDefectType: '清空缺陷类型',
};

function label(field) {
  return FIELD_LABELS[field] || field;
}

function formatPerson(name, number) {
  const n = name || '';
  const num = number || '';
  if (!n && !num) return '—';
  return `${n}${num}` || '—';
}

function formatDetailText(data) {
  if (!data) return '无详情数据';
  const typeText = data.defectTypeLabel || data.defectType || '—';
  const lines = [
    `${label('defectNo')}：${data.defectNo || '—'}`,
    `${label('title')}：${data.title || '—'}`,
    `${label('status')}：${data.status || '—'}`,
    `${label('severity')}：${data.severity || '—'}`,
    `${label('discoveryPhase')}：${data.discoveryPhase || '—'}`,
    `${label('defectType')}：${typeText}`,
    `${label('requirementTitle')}：${data.requirementTitle || '—'}（${data.requirementNo || '—'}）`,
    `${label('iterationName')}：${data.iterationName || '—'}`,
    `${label('assigneeName')}：${data.assigneeName || '—'}`,
    `${label('regressionTesterName')}：${data.regressionTesterName || '—'}`,
    `${label('creatorName')}：${formatPerson(data.creatorName, data.creatorNumber)}`,
  ];
  return lines.join('\n');
}

function formatCreateText(data, body) {
  const d = data || {};
  const b = body || {};
  const detailUrl =
    b.detailUrl || buildWebDetailUrl({ kind: 'defect', id: d.defectId, env: b.env });
  const linkLine = detailUrl || '（响应未返回 ID，无法生成链接）';
  return [
    '缺陷已创建。',
    '',
    '| 项目 | 内容 |',
    '|------|------|',
    `| 缺陷编号 | ${d.defectNo || '—'} |`,
    `| 标题 | ${b.title || d.title || '—'} |`,
    `| 详情链接 | ${linkLine} |`,
    '',
    '可在研效通 Web 缺陷模块查看详情。',
  ].join('\n');
}

function formatListText(data) {
  const records = data?.records || [];
  const total = data?.total ?? records.length;
  if (!records.length) return `未找到匹配缺陷（共 ${total} 条）。`;
  const lines = records.map((r, i) => {
    const type = r.defectTypeLabel || r.defectType || '—';
    const fix = r.assigneeName || '—';
    const reg = r.regressionTesterName || '—';
    return `${i + 1}. ${r.defectNo || '—'} · ${r.title || '—'} · ${r.status || '—'} · ${r.severity || '—'} · 类型 ${type} · 修复人 ${fix} · 回归人 ${reg}`;
  });
  return [`共 ${total} 条，本页 ${records.length} 条：`, ...lines].join('\n');
}

function formatUpdateFieldSummary(body) {
  if (!body) return '—';
  const parts = [];
  if (body.title != null) parts.push(`${label('title')}：${body.title}`);
  if (body.description != null) parts.push(`${label('description')}：已更新`);
  if (body.severity != null) parts.push(`${label('severity')}：${body.severity}`);
  if (body.assigneeId != null || body.assigneeName != null) {
    parts.push(`${label('assigneeName')}：${body.assigneeName || body.assigneeId || '—'}`);
  }
  if (Boolean(body.clearDefectType) || body.defectType === '') {
    parts.push(`${label('defectType')}：已清空`);
  } else if (body.defectType != null) {
    parts.push(`${label('defectType')}：${body.defectType}`);
  }
  if (Boolean(body.clearRegressionTester)) {
    parts.push(`${label('regressionTesterName')}：已清空`);
  } else if (body.regressionTesterId != null || body.regressionTesterName != null) {
    parts.push(
      `${label('regressionTesterName')}：${body.regressionTesterName || body.regressionTesterId || '—'}`,
    );
  }
  return parts.join('；') || '—';
}

function formatStatusText(idOrNo, body) {
  return `缺陷 ${idOrNo || '—'} 状态已更新为「${body?.status || '—'}」。`;
}

function formatCloseText(idOrNo, body) {
  const labelMap = {
    resolved: '解决关闭',
    not_issue: '非问题关闭',
    duplicate: '重复问题关闭',
  };
  const t = labelMap[body?.closeType] || body?.closeType || '—';
  return `缺陷 ${idOrNo || '—'} 已${t}。`;
}

module.exports = {
  FIELD_LABELS,
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
  formatStatusText,
  formatCloseText,
};
