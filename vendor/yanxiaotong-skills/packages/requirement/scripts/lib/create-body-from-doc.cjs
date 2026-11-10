'use strict';

/**
 * SC-260827-001：从 parse-doc 结果组装 R01 body（含实现方式 / 生成模式闸）
 * 同时保留 SC-260802-005 故事点（parsed.storyPoint 优先）
 */

function resolveImplementationType(parsed) {
  if (parsed?.implementationType === 'TRADITIONAL') return 'TRADITIONAL';
  if (parsed?.implementationType === 'AI_CODING') return 'AI_CODING';
  // 文档未写实现方式：默认 AI_CODING（与开放 Q6 一致），仍须有效生成模式
  return 'AI_CODING';
}

function assertGenerateModeAllowed(parsed) {
  const implementationType = resolveImplementationType(parsed);
  if (implementationType === 'TRADITIONAL') {
    return { ok: true, implementationType, generateModeName: null };
  }
  const warnings = parsed?.warnings || [];
  const blocked = warnings.find(
    (w) =>
      w.blocked &&
      (w.type === 'generate-mode-pending' ||
        w.type === 'generate-mode-missing' ||
        w.type === 'generate-mode-ambiguous'),
  );
  const name = (parsed?.generateModeName || '').trim();
  const status = parsed?.generateModeStatus;
  if (blocked || !name || status === 'pending' || status === 'missing' || status === 'ambiguous') {
    const msg =
      blocked?.message ||
      'AI-Coding 须有效「AI-Coding生成模式」属性（已发布规范名）；禁止无模式创建';
    const err = new Error(msg);
    err.code = 'GENERATE_MODE_BLOCKED';
    err.generateModeStatus = status || 'missing';
    throw err;
  }
  return { ok: true, implementationType, generateModeName: name };
}

/**
 * @param {object} parsed parseRequirementDoc().parsed
 * @param {object} defaults 六必填等
 */
function buildCreateBodyFromParsed(parsed, defaults = {}) {
  if (!parsed?.title) throw new Error('文档未解析到标题');
  const { implementationType, generateModeName } = assertGenerateModeAllowed(parsed);
  const body = {
    title: parsed.title,
    description: parsed.description || '',
    businessDomainId: defaults.businessDomainId,
    projectId: defaults.projectId,
    appServiceId: defaults.appServiceId,
    requirementLevel: defaults.requirementLevel,
    implementationType,
    ...(defaults.teamId ? { teamId: defaults.teamId } : {}),
    ...(defaults.originalRequirementId
      ? { originalRequirementId: defaults.originalRequirementId }
      : {}),
    ...(parsed.priority ? { priority: parsed.priority } : {}),
    ...(parsed.requirementType ? { requirementType: parsed.requirementType } : {}),
  };
  // SC-260802-005：故事卡解析优先；否则可用 defaults
  if (parsed.storyPoint != null && parsed.storyPoint !== '') {
    body.storyPoint = parsed.storyPoint;
  } else if (defaults.storyPoint != null) {
    body.storyPoint = defaults.storyPoint;
  }
  if (implementationType !== 'TRADITIONAL' && generateModeName) {
    body.generateModeName = generateModeName;
  }
  return body;
}

module.exports = {
  resolveImplementationType,
  assertGenerateModeAllowed,
  buildCreateBodyFromParsed,
};
