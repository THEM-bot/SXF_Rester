#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveRouteHint } from '../tools/lib/route-hint.mjs';

assert.equal(resolveRouteHint('3').package, 'requirement');
assert.equal(resolveRouteHint('REQ-20260101-0001').package, 'requirement');
assert.equal(resolveRouteHint('查 TASK-001').package, 'task');
assert.equal(resolveRouteHint('/requirement/4183 创建任务').package, 'task');
assert.equal(resolveRouteHint('/requirement/4183 提缺陷').package, 'defect');
assert.equal(resolveRouteHint('列表').confidence, 'low');
// 口令：不带「原始」= 需求池；带「原始」= 原始需求（不再对裸「创建需求」发 T-REQ-CLARIFY）
assert.equal(resolveRouteHint('创建需求').package, 'requirement');
assert.equal(resolveRouteHint('创建需求').operation, 'create');
assert.equal(resolveRouteHint('创建需求').clarify, undefined);
assert.equal(resolveRouteHint('创建原始需求').package, 'original-requirement');
assert.equal(resolveRouteHint('创建原始需求').operation, 'create');
assert.equal(resolveRouteHint('增删改查').clarify, 'T-REQ-CLARIFY');
assert.equal(
  resolveRouteHint(
    '在http://localhost:5173/app/requirements/original/requirement/203下新建需求',
  ).package,
  'requirement',
);
assert.equal(
  resolveRouteHint(
    '在http://localhost:5173/app/requirements/original/requirement/203下新建需求',
  ).operation,
  'create',
);
assert.equal(
  resolveRouteHint(
    '在http://localhost:5173/app/requirements/original/requirement/203下新建需求',
  ).reason,
  'or_url_create',
);

// 故事卡粘贴：正文含需求池 URL +「关联缺陷」不得盖过前缀「创建需求」
const storyPaste = [
  'uat环境 创建需求',
  '标题: IDE 内技能同步更新',
  '内容: 本地目录 关联缺陷 无',
  'https://yanxiaotong.atrust.sangfor.com/app/requirements/pool/requirement/4151',
  '故事点 5 SP',
].join('\n');
const storyHint = resolveRouteHint(storyPaste);
assert.equal(storyHint.package, 'requirement');
assert.equal(storyHint.operation, 'create');
assert.equal(storyHint.reason, 'create_requirement');

// 裸「缺陷」+ URL 不得再命中 req_url_defect；无前缀创建需求时走后续规则
const assocDefectOnly = [
  '请处理',
  'https://x/app/requirements/pool/requirement/4151',
  '关联缺陷 无',
].join('\n');
assert.notEqual(resolveRouteHint(assocDefectOnly).reason, 'req_url_defect');

// 新建原始需求 + 正文含「Demo演示」不得误路由 demo（P-412）
const orCreateWithDemoBody = [
  '/yanxiaotong-skills 新建原始需求',
  'Demo演示支持内部固定人员授权访问',
  '上传 Demo 后希望限定内部固定人员可访问；未授权内部成员仍可访问，不便安全分享。',
].join('\n');
const orDemoHint = resolveRouteHint(orCreateWithDemoBody);
assert.equal(orDemoHint.package, 'original-requirement');
assert.equal(orDemoHint.operation, 'create');
assert.equal(orDemoHint.reason, 'create_original_requirement');

// 笔误「原始i需求」仍应走创建原始需求
const orTypo = resolveRouteHint(
  ['新建原始i需求', 'Demo演示支持内部固定人员授权访问'].join('\n'),
);
assert.equal(orTypo.package, 'original-requirement');
assert.equal(orTypo.operation, 'create');

// 真·Demo 意图仍路由 demo
assert.equal(resolveRouteHint('打包 demo 上传').package, 'demo');
assert.equal(resolveRouteHint('本地环境 D03 新建演示').package, 'demo');
assert.equal(resolveRouteHint('上传 zip 到研效通').package, 'demo');

// 平台「标题+链接」复制块不得截断意图（展平后仍路由 task/defect）
assert.equal(
  resolveRouteHint(
    [
      '在标题：鸟之诗',
      '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建任务，名称A，内容B',
    ].join('\n'),
  ).package,
  'task',
);
assert.equal(
  resolveRouteHint(
    [
      '在标题：鸟之诗',
      '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建缺陷，名称A，内容B',
    ].join('\n'),
  ).package,
  'defect',
);

