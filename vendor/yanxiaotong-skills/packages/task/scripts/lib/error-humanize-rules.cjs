'use strict';

const HUMANIZE = [
  {
    match: /菜单序号|不是创建内容/,
    text: '刚才回复的是菜单序号。请提供需求链接、REQ 编号或任务说明',
  },
  {
    match: /创建方式序号|不是任务内容/,
    text: '刚才回复的是创建方式序号。请按所选方式提供标题/内容，或选择自动创建',
  },
  {
    match: /NEED_CREATE_MODE|请先选择创建方式/,
    text: '已识别所属需求。请选择：1 手动创建 · 2 自动创建',
  },
  {
    match: /手动创建须提供|NEED_MANUAL_TASK_INPUT/,
    text: '请提供任务标题或内容',
  },
  { match: /所属需求不能为空/, text: '请先选择所属需求' },
  {
    match: /未解析到所属需求/,
    text: '请提供需求页链接或 REQ 编号（不要只回复菜单序号）',
  },
  { match: /需求状态为已完成|不能新建任务/, text: '该需求不能新建任务（可能已完成或未满足条件），请换需求' },
  { match: /需求.*迭代/, text: '该需求尚未关联开发迭代，请换需求或在 Web 挂迭代' },
  { match: /阶段|类别/, text: '任务阶段与类别不匹配，请重新点选' },
  { match: /令牌|token/i, text: '开放 API 令牌无效，请重新提供' },
  { match: /白名单|不允许/, text: '该字段不能通过 API 修改，仅支持标题和描述' },
  { match: /已完成/, text: '已完成的任务不能取消' },
  { match: /已取消/, text: '任务已是取消状态' },
];

function humanize(message) {
  const msg = String(message || '');
  for (const { match, text } of HUMANIZE) {
    if (match.test(msg)) return text;
  }
  return msg || '操作失败，请稍后重试';
}

module.exports = { HUMANIZE, humanize };
