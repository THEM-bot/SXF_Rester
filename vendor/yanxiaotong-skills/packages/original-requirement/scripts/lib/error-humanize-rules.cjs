'use strict';

/** SSOT · 与 reference/error-humanize.md 同步 */
module.exports.HUMANIZE = [
  { pattern: /未知字段/, text: '不能提交该字段；开放 API 仅接受契约内字段。' },
  { pattern: /title|标题/, text: '请提供有效的原始需求标题。' },
  { pattern: /businessPain|痛点|业务背景/, text: '请提供业务背景/痛点。' },
  { pattern: /userNeedDesc|原始需求描述/, text: '请提供原始需求描述。' },
  { pattern: /valueDescription|价值/, text: '请提供价值描述。' },
  { pattern: /expectedDeliveryDate|计划交付/, text: '请提供计划交付日期（yyyy-MM-dd）。' },
  { pattern: /businessDomainId|业务领域/, text: '业务领域无效，请从 M01 列表重新选择。' },
  // 须先于「不存在」通用规则；勿与权限规则共用「提出人」关键词
  { pattern: /proposer|提出人不存在|提出人格式|提出人无效|提出人不能为空/, text: '提出人无效，请从 M05 用户列表点选（姓名+工号）。' },
  { pattern: /requirementAcceptancePerson|验收人不存在|验收人格式|验收人无效|验收人不能为空/, text: '验收人无效，请从 M05 用户列表点选（姓名+工号）。' },
  { pattern: /已完成|不采纳|终态|不可修改|不允许修改/, text: '该原始需求已处于终态，无法通过开放 API 修改。' },
  { pattern: /权限|无权|相关方|仅提出人|可操作受理/, text: '当前令牌用户无权修改该原始需求。' },
  { pattern: /token|令牌|401|未授权/, text: '开放 API 令牌无效或缺失，请检查令牌后重试。' },
  { pattern: /不存在|not found|404/i, text: '未找到该原始需求，请核对 OR 编号是否正确。' },
  { pattern: /至少|无可更新|no field/i, text: '请至少提供一个可修改的字段。' },
];

module.exports.humanize = function humanize(message) {
  const m = String(message || '');
  for (const { pattern, text } of module.exports.HUMANIZE) {
    if (pattern.test(m)) return text;
  }
  return m ? `提交的信息有误：${m}，请按提示修改后重试。` : '请求失败，请检查参数后重试。';
};