// 广场复制：开放 skill-zip +「再用它安装」须直通 skill-sync install（勿出首屏菜单）
const plazaCopy = [
  '本地环境。本工作区 .cursor/skills 无 yanxiaotong-skills 则直接下载安装',
  'http://127.0.0.1:19999/efficiency-hub/api/open/skills/imported/1132/skill-zip（勿扩大查找）；',
  '再用它安装 http://127.0.0.1:19999/efficiency-hub/api/open/skills/imported/1130/skill-zip。',
].join('');
const plazaHint = resolveRouteHint(plazaCopy);
assert.equal(plazaHint.package, 'skill-sync');
assert.equal(plazaHint.operation, 'install');
assert.equal(plazaHint.reason, 'skill_sync');

assert.equal(
  resolveRouteHint(
    'http://127.0.0.1:19999/efficiency-hub/api/open/skills/imported/1120/skill-zip',
  ).package,
  'skill-sync',
);

// 「读取需求详情」+ 需求池 URL 须进需求池（勿因缺少「需求池」三字出首屏）
const poolDetailPaste = [
  '读取需求详情:',
  '标题：【缺陷】研效通迭代发起uat验收活动',
  '链接：https://yanxiaotong.atrust.sangfor.com/app/requirements/pool/requirement/18893',
].join('\n');
assert.equal(resolveRouteHint(poolDetailPaste).package, 'requirement');
assert.equal(resolveRouteHint(poolDetailPaste).reason, 'requirement_pool');

const poolDetailExplicit = [
  '读取需求池详情:',
  '标题：【缺陷】研效通迭代发起uat验收活动',
  '链接：https://yanxiaotong.atrust.sangfor.com/app/requirements/pool/requirement/18893',
].join('\n');
assert.equal(resolveRouteHint(poolDetailExplicit).package, 'requirement');

// 「原始需求」仍走原始需求，不得被裸「需求」抢走
const orDetailPaste = [
  '读取原始需求详情标题：组织待办-待办自动每周总结',
  '链接：https://yanxiaotong.atrust.sangfor.com/app/requirements/original/requirement/989',
].join('\n');
assert.equal(resolveRouteHint(orDetailPaste).package, 'original-requirement');
assert.equal(resolveRouteHint(orDetailPaste).reason, 'original_requirement');
assert.equal(resolveRouteHint('读取原始需求详情').package, 'original-requirement');

// 「技能」即可进 skill-sync，不必须「技能包」
assert.equal(resolveRouteHint('技能').package, 'skill-sync');
assert.equal(resolveRouteHint('更新技能').package, 'skill-sync');
assert.equal(resolveRouteHint('安装技能').package, 'skill-sync');
assert.equal(resolveRouteHint('技能包').package, 'skill-sync');

assert.equal(resolveRouteHint('7').package, 'org-todo');
assert.equal(resolveRouteHint('查组织待办 OT-20260804-0001').package, 'org-todo');
assert.equal(resolveRouteHint('查组织待办 OT-20260804-0001').operation, 'detail');
assert.equal(resolveRouteHint('创建组织待办').package, 'org-todo');
assert.equal(resolveRouteHint('创建组织待办').operation, 'create');
assert.equal(resolveRouteHint('给 OT-20260804-0001 追加进展').package, 'org-todo');
assert.equal(resolveRouteHint('给 OT-20260804-0001 追加进展').operation, 'append-progress');
assert.equal(resolveRouteHint('把 OT-20260804-0001 状态改成处理中').package, 'org-todo');
assert.equal(resolveRouteHint('把 OT-20260804-0001 状态改成处理中').operation, 'update');
assert.notEqual(resolveRouteHint('待办列表').package, 'org-todo');

assert.equal(resolveRouteHint('8').package, 'problem-ticket');
assert.equal(resolveRouteHint('创建问题单').package, 'problem-ticket');
assert.equal(resolveRouteHint('创建问题单').operation, 'create');
assert.equal(resolveRouteHint('获取问题单元数据').package, 'problem-ticket');
assert.equal(resolveRouteHint('获取问题单元数据').operation, 'metadata');

console.log('test-route-hint: all passed');
