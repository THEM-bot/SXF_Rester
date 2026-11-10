/**
 * node scripts/test-format-demo-preview.mjs
 */
import assert from 'node:assert/strict';
import {
  formatDemoUploadPreview,
  summarizeMatchField,
} from '../tools/lib/format-demo-preview.mjs';

const matched = summarizeMatchField({
  kind: 'domain',
  keyword: '平台组',
  matches: [{ id: '1', name: 'IT部-平台组', score: 92 }],
});
assert.equal(matched.display, 'IT部-平台组');
assert.match(matched.note, /匹配「平台组」/);

const miss = summarizeMatchField({
  kind: 'service',
  keyword: '不存在',
  matches: [],
});
assert.equal(miss.status, 'unmatched');

const text = formatDemoUploadPreview({
  zipPath: 'D:/tmp/a.zip',
  environment: '本地',
  name: 'IT研效通-测试-03',
  nameNote: '您本轮指定',
  domainDisplay: 'IT部-平台组',
  domainNote: '匹配「平台组」',
  serviceDisplay: '研效通-平台组',
  serviceNote: '匹配「平台组」',
  readyForD03: true,
});
assert.match(text, /\| Demo 名称 \|/);
assert.match(text, /确认，继续上传/);
assert.match(text, /修改某项信息/);
assert.doesNotMatch(text, /继续选择上传方式/);
assert.doesNotMatch(text, /请选择上传方式/);

console.log('test-format-demo-preview OK');
