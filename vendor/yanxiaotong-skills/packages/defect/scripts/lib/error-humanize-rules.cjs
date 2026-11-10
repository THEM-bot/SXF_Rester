'use strict';

const HUMANIZE = [
  { match: /所属需求|requirementId/i, text: '请先选择所属需求' },
  { match: /需求状态为已完成|不能新建缺陷|作废/, text: '该需求不能新建缺陷，请换需求' },
  { match: /严重性/, text: '严重性不在允许范围内，请重新选择' },
  { match: /状态.*非法|非法.*状态/, text: '目标状态不合法，请重新选择' },
  { match: /重开|已完成.*关闭/, text: '需求已完成，不能重开已关闭的缺陷' },
  { match: /已.*关闭|重复关闭/, text: '缺陷已处于关闭状态' },
  { match: /白名单|不允许|status/, text: '该字段不能通过 D04 修改，状态请走状态流转' },
  { match: /发现阶段|discoveryPhase/i, text: '发现阶段为只读字段，创建时自动取所属需求状态，不能通过开放 API 修改' },
  { match: /创建人|creator/i, text: '创建人为只读字段，不能修改' },
  { match: /缺陷类型|defectType/i, text: '缺陷类型不合法，请先调用 M11 查询码 1～8' },
  { match: /回归人|regressionTester/i, text: '回归人无效：请检查工号，或清空时传 clearRegressionTester=true' },
  { match: /修复人|assignee/i, text: '修复人无效或不能为空' },
  { match: /令牌|token/i, text: '开放 API 令牌无效，请重新提供' },
  { match: /不存在|未找到/, text: '缺陷不存在，请检查编号' },
];

function humanize(message) {
  const msg = String(message || '');
  for (const { match, text } of HUMANIZE) {
    if (match.test(msg)) return text;
  }
  return msg || '操作失败，请稍后重试';
}

module.exports = { HUMANIZE, humanize };
