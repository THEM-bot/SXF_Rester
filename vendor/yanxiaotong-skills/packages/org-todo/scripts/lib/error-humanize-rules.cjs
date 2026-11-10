'use strict';

const RULES = [
  { re: /组织待办不存在/i, msg: '未找到该组织待办，请核对编号是否正确。' },
  { re: /负责人不能为空|owners/i, msg: '负责人不能为空，请至少提供一个有效工号或姓名。' },
  { re: /待办描述不能为空|descriptionHtml/i, msg: '待办描述不能为空。' },
  { re: /计划闭环日不能为空|plannedCloseAt/i, msg: '请提供计划闭环日（yyyy-MM-dd）。' },
  { re: /无法解析 Token 用户/i, msg: '未能识别当前令牌用户，请直接提供负责人工号或姓名。' },
  { re: /请求体 JSON 格式错误|不支持的字段/i, msg: '请求参数格式有误（常见：projectIds 须为字符串数组；创建勿传 status）。' },
  { re: /bodyHtml/i, msg: '进展正文不能为空。' },
  { re: /非法.*status|status/i, msg: '状态值不合法，请从待处理/处理中/已闭环/挂起/作废中选择。' },
  { re: /projectIds/i, msg: '关联项目至多 1 个。' },
  { re: /令牌无效|Token/i, msg: '开放 API 令牌无效或已过期，请重新配置 Token。' },
  { re: /缺少 X-Open-Api-Token/i, msg: '缺少开放 API 令牌，请先配置 Token。' },
];

function humanize(message) {
  const m = String(message || '').trim();
  if (!m) return '操作失败，请稍后重试。';
  for (const { re, msg } of RULES) {
    if (re.test(m)) return msg;
  }
  return m;
}

module.exports = { humanize, RULES };
