'use strict';

/** SSOT · 与 reference/error-humanize.md 同步；verify 与 Agent 共用 */
module.exports.HUMANIZE = [
  { pattern: /关联项目不存在|已失效/, text: '关联项目无效或已失效，请从 M02 列表重新选择，或换一个业务领域。' },
  { pattern: /businessDomainId|业务领域/, text: '业务领域不能为空或无效，请从 M01 列表重新选择。' },
  { pattern: /projectId|关联项目|不属于所选业务领域/, text: '关联项目无效或不属于当前领域，请从 M02 列表重新选择。' },
  { pattern: /requirementLevel|需求层级/, text: '需求层级须与 Web 下拉一致：史诗EPIC、特性Feature、故事Story（API 传 Epic/Feature/Story）。' },
  { pattern: /appServiceId|应用\/服务/, text: '应用/服务无效，请从 M03 列表重新选择。' },
  { pattern: /title|标题/, text: '请提供有效的需求标题（不超过 200 字）。' },
  { pattern: /description|描述|需求描述不能为空/, text: '请提供需求描述（必填，不可跳过）。' },
  { pattern: /白名单|VR-09|不可修改|黑名单|不支持通过开放 API 修改/, text: '该字段不能通过开放 API 修改，请到 Web 端调整。' },
  { pattern: /优先级|priority|不合法|必须是：最高/, text: '优先级须为中文：最高、高、中、低之一（禁止 HIGH/LOW 等英文）。' },
  { pattern: /已经是作废状态|无需重复/, text: '该需求已作废，无需重复操作。' },
  { pattern: /已作废.*不允许|不允许编辑/, text: '该需求已作废，无法继续修改。' },
  { pattern: /作废|已作废|cancel/i, text: '该需求已作废或无法继续修改。' },
  { pattern: /无可更新字段|no field/i, text: '请至少提供一个可修改的字段（标题、描述、优先级等）。' },
  { pattern: /token|令牌|401|未授权/, text: '开放 API 令牌无效或缺失，请检查令牌后重试。' },
  { pattern: /originalRequirementId|原始需求不存在或已删除/, text: '未找到该原始需求，请核对 OR 编号、详情 URL 或 ID。' },
  { pattern: /受理状态不允许关联/, text: '该原始需求当前受理状态不允许关联需求（如已完成/不采纳）。' },
  { pattern: /原始需求 ID 格式不正确/, text: '原始需求引用须为数字 id、OR- 编号或合法详情 URL。' },
  { pattern: /originalRequirementId 与 originalNo/, text: 'originalRequirementId 与 originalNo 须指向同一条原始需求。' },
  { pattern: /不存在|not found|404|已被删除/i, text: '未找到该需求，请核对编号 REQ- 是否正确。' },
];

module.exports.humanize = function humanize(message) {
  const m = String(message || '');
  for (const { pattern, text } of module.exports.HUMANIZE) {
    if (pattern.test(m)) return text;
  }
  return m ? `提交的信息有误：${m}，请按提示修改后重试。` : '请求失败，请检查参数后重试。';
};
