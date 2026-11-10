'use strict';

const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

const FIELD_LABELS = {
  taskNo: '任务编号',
  taskId: '任务 ID',
  title: '任务标题',
  status: '状态',
  taskPhase: '任务阶段',
  taskCategory: '任务类别',
  requirementNo: '所属需求编号',
  requirementTitle: '所属需求标题',
  iterationName: '开发迭代',
  teamName: '特性小组',
  assigneeName: '负责人',
  plannedStartDate: '计划开始',
  plannedEndDate: '计划结束',
};

function label(field) {
  return FIELD_LABELS[field] || field;
}

function formatDetailText(data) {
  if (!data) return '无详情数据';
  const lines = [
    `${label('taskNo')}：${data.taskNo || '—'}`,
    `${label('title')}：${data.title || '—'}`,
    `${label('status')}：${data.status || '—'}`,
    `${label('taskPhase')}：${data.taskPhase || '—'}`,
    `${label('taskCategory')}：${data.taskCategory || '—'}`,
    `${label('requirementTitle')}：${data.requirementTitle || '—'}（${data.requirementNo || '—'}）`,
    `${label('iterationName')}：${data.iterationName || '—'}`,
    `${label('assigneeName')}：${data.assigneeName || '—'}`,
  ];
  return lines.join('\n');
}

function formatCreateText(data, body) {
  const d = data || {};
  const b = body || {};
  const detailUrl =
    b.detailUrl || buildWebDetailUrl({ kind: 'task', id: d.taskId, env: b.env });
  const linkLine = detailUrl || '（响应未返回 ID，无法生成链接）';
  return [
    '任务创建成功。',
    '',
    '| 项目 | 内容 |',
    '|------|------|',
    `| 任务标题 | ${b.title || d.name || '—'} |`,
    `| 任务编号 | ${d.taskNo || '—'} |`,
    `| 任务 ID | ${d.taskId || '—'} |`,
    `| 所属需求 | ${b.requirementTitle || d.requirementTitle || '—'} |`,
    `| 详情链接 | ${linkLine} |`,
    '',
    '编号以 API 返回为准。',
  ].join('\n');
}

function formatListText(data) {
  const records = data?.records || [];
  const total = data?.total ?? records.length;
  if (!records.length) return `未找到匹配任务（共 ${total} 条）。`;
  const lines = records.map(
    (r, i) =>
      `${i + 1}. ${r.taskNo || '—'} · ${r.title || '—'} · ${r.status || '—'} · ${r.taskPhase || '—'}`,
  );
  return [`共 ${total} 条，本页 ${records.length} 条：`, ...lines].join('\n');
}

function formatUpdateFieldSummary(body) {
  if (!body) return '—';
  const parts = [];
  if (body.title != null) parts.push(`${label('title')}：${body.title}`);
  if (body.description != null) parts.push(`${label('description') || '描述'}：已更新`);
  return parts.join('；') || '—';
}

module.exports = {
  FIELD_LABELS,
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
};
