#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizePlatformTitledLinks } from '../tools/lib/platform-titled-link.mjs';
import { extractIntentPrefix } from '../tools/lib/intent-prefix.mjs';
import { resolveRouteHint } from '../tools/lib/route-hint.mjs';

const titledDefect = [
  '在标题：鸟之诗',
  '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建缺陷，名称AAA建材批发王总，内容1111111',
].join('\n');

const flatDefect = normalizePlatformTitledLinks(titledDefect);
assert.match(flatDefect, /\/requirement\/4314/);
assert.doesNotMatch(flatDefect, /标题\s*[:：]/);
assert.doesNotMatch(flatDefect, /链接\s*[:：]/);
assert.match(flatDefect, /新建缺陷/);
assert.match(flatDefect, /名称AAA/);

assert.match(extractIntentPrefix(titledDefect), /新建缺陷/);
assert.notEqual(extractIntentPrefix(titledDefect), '在');

const defectHint = resolveRouteHint(titledDefect);
assert.equal(defectHint.package, 'defect');
assert.equal(defectHint.operation, 'create');
assert.equal(defectHint.reason, 'req_url_defect');

const titledTask = [
  '在标题：鸟之诗',
  '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建任务，名称AAA建材批发王总，内容1111111',
].join('\n');
const taskHint = resolveRouteHint(titledTask);
assert.equal(taskHint.package, 'task');
assert.equal(taskHint.operation, 'create');
assert.equal(taskHint.reason, 'req_url_task');

// 同行形态
const inline = '标题：鸟之诗 链接：https://x/app/requirements/pool/requirement/4151 下创建任务';
assert.equal(resolveRouteHint(inline).package, 'task');

// 仅「链接：」标签
const linkOnly = '请在链接：http://localhost:5173/app/requirements/pool/requirement/99下提缺陷';
assert.equal(resolveRouteHint(linkOnly).package, 'defect');

// 故事卡：标题/内容正文不得被当成平台链接块展平
const storyPaste = [
  'uat环境 创建需求',
  '标题: IDE 内技能同步更新',
  '内容: 本地目录 关联缺陷 无',
  'https://yanxiaotong.atrust.sangfor.com/app/requirements/pool/requirement/4151',
].join('\n');
assert.equal(extractIntentPrefix(storyPaste).trim(), 'uat环境 创建需求');
assert.equal(resolveRouteHint(storyPaste).package, 'requirement');
assert.match(normalizePlatformTitledLinks(storyPaste), /标题:\s*IDE/);

// 原始需求 URL + 标题块
const orTitled = [
  '在标题：某原始需求',
  '链接：http://localhost:5173/app/requirements/original/requirement/203下新建需求',
].join('\n');
assert.equal(resolveRouteHint(orTitled).package, 'requirement');
assert.equal(resolveRouteHint(orTitled).reason, 'or_url_create');

console.log('test-platform-titled-link: all passed');
