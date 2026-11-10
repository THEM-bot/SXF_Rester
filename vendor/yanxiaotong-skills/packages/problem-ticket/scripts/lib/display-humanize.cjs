'use strict';

const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

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

function formatCreateText(data) {
  const problemNo = data.problemNo || data.id || '';
  const shareUrl =
    data.shareUrl ||
    buildWebDetailUrl({ kind: 'problem-ticket', id: problemNo || data.id }) ||
    '—';
  return [
    '问题单已创建。',
    '',
    kvTable([
      ['问题单号', problemNo],
      ['工单号', data.woNo || '—'],
      ['详情链接', shareUrl],
    ]),
  ].join('\n');
}

function formatMetadataText(data) {
  const defaults = data.defaults || {};
  const tu = data.tokenUser || {};
  const tokenLabel = tu.name || tu.employeeId
    ? `${tu.name || ''}${tu.employeeId || ''}`
    : '—';
  const types = (data.problemTypes || [])
    .filter((t) => t.enabled !== false)
    .map((t) => t.name)
    .join('、');
  const teams = (data.featureTeams || [])
    .filter((t) => t.enabled !== false)
    .map((t) => t.name)
    .slice(0, 8)
    .join('、');
  return [
    '已拉取问题单元数据。',
    '',
    kvTable([
      ['version', data.version || '—'],
      ['令牌用户', tokenLabel],
      ['问题类型', types || '—'],
      ['可用特性组（节选）', teams || '—'],
      ['默认问题类型 ID', defaults.problemTypeId || '—'],
      ['默认特性组 ID', defaults.featureTeamId || '—'],
      ['默认应用服务 ID', defaults.appServiceId || '—'],
      ['默认二线工号', defaults.secondLineFollowerEmployeeId || '—'],
    ]),
  ].join('\n');
}

function formatPrepareConfirmText(body, envLabel) {
  const desc = body.description || body.businessImpact || '';
  const preview = String(desc)
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // 概况应完整展示；禁止用「...」截断糊弄（超长才截前缀并标明）
  let descCell = preview || '—';
  if (preview.length > 600) {
    descCell = `${preview.slice(0, 600)}（后续略，完整内容以 prepared.description 为准）`;
  }
  return [
    `即将创建问题单（当前环境：${envLabel || '—'}）。`,
    '',
    kvTable([
      ['标题', body.title],
      ['描述', descCell],
      ['提单人', body.submitterName || body.submitterEmployeeId],
      ['问题类型', body.problemType || body.problemTypeId],
      ['二线跟进人', body.secondLineFollower || body.caretaker || body.secondLineFollowerId],
      ['处理人', body.handler || body.handlerId],
      ['特性小组', body.featureTeam || body.featureTeamId],
      ['业务领域', body.businessDomain || body.businessDomainId],
      ['应用服务', body.appOrService || body.appServiceName || body.appServiceId],
    ]),
    '',
    '1. 确认创建',
    '2. 返回修改',
    '',
    '请回复序号。',
    '',
    '【prepare 确认表】描述=完整业务概况；二线=令牌用户；须原样粘贴本段，禁止手搓或「全文约N行…」',
  ].join('\n');
}

module.exports = {
  formatCreateText,
  formatMetadataText,
  formatPrepareConfirmText,
};
