#!/usr/bin/env node
import {
  parseCreateIntent,
  hasQuickCreateTrigger,
  isFullCreateMode,
  isMenuChoiceOnly,
  isCreateModeChoiceOnly,
  isRequirementRefOnly,
  hasAutoCreateCue,
  hasCreatableRequirementRef,
  MENU_CHOICE_ONLY_ERROR,
  NEED_CREATE_MODE,
  NEED_CREATE_MODE_ERROR,
  extractNlRemainder,
  autoTitle,
  beautifyUserDescription,
  generateTaskDescription,
  extractDescriptionBlock,
  resolveCreateTrack,
  TRACK_USER_INPUT,
  TRACK_REQ_ANALYZE,
  TRACK_CONTENT_REFINE,
} from '../tools/lib/parse-create-intent.mjs';
import { buildCreateBodies } from '../tools/lib/build-create-body.mjs';
import { applyDedupSkips } from '../tools/lib/dedup-tasks.mjs';

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const keywordSample =
  '在 http://localhost:5173/app/requirements/pool/requirement/4174 下新建任务，名称 API测试1，内容 测试url创建任务';

assert(isMenuChoiceOnly('1'), 'menu choice 1');
assert(isMenuChoiceOnly(' 4 '), 'menu choice 4 trimmed');
assert(!isMenuChoiceOnly('12'), 'not menu: 12');
assert(!isMenuChoiceOnly('1 创建任务'), 'not menu: 1+text');
assert(!hasCreatableRequirementRef('1'), 'menu 1 no req ref');
assert(hasCreatableRequirementRef(keywordSample), 'keyword sample has req ref');
assert(hasCreatableRequirementRef('沿用需求', { requirementId: '4174' }), 'session reuse ref');
assert(!hasCreatableRequirementRef('沿用需求', null), 'session reuse without defaults');

let menuThrew = false;
try {
  parseCreateIntent('1');
} catch (e) {
  menuThrew = e && e.code === 'MENU_CHOICE_ONLY' && String(e.message).includes('菜单序号');
}
assert(menuThrew, `parseCreateIntent('1') should throw MENU_CHOICE_ONLY: ${MENU_CHOICE_ONLY_ERROR}`);

const keywordIntent = parseCreateIntent(keywordSample);
assert(keywordIntent.create_mode === 'quick', 'create_mode should be quick');
assert(keywordIntent.track === TRACK_USER_INPUT, 'keyword track user_input');
assert(keywordIntent.requirementId === '4174', `requirementId expected 4174 got ${keywordIntent.requirementId}`);
assert(keywordIntent.title === 'API测试1', `title expected API测试1 got ${keywordIntent.title}`);
assert(keywordIntent.description === '测试url创建任务', `description mismatch: ${keywordIntent.description}`);
assert(keywordIntent.create_count === 1, 'user input default create_count 1');
assert(keywordIntent._parse.title_source === 'keyword', 'keyword title_source');
assert(keywordIntent._parse.description_source === 'keyword', 'keyword description_source');

const nlGluedSample =
  '我需要在http://localhost:5173/app/requirements/pool/requirement/4183新建任务，今天要完成接口开发，skills编写';

const gluedIntent = parseCreateIntent(nlGluedSample);
assert(gluedIntent.track === TRACK_USER_INPUT, 'glued track');
assert(gluedIntent.requirementId === '4183', `glued requirementId: ${gluedIntent.requirementId}`);
assert(
  gluedIntent.description === '接口开发，skills编写',
  `glued description: ${gluedIntent.description}`,
);
assert(gluedIntent.title === '接口开发、skills编写', `glued title: ${gluedIntent.title}`);
assert(gluedIntent.create_count === 1, 'glued create_count 1');

const taskTodaySample =
  '在http://localhost:5173/app/requirements/pool/requirement/4183下创建任务，今天的任务是接口开发和skills编写';
const todayIntent = parseCreateIntent(taskTodaySample);
assert(todayIntent.title === '接口开发、skills编写', `today title: ${todayIntent.title}`);
assert(
  todayIntent.description === '接口开发，skills编写',
  `today description: ${todayIntent.description}`,
);

const typoSample =
  '在http://localhost:5173/app/requirements/pool/requirement/4152喜爱新建任务，今天做编码和测试';
const typoIntent = parseCreateIntent(typoSample);
assert(typoIntent.requirementId === '4152', `typo requirementId: ${typoIntent.requirementId}`);
assert(typoIntent.title === '编码、测试', `typo title: ${typoIntent.title}`);
assert(typoIntent.description === '编码，测试', `typo description: ${typoIntent.description}`);

