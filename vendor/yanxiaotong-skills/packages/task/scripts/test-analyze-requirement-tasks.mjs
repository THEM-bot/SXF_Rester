#!/usr/bin/env node
import { analyzeRequirementForTasks, inferCreateCountFromRequirement } from '../tools/lib/analyze-requirement-tasks.mjs';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const req4183 = {
  title: '开放 API-任务创建及联动接口开发/skills技能',
  description:
    '<h3>1. 业务对象概述</h3><p>满足研发人员在 IDE 或脚本工具中对迭代任务进行创建、查询、更新说明与取消，减少切换 Web 页面的打断感。</p>',
  plannedHours: null,
  storyPoint: 1,
};

const single = analyzeRequirementForTasks(req4183);
assert(single.create_count === 1, 'single count');
assert(single.tasks[0].title !== req4183.title, 'title should be analyzed not copy');
assert(!single.tasks[0].description.includes('<h3>'), 'no raw HTML');
assert(single.tasks[0].description.includes(single.tasks[0].title), 'desc includes title');

const reqMulti = {
  title: '用户退出登录操作',
  description:
    '业务对象概述 用户点击退出登录后清除状态。2. CRUD C（创建）：新增任务。R（读取）：详情。U（更新）：改标题。',
  plannedHours: 3,
  storyPoint: null,
};
const multi = analyzeRequirementForTasks(reqMulti);
assert(multi.create_count === 3, `multi count ${multi.create_count}`);
assert(multi.tasks.length === 3, 'three task items');
assert(multi.create_count_source === 'planned_hours', 'planned_hours source');

const infer = inferCreateCountFromRequirement({ plannedHours: 2, storyPoint: 5 });
assert(infer.count === 2 && infer.source === 'planned_hours', 'infer plannedHours first');

const reqCrud = {
  title: '开放 API-任务创建及联动接口开发/skills技能',
  description:
    '<h3>1. 业务对象概述</h3><p>满足研发人员在 IDE 或脚本工具中对迭代任务进行创建、查询、更新说明与取消。</p>' +
    '<h3>2. CRUD 接口功能范围（P0）</h3>' +
    '<p>C（创建）：开放 API 新增任务。R（读取）：详情与分页。U（更新）：仅标题、描述。D（作废/关闭）：取消。</p>',
  plannedHours: null,
  storyPoint: 1,
};
const crud = analyzeRequirementForTasks(reqCrud);
assert(crud.create_count === 4, `crud count ${crud.create_count}`);
assert(crud.create_count_source === 'req_work_items', 'crud source');
assert(crud.tasks[0].title.includes('创建'), `crud title ${crud.tasks[0].title}`);
assert(!crud.tasks[0].title.includes('&nbsp'), 'no html entity in title');
assert(crud.tasks[0].description.includes(crud.tasks[0].title), 'crud desc has title');
assert(
  !crud.tasks[0].description.includes('C（创建）'),
  'desc should use overview not raw work item',
);

if (failures.length) {
  console.error('test-analyze-requirement-tasks FAILED:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('test-analyze-requirement-tasks OK');
