#!/usr/bin/env node
/**
 * §0c / P-411 探针：单行菜单提示样式 + mode helpers
 */
import assert from 'node:assert/strict';
import {
  buildDailySyncBanner,
  buildFirstScreen,
  formatDailySyncMenuLine,
} from '../tools/lib/first-screen.mjs';
import { hasBusinessIntent } from '../tools/lib/run-daily-skill-sync.mjs';

assert.equal(hasBusinessIntent({ package: 'task' }), true);
assert.equal(hasBusinessIntent({ clarify: 'T-REQ-CLARIFY' }), true);
assert.equal(hasBusinessIntent({ package: null, confidence: 'low' }), false);
assert.equal(hasBusinessIntent(null), false);

assert.equal(
  formatDailySyncMenuLine('技能包已是最新（扫描 2 项）'),
  '—— 今日自动同步 —— 技能包已是最新（扫描 2 项）'
);
assert.equal(
  formatDailySyncMenuLine('技能包自动同步结果：\n| # |'),
  '—— 今日自动同步 ——\n技能包自动同步结果：\n| # |'
);

const banner = buildDailySyncBanner({
  dailySyncBlock: '技能包已是最新（扫描 2 项）',
  selfUpdate: true,
});
assert.equal(banner.split('\n')[0], '—— 今日自动同步 —— 技能包已是最新（扫描 2 项）');
assert.match(banner, /主技能包已更新/);
assert.equal(buildDailySyncBanner({ dailySyncBlock: null }), '');

const withDaily = buildFirstScreen({
  envLabel: '生产',
  envSourceSuffix: '（默认生产）',
  dailySyncBlock: '技能包已是最新（扫描 2 项）',
});
assert.match(withDaily, /—— 今日自动同步 —— 技能包已是最新（扫描 2 项）/);
assert.match(withDaily, /—— 请选择要做的事 ——/);
assert.doesNotMatch(withDaily, /—— 今日自动同步 ——\n技能包已是最新/);
// 环境 / 同步 / 菜单 之间须空行，避免 Markdown 折叠
assert.match(
  withDaily,
  /当前环境：生产（默认生产）\n\n—— 今日自动同步 —— 技能包已是最新（扫描 2 项）\n\n—— 请选择要做的事 ——/
);

const noDaily = buildFirstScreen({
  envLabel: '生产',
  envSourceSuffix: '（默认生产）',
  dailySyncBlock: null,
});
assert.doesNotMatch(noDaily, /今日自动同步/);
assert.match(noDaily, /—— 请选择要做的事 ——/);

console.log('test-daily-sync-p411: all passed');
