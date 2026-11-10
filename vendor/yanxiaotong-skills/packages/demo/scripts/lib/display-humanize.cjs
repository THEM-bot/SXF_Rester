'use strict';

/** Demo 用户可见交付 · 中文标签（Q23 · P-179～P-181） */

function formatUploadSuccess({ demoId, demoCode, accessUrl, detailUrl }) {
  const lines = [
    '上传成功。流程结束。',
    '',
    '| 项目 | 内容 |',
    '|------|------|',
  ];
  if (demoId) lines.push(`| Demo 编号 | ${demoId} |`);
  if (demoCode) lines.push(`| Demo 编码 | ${demoCode} |`);
  lines.push(`| 访问链接 | ${accessUrl || '（响应未返回）'} |`);
  if (detailUrl) lines.push(`| 详情页链接 | ${detailUrl} |`);
  return lines.join('\n');
}

function formatUploadFail(message) {
  return `上传失败。\n\n原因：${message || '未知错误'}\n\n未返回有效访问链接，请勿使用猜测链接。`;
}

function formatMetadataFail(reason) {
  return `元数据拉取失败：${reason}`;
}

function formatMetadataPickList(records) {
  const lines = ['请选择（回复序号）：'];
  records.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.name || r.label || '（未命名）'}`);
  });
  return lines.join('\n');
}

module.exports = {
  formatUploadSuccess,
  formatUploadFail,
  formatMetadataFail,
  formatMetadataPickList,
};
