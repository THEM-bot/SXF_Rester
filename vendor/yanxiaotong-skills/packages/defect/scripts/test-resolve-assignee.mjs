#!/usr/bin/env node
/**
 * resolveCreateAssignee 单元探针（无 HTTP）
 */
import assert from 'node:assert/strict';
import { resolveCreateAssignee } from '../tools/lib/prepare-execute.mjs';

async function test(name, fn) {
  try {
    await fn();
    console.log(`OK: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}`, e.message);
    process.exit(1);
  }
}

await test('user assigneeId wins', async () => {
  const r = await resolveCreateAssignee(
    { assigneeId: '47420', assigneeName: '高欢鑫47420' },
    { developerEmployeeIds: ['999'], developerNames: ['别人'] },
    {},
  );
  assert.equal(r.assigneeId, '47420');
  assert.equal(r.assigneeSource, '用户指定');
  assert.match(r.assigneeLabel, /用户指定/);
});

await test('first developer employee wins over token', async () => {
  const r = await resolveCreateAssignee(
    {},
    {
      developerEmployeeIds: ['', '88888', '777'],
      developerNames: ['空', '开发甲', '开发乙'],
    },
    {},
  );
  assert.equal(r.assigneeId, '88888');
  assert.equal(r.assigneeName, '开发甲');
  assert.equal(r.assigneeSource, '需求开发人员');
});

await test('token fallback when no developers', async () => {
  const r = await resolveCreateAssignee({}, { developerEmployeeIds: [], developerNames: [] }, {});
  assert.equal(r.assigneeId, null);
  assert.equal(r.assigneeSource, '令牌');
  assert.match(r.assigneeLabel, /令牌/);
});

console.log('test-resolve-assignee: all passed');
