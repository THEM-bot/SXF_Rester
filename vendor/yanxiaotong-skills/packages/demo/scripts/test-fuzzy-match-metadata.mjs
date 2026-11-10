/**
 * 机检：D03 领域/所属组口语模糊匹配
 * node scripts/test-fuzzy-match-metadata.mjs
 */
import assert from 'node:assert/strict';
import {
  formatMetaMatchConfirm,
  formatMetaMatchMiss,
  fuzzyMatchMetadata,
  scoreMetaName,
} from '../tools/lib/fuzzy-match-metadata.mjs';

const domains = [
  { id: '1', name: '111' },
  { id: '4', name: 'IT部-平台组' },
  { id: '5', name: 'IT部-盘古销' },
  { id: '6', name: '供应链' },
];

assert.equal(scoreMetaName('IT部-平台组', 'IT部-平台组'), 100);
assert.ok(scoreMetaName('平台组', 'IT部-平台组') >= 68);
assert.ok(scoreMetaName('平台组', '供应链') === 0);

const m1 = fuzzyMatchMetadata(domains, '平台组');
assert.equal(m1.length, 1);
assert.equal(m1[0].name, 'IT部-平台组');

const services = [
  { id: 'a', name: '研效通-平台组' },
  { id: 'b', name: '研效通-doc-20260323' },
  { id: 'c', name: '数智化' },
];
const m3 = fuzzyMatchMetadata(services, '平台组');
assert.equal(m3.length, 1);
assert.equal(m3[0].name, '研效通-平台组');

const multi = fuzzyMatchMetadata(
  [
    { id: '1', name: '平台组' },
    { id: '2', name: 'IT部-平台组' },
    { id: '3', name: '研效通-平台组' },
  ],
  '平台组',
);
assert.ok(multi.length >= 2);
assert.equal(multi[0].name, '平台组');

const confirm1 = formatMetaMatchConfirm({
  kindLabel: '业务领域',
  userKeyword: '平台组',
  matches: [{ name: 'IT部-平台组' }],
});
assert.match(confirm1, /确认使用「IT部-平台组」/);
assert.match(confirm1, /不对，从完整列表重新选择/);

const confirmN = formatMetaMatchConfirm({
  kindLabel: '所属服务',
  userKeyword: '平台',
  matches: multi.map((x) => ({ name: x.name })),
});
assert.match(confirmN, /最相近/);
assert.match(confirmN, /都不对，从完整列表重新选择/);

const miss = formatMetaMatchMiss({
  kindLabel: '业务领域',
  userKeyword: '不存在的领域xyz',
  pickListText: '请选择（回复序号）：\n1. 供应链',
});
assert.match(miss, /未在业务领域列表中匹配到/);
assert.match(miss, /供应链/);

console.log('test-fuzzy-match-metadata OK');
