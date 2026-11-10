#!/usr/bin/env node
/**
 * first-screen 快照探针（P-302）
 */
import assert from 'node:assert/strict';
import { buildFirstScreen } from '../tools/lib/first-screen.mjs';

const text = buildFirstScreen({
  envLabel: '生产',
  envSourceSuffix: '（默认生产）',
  dailySyncBlock: '今日已比对技能包',
});

assert.match(text, /研效通技能助手/);
assert.match(text, /6\. 技能包/);
assert.match(text, /7\. 组织待办/);
assert.match(text, /8\. 问题单/);
assert.match(text, /5\. 缺陷/);
assert.match(text, /须令牌：/);
assert.match(text, /1、2、3、4、5、6、7、8/);
assert.match(text, /当前环境：生产（默认生产）/);

console.log('test-first-screen: all passed');
