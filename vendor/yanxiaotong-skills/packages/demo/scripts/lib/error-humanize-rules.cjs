'use strict';

/** Demo D03/D04 错误人话 · SSOT；与 requirement humanize 分离 */
module.exports.HUMANIZE = [
  {
    pattern: /尚未配置部署根|无部署根|部署根目录/,
    text: '所选业务领域尚未配置部署根目录，无法创建 Demo。请换已配置部署根的领域后重试。',
    template: 'T-DEMO-NO-DEPLOY-ROOT',
  },
  {
    pattern: /不匹配|应用\/服务不匹配/,
    text: '业务领域与所选应用/服务不匹配，请从 M03 列表重新点选（禁止手填 appServiceId）。',
    template: 'T-DEMO-DOMAIN-SERVICE-MISMATCH',
  },
  {
    pattern: /Demo 不存在|not found/i,
    text: '未找到该 Demo，请核对 demoId、demoCode 或访问链接中的 ?d= 参数。',
    template: 'T-DELIVER-FAIL',
  },
  {
    pattern: /token|令牌|401|403/,
    text: '开放 API 令牌无效或缺失，请更换令牌后重试。',
    template: 'T-TOKEN-FAIL-ASK',
  },
];

module.exports.humanize = function humanize(message) {
  const m = String(message || '');
  for (const { pattern, text } of module.exports.HUMANIZE) {
    if (pattern.test(m)) return text;
  }
  return m ? `上传失败：${m}` : '上传失败，请检查参数后重试。';
};

module.exports.pickTemplate = function pickTemplate(message) {
  const m = String(message || '');
  for (const { pattern, template } of module.exports.HUMANIZE) {
    if (pattern.test(m)) return template;
  }
  return 'T-DELIVER-FAIL';
};
