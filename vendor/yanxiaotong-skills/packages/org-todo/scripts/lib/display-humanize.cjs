'use strict';

const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

const STATUS_LABELS = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  CLOSED: '已闭环',
  SUSPENDED: '挂起',
  CANCELLED: '作废',
};

const FIELD_LABELS = {
  orgTodoNo: '组织待办编号',
  orgTodoId: '组织待办 ID',
  title: '待办简称',
  status: '状态',
  statusLabel: '状态',
  proposedBy: '提出人',
  businessDomainName: '业务领域',
  plannedCloseAt: '计划闭环',
  actualCloseAt: '实际闭环',
  proposedAt: '提出时间',
  updatedAt: '最近更新',
  descriptionHtml: '描述',
  progressHtml: '进展',
  owners: '负责人',
};

function label(field) {
  return FIELD_LABELS[field] || field;
}

function cell(value) {
  const s = value == null || value === '' ? '—' : String(value);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
}

function kvTable(rows) {
  return [
    '| 项目 | 内容 |',
    '|------|------|',
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
  ].join('\n');
}

function htmlToPlain(html) {
  if (html == null || html === '') return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatStatus(data) {
  return data?.statusLabel || STATUS_LABELS[data?.status] || data?.status || '—';
}

function formatOwners(owners) {
  if (!Array.isArray(owners) || !owners.length) return '—';
  return owners
    .map((o) => {
      if (typeof o === 'string') return unwrapEmployeeIdParens(o);
      const name = o.name || o.employeeName || o.ownerName || '';
      const id = o.employeeId || o.ownerId || o.id || '';
      if (name && id) {
        const nameClean = unwrapEmployeeIdParens(String(name)).replace(/\s+/g, '');
        if (nameClean.includes(String(id))) return nameClean;
        return `${nameClean}${id}`;
      }
      return unwrapEmployeeIdParens(name || id || '—');
    })
    .join('、');
}

function unwrapEmployeeIdParens(text) {
  return String(text || '')
    .replace(/（\s*([A-Za-z0-9]+)\s*）/g, '$1')
    .replace(/\(\s*([A-Za-z0-9]+)\s*\)/g, '$1')
    .trim();
}

function formatProjects(data) {
  if (Array.isArray(data?.projectNames) && data.projectNames.length) {
    const names = data.projectNames.map((x) => String(x || '').trim()).filter(Boolean);
    if (names.length) return names.join('、');
  }
  return '—';
}

function formatLatestProgress(data) {
  const plain = htmlToPlain(data?.latestProgressHtml || data?.progressHtml);
  return plain || '—';
}

/**
 * @param {object} data
 * @param {{ env?: string }} [meta]
 */
function formatDetailText(data, meta = {}) {
  if (!data) return '无详情数据';
  const detailUrl = buildWebDetailUrl({
    kind: 'org-todo',
    id: data.orgTodoNo || data.orgTodoId,
    env: meta.env,
  });
  return kvTable([
    ['组织待办编号', data.orgTodoNo || '—'],
    ['待办简称', data.title || '—'],
    ['状态', formatStatus(data)],
    ['提出人', unwrapEmployeeIdParens(data.proposedBy) || '—'],
    ['业务领域', data.businessDomainName || '—'],
    ['关联项目', formatProjects(data)],
    ['负责人', formatOwners(data.owners)],
    ['计划闭环', data.plannedCloseAt || '—'],
    ['实际闭环', data.actualCloseAt || '—'],
    ['提出时间', data.proposedAt || '—'],
    ['最近更新', data.updatedAt || '—'],
    ['最新进展', formatLatestProgress(data)],
    ['详情链接', detailUrl || '（响应未返回编号，无法生成链接）'],
  ]);
}

function formatCreateText(data, body) {
  const d = data || {};
  const detailUrl = buildWebDetailUrl({
    kind: 'org-todo',
    id: d.orgTodoNo || d.orgTodoId,
    env: body?.env,
  });
  const linkLine = detailUrl || '（响应未返回编号，无法生成链接）';
  const firstProgress =
    d.firstProgressWritten || body?.firstProgressPlain
      ? String(body?.firstProgressPlain || '已写入').slice(0, 80)
      : '（未写入）';
  return [
    '组织待办创建成功。',
    '',
    kvTable([
      ['待办简称', d.title || '—'],
      ['组织待办编号', d.orgTodoNo || '—'],
      ['组织待办 ID', d.orgTodoId || '—'],
      ['状态', formatStatus(d)],
      ['首条进展', firstProgress],
      ['详情链接', linkLine],
    ]),
    '',
    '编号以 API 返回为准。',
  ].join('\n');
}

function formatListText(data) {
  const records = data?.records || [];
  const total = data?.total ?? records.length;
  if (!records.length) return `未找到匹配组织待办（共 ${total} 条）。`;
  const header = [
    '| # | 组织待办编号 | 待办简称 | 状态 | 负责人 |',
    '|---|--------------|----------|------|--------|',
  ];
  const rows = records.map(
    (r, i) =>
      `| ${i + 1} | ${cell(r.orgTodoNo)} | ${cell(r.title)} | ${cell(formatStatus(r))} | ${cell(formatOwners(r.owners))} |`,
  );
  return [`共 ${total} 条，本页 ${records.length} 条：`, '', ...header, ...rows].join('\n');
}

function formatUpdateFieldSummary(body) {
  if (!body) return '—';
  const parts = [];
  if (body.status != null) parts.push(`${label('status')}：${STATUS_LABELS[body.status] || body.status}`);
  if (body.descriptionHtml != null) parts.push(`${label('descriptionHtml')}：已更新`);
  if (body.owners != null) parts.push(`${label('owners')}：已更新`);
  if (body.plannedCloseAt != null) parts.push(`${label('plannedCloseAt')}：${body.plannedCloseAt || '已清空'}`);
  if (body.actualCloseAt != null) parts.push(`${label('actualCloseAt')}：${body.actualCloseAt || '已清空'}`);
  if (body.businessDomain != null) parts.push(`${label('businessDomainName')}：已更新`);
  if (body.projectIds != null) parts.push('关联项目：已更新');
  return parts.join('；') || '—';
}

function formatUpdateText(idOrNo, body) {
  return [
    `组织待办 ${idOrNo || '—'} 已更新。`,
    '',
    kvTable([['修改字段', formatUpdateFieldSummary(body)]]),
  ].join('\n');
}

function formatProgressText(data, idOrNo) {
  const d = data || {};
  return [
    `进展已写入组织待办 ${idOrNo || '—'}。`,
    '',
    kvTable([
      ['组织待办编号', idOrNo || '—'],
      ['操作人', d.operatorName || d.operatorId || '—'],
      ['时间', d.progressTime || '—'],
    ]),
  ].join('\n');
}

module.exports = {
  STATUS_LABELS,
  FIELD_LABELS,
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
  formatUpdateText,
  formatProgressText,
  formatStatus,
  formatOwners,
  htmlToPlain,
};
