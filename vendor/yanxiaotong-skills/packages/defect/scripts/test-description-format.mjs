#!/usr/bin/env node
/**
 * 缺陷描述换行规范化探针
 */
import assert from 'node:assert/strict';
import {
  normalizeStructuredDescription,
  descriptionForApiStorage,
  descriptionForConfirmCell,
} from '../tools/lib/description-format.mjs';

const oneLine =
  '【现象】 1. 被隐藏的列在下拉中“不见”了（ok） 2. 操作列中，上、下插入的入口被“遮挡”了 3. 当前列宽用均等分，空间未尽量留给需求标题 4. 默认列展示需隐藏掉部分列（做的时候找我确认） 【预期】 隐藏列在下拉中仍可见可选；操作列上下插入入口不被遮挡；列宽非均等分、优先留给需求标题；默认隐藏列范围待确认后落地。';

const normalized = normalizeStructuredDescription(oneLine);
assert.match(normalized, /【现象】/);
assert.match(normalized, /\n【预期】/);
assert.doesNotMatch(normalized, /【现象】[^\n]*【预期】/);

const api = descriptionForApiStorage(oneLine);
assert.match(api, /<br>/);
assert.match(api, /【预期】/);

const cell = descriptionForConfirmCell(oneLine);
assert.match(cell, /<br>/);
assert.ok(cell.includes('【现象】') && cell.includes('【预期】'));
assert.ok(cell.indexOf('【现象】') < cell.indexOf('<br>'));

console.log('test-description-format: all passed');
console.log('--- normalized ---');
console.log(normalized);
console.log('--- confirm cell ---');
console.log(cell);