const nlSample =
  '在 http://localhost:5173/app/requirements/pool/requirement/4183 下创建任务，今天主要完成接口开发， Skills编写';

const nlIntent = parseCreateIntent(nlSample);
assert(nlIntent.requirementId === '4183', `nl requirementId expected 4183 got ${nlIntent.requirementId}`);
assert(
  nlIntent.description === '接口开发，Skills编写',
  `nl description mismatch: ${nlIntent.description}`,
);
assert(nlIntent._parse.description_beautified === true, 'nl description_beautified');
assert(nlIntent.title === '接口开发、Skills编写', `nl title expected 接口开发、Skills编写 got ${nlIntent.title}`);
assert(nlIntent._parse.title_source === 'nl_auto', 'nl_auto title_source');
assert(nlIntent._parse.description_source === 'nl_free_text', 'nl_free_text description_source');
assert(hasQuickCreateTrigger(nlSample), 'hasQuickCreateTrigger nl sample');

const nlRemainder = extractNlRemainder(nlSample);
assert(nlRemainder === '今天主要完成接口开发， Skills编写', `nl_remainder: ${nlRemainder}`);
assert(autoTitle(nlRemainder) === '接口开发、Skills编写', `autoTitle: ${autoTitle(nlRemainder)}`);
assert(
  beautifyUserDescription(nlRemainder) === '接口开发，Skills编写',
  `beautify: ${beautifyUserDescription(nlRemainder)}`,
);

const blockSample =
  '在需求http://localhost:5173/app/requirements/pool/requirement/4183下， 创建任务， 任务内容如下 === 1. 验收 迭代18的需求 2. 处理PMO关键项目阻塞点 ===';
const blockIntent = parseCreateIntent(blockSample);
assert(blockIntent.track === TRACK_USER_INPUT, 'block track user_input');
assert(blockIntent.create_count === 1, 'numbered list still create_count 1');
assert(blockIntent.requirementId === '4183', `block requirementId: ${blockIntent.requirementId}`);
assert(
  blockIntent.description.includes('验收 迭代18的需求'),
  `block description: ${blockIntent.description}`,
);
assert(
  blockIntent.description.includes('处理PMO关键项目阻塞点'),
  `block description part2: ${blockIntent.description}`,
);
assert(
  blockIntent.title === '验收 迭代18的需求、处理PMO关键项目阻塞点',
  `block title: ${blockIntent.title}`,
);
const blockExtracted = extractDescriptionBlock(blockSample);
assert(blockExtracted && blockExtracted.includes('验收'), `extractDescriptionBlock: ${blockExtracted}`);

const noNlSample =
  '在 http://localhost:5173/app/requirements/pool/requirement/4183 下创建任务';
assert(isRequirementRefOnly(noNlSample), 'no nl is requirement-ref-only');
assert(!hasAutoCreateCue(noNlSample), 'no nl without auto cue');
let needModeThrew = false;
try {
  parseCreateIntent(noNlSample);
} catch (e) {
  needModeThrew = e && e.code === NEED_CREATE_MODE && String(e.message).includes('选择创建方式');
}
assert(needModeThrew, `URL-only should throw NEED_CREATE_MODE: ${NEED_CREATE_MODE_ERROR}`);

const pendingIntent = parseCreateIntent(noNlSample, null, { allowPendingMode: true });
assert(pendingIntent.status === 'pending_create_mode', 'allowPendingMode status');
assert(pendingIntent.track == null, 'allowPendingMode track null');
assert(pendingIntent.requirementId === '4183', 'pending requirementId');

const forceAnalyze = parseCreateIntent(noNlSample, null, { forceTrack: TRACK_REQ_ANALYZE });
assert(forceAnalyze.track === TRACK_REQ_ANALYZE, 'force-track req_analyze');
assert(forceAnalyze.description == null || forceAnalyze.description === '', 'force analyze description empty');

const autoCueSample =
  '在 http://localhost:5173/app/requirements/pool/requirement/4183 下自动创建任务';
assert(hasAutoCreateCue(autoCueSample), 'auto create cue');
assert(!isRequirementRefOnly(autoCueSample), 'auto cue not ref-only');
const autoCueIntent = parseCreateIntent(autoCueSample);
assert(autoCueIntent.track === TRACK_REQ_ANALYZE, 'auto cue -> req_analyze');

assert(isCreateModeChoiceOnly('2'), 'mode choice 2');
let modeChoiceThrew = false;
try {
  parseCreateIntent('2');
} catch (e) {
  // OP menu [1-4] catches first for digit 2
  modeChoiceThrew = e && (e.code === 'MENU_CHOICE_ONLY' || e.code === 'CREATE_MODE_CHOICE_ONLY');
}
assert(modeChoiceThrew, 'mode/OP digit should not be create NL');

