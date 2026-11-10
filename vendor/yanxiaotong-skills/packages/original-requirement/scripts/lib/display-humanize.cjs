'use strict';

const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

const FIELD_LABELS = Object.freeze({
  originalNo: '原始需求编号',
  id: '原始需求 ID',
  title: '标题',
  businessPain: '业务背景/痛点',
  userNeedDesc: '原始需求描述',
  valueDescription: '价值描述',
  intakeStatus: '受理状态',
  priority: '优先级',
  absolutePriority: '绝对优先级',
  proposer: '提出人',
  requirementAcceptancePerson: '验收人',
  businessDomainName: '业务领域',
  businessDomainId: '业务领域 ID',
  submitChannel: '提出渠道',
  expectedDeliveryDate: '计划交付',
  proposedAt: '提出时间',
  businessContactPerson: '业务接口人',
  itProductPlanner: 'IT 产品规划',
  updatedAt: '更新时间',
});

const UPDATE_FIELD_LABELS = Object.freeze({
  title: '标题',
  businessPain: '业务背景/痛点',
  userNeedDesc: '原始需求描述',
  valueDescription: '价值描述',
  expectedDeliveryDate: '计划交付',
  businessDomainId: '业务领域',
  proposer: '提出人',
  requirementAcceptancePerson: '验收人',
});

function labelOf(key) {
  return FIELD_LABELS[key] || key;
}

function formatDetailText(data) {
  const d = data || {};
  const rows = [
    ['原始需求编号', d.originalNo],
    ['标题', d.title],
    ['受理状态', d.intakeStatus],
    ['优先级', d.priority],
    ['业务领域', d.businessDomainName],
    ['提出人', d.proposer],
    ['验收人', d.requirementAcceptancePerson],
    ['计划交付', d.expectedDeliveryDate],
    ['提出渠道', d.submitChannel],
  ];
  return rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');
}

function formatCreateText(data, extra = {}) {
  const d = data || {};
  const detailUrl =
    extra.detailUrl ||
    buildWebDetailUrl({ kind: 'original-requirement', id: d.id, env: extra.env });
  const linkLine = detailUrl || '（响应未返回 ID，无法生成链接）';
  const rows = [
    ['标题', extra.title || d.title || ''],
    ['编号', d.originalNo || ''],
    ['ID', d.id ?? ''],
    ['详情链接', linkLine],
  ];
  if (extra.env_label || extra.env) {
    rows.push(['环境', extra.env_label || extra.env]);
  }
  const table = [
    '| 字段 | 内容 |',
    '|------|------|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ];
  return ['原始需求已创建。', '', ...table].join('\n');
}

function formatListText(data) {
  const page = data || {};
  const records = page.records || [];
  const total = page.total != null ? page.total : records.length;
  const lines = [`共 ${total} 条，本页 ${records.length} 条：`];
  for (const r of records) {
    lines.push(
      `- ${r.originalNo || r.id || '?'} · ${r.title || ''} · ${r.intakeStatus || ''} · ${r.businessDomainName || ''}`,
    );
  }
  return lines.join('\n');
}

function formatUpdateFieldSummary(body) {
  const b = body || {};
  const parts = [];
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === '') continue;
    parts.push(`${UPDATE_FIELD_LABELS[k] || labelOf(k)}=${v}`);
  }
  return parts.length ? parts.join('；') : '（无）';
}

module.exports = {
  FIELD_LABELS,
  UPDATE_FIELD_LABELS,
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
};
