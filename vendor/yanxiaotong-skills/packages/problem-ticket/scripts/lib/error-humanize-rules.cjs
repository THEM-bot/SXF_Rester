'use strict';

function humanize(message) {
  const m = String(message || '');
  if (/令牌|token|401/i.test(m)) return '开放 API 令牌无效或已过期，请重新生成后写入本地。';
  if (/无权|403|授权/.test(m)) return '当前令牌账号无权执行该问题单操作。';
  if (/Idempotency|幂等|409/.test(m)) return '幂等键冲突或请求处理中：同内容稍后用同一 Key 重试，换内容请换 Key。';
  if (/校验|422|不能为空/.test(m)) return `字段校验失败：${m}`;
  if (/429|频繁/.test(m)) return '调用过于频繁，请下一分钟再试。';
  if (/503|主数据|默认/.test(m)) return '环境默认主数据不可用，请联系管理员检查特性组/应用服务配置。';
  return m || '请求失败';
}

module.exports = { humanize };