const urlOnly =
  'http://localhost:5173/app/requirements/pool/requirement/4195';
assert(isRequirementRefOnly(urlOnly), 'bare URL is ref-only');

const generated = generateTaskDescription(
  '<h3>1. 业务对象概述</h3><p>满足研发人员在 IDE 中创建任务。</p>',
  '今天的任务是接口开发和skills编写',
  { description_source: 'nl_free_text' },
  '开放 API 任务创建',
  '接口开发、skills编写',
);
assert(!generated.generated, 'v0.7 user description not generated');
assert(generated.text === '接口开发，skills编写', 'beautified user text in generateTaskDescription');

assert(keywordIntent.taskPhase === '开发阶段', 'taskPhase default');
assert(keywordIntent.taskCategory === '开发编码', 'taskCategory default');
assert(keywordIntent.estimatedHours === 1, 'estimatedHours default');
if (!keywordIntent.plannedStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(keywordIntent.plannedStartDate)) {
  failures.push('plannedStartDate format');
}
assert(hasQuickCreateTrigger(keywordSample), 'hasQuickCreateTrigger keyword');
assert(isFullCreateMode('完整创建任务'), 'isFullCreateMode');
assert(resolveCreateTrack({ description_source: 'nl_free_text' }, null, 'x') === TRACK_USER_INPUT, 'resolve user');

const longDocSample =
  '在 http://localhost:5173/app/requirements/pool/requirement/4195 下创建任务，' +
  '开放 API-任务创建及联动接口开发 需求编号: REQ-20260629-0051 优先级: 最高 状态: Step2 已定稿。' +
  '1. 业务对象概述 满足研发人员在 IDE 或脚本工具中对迭代任务进行创建、查询、更新说明与取消，减少切换 Web 页面的打断感。' +
  '任务状态流转（认领/进行中/完成等）仅在 Web 平台操作。2. CRUD 接口功能范围 C创建 R读取 U更新 D作废。' +
  '3. 元数据 M10 M05 M06 M08 R03。实现约束：专用 openapi.task 层；禁止直接耦合 Web TaskService。';

const longDocIntent = parseCreateIntent(longDocSample);
assert(longDocIntent.track === TRACK_CONTENT_REFINE, `long doc track: ${longDocIntent.track}`);
assert(longDocIntent.title == null, 'long doc title pending refine');
assert(longDocIntent.refine_status === 'pending_agent', 'long doc refine_status');
assert(longDocIntent.source_content && longDocIntent.source_content.length >= 200, 'long doc source_content');
assert(longDocIntent.create_count === 1, 'content_refine create_count 1');
assert(longDocIntent.title_refine_max === 40, 'title_refine_max 40');

const refineKeywordSample =
  '在 REQ-20260703-001 下创建任务，提炼：今天完成接口联调';
const refineKwIntent = parseCreateIntent(refineKeywordSample);
assert(refineKwIntent.track === TRACK_CONTENT_REFINE, '提炼 keyword track');

const bodies = buildCreateBodies({
  title: '测试',
  taskPhase: '开发阶段',
  taskCategory: '开发编码',
  requirementId: '1',
  plannedStartDate: '2026-07-09',
  plannedEndDate: '2026-07-09',
  estimatedHours: 1,
  create_count: 2,
});
assert(bodies.length === 2, 'batch bodies count');
assert(bodies[1].title.includes('（2/2）'), 'batch title suffix');

const dedupPrepared = applyDedupSkips(
  {
    task_items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    create_count: 3,
    dedup: { status: 'pending_agent_review' },
  },
  [{ proposed_index: 1, existing_taskNo: 'TASK-1', reason: '重合' }],
);
assert(dedupPrepared.task_items.length === 2, 'dedup filter count');
assert(dedupPrepared.create_count === 2, 'dedup create_count');
assert(dedupPrepared.dedup.skipped.length === 1, 'dedup skipped meta');

{
  const titled = [
    '在标题：鸟之诗',
    '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建任务，名称AAA建材批发王总，内容1111111',
  ].join('\n');
  assert(hasQuickCreateTrigger(titled), 'titled link quick trigger');
  assert(hasCreatableRequirementRef(titled), 'titled link req ref');
  const intent = parseCreateIntent(titled, null, { forceTrack: TRACK_USER_INPUT });
  assert(intent.requirementId === '4314', 'titled link requirementId');
  assert(intent.title === 'AAA建材批发王总', 'titled link task title not platform title');
  assert(String(intent.description || '').includes('1111111'), 'titled link task content');
}

if (failures.length) {
  console.error('test-parse-create-intent FAILED:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('test-parse-create-intent OK');
