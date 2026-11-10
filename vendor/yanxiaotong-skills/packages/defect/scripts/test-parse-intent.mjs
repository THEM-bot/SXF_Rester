#!/usr/bin/env node
/**
 * parse-intent 单元探针
 */
import assert from 'node:assert/strict';
import { parseIntent } from '../tools/lib/parse-intent-core.mjs';

const session = {
  last_create_defaults: { requirementId: '999', requirementNo: 'REQ-20260101-0001' },
  last_defect: { defectNo: 'TD-20260704-0001' },
};

function test(name, fn) {
  try {
    fn();
    console.log(`OK: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}`, e.message);
    process.exit(1);
  }
}

test('create from requirement url', () => {
  const i = parseIntent(
    '在 http://localhost:5173/app/requirements/pool/requirement/4174 下创建缺陷，标题 登录无响应',
    null,
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.requirementId, '4174');
  assert.equal(i.title, '登录无响应');
  assert.equal(i._parse.title_source, 'keyword');
  assert.ok(!i.missing.includes('requirement'));
});

test('create from nl free text without keyword', () => {
  const i = parseIntent(
    '在 REQ-20260703-001 下创建缺陷，登录按钮无响应，Chrome 点击后页面卡死',
    null,
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.requirementNo, 'REQ-20260703-001');
  assert.equal(i.title, '登录按钮无响应');
  assert.equal(i.description, 'Chrome 点击后页面卡死');
  assert.equal(i._parse.title_source, 'nl_auto');
  assert.ok(!i.missing.includes('title'));
});

test('create single segment nl', () => {
  const i = parseIntent('在 REQ-20260703-001 下提 BUG：支付回调超时', null);
  assert.equal(i.operation, 'create');
  assert.equal(i.title, '支付回调超时');
  assert.equal(i.description, null);
  assert.ok(!i.missing.includes('title'));
});

test('create missing title', () => {
  const i = parseIntent('在需求 4174 下创建缺陷', null);
  assert.equal(i.operation, 'create');
  assert.equal(i.requirementId, '4174');
  assert.ok(i.missing.includes('title'));
});

test('detail by TD', () => {
  const i = parseIntent('查 TD-20260704-0001 详情', null);
  assert.equal(i.operation, 'detail');
  assert.equal(i.idOrNo, 'TD-20260704-0001');
});

test('list requires query verb not bare 列表', () => {
  assert.equal(parseIntent('列表', null).operation, null);
  assert.equal(parseIntent('服务列表', null).operation, null);
  const i = parseIntent('查需求 4174 下的缺陷', null);
  assert.equal(i.operation, 'list');
});

test('list by requirement', () => {
  const i = parseIntent('查需求 4174 下的缺陷', null);
  assert.equal(i.operation, 'list');
  assert.equal(i.listQuery.requirementId, '4174');
});

test('status change', () => {
  const i = parseIntent('把 TD-20260704-0001 状态改为 处理中', null);
  assert.equal(i.operation, 'status');
  assert.equal(i.status, '处理中');
});

test('close resolved', () => {
  const i = parseIntent('解决关闭 TD-20260704-0001', null);
  assert.equal(i.operation, 'close');
  assert.equal(i.closeType, 'resolved');
});

test('update defect type by label', () => {
  const i = parseIntent('把 TD-20260704-0001 缺陷类型改为编码问题', null);
  assert.equal(i.operation, 'update');
  assert.equal(i.updateBody.defectType, '5');
});

test('update clear regression tester', () => {
  const i = parseIntent('把 TD-20260704-0001 清空回归人', null);
  assert.equal(i.operation, 'update');
  assert.equal(i.updateBody.clearRegressionTester, true);
});

test('create with defect type label', () => {
  const i = parseIntent('在 REQ-20260703-001 下创建缺陷，标题 样式错乱，缺陷类型 设计问题', null);
  assert.equal(i.operation, 'create');
  assert.equal(i.defectType, '4');
  assert.equal(i.defectTypeLabel, '设计问题');
  assert.equal(i.defectTypeSource, 'explicit');
});

test('create does not keyword-infer coding from 无响应/卡死 (v0.6 Agent owns semantic)', () => {
  const i = parseIntent(
    '在 REQ-20260703-001 下创建缺陷，登录按钮无响应，Chrome 点击后页面卡死',
    null,
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.defectType, undefined);
  assert.equal(i.defectTypeLabel, '（未选）');
  assert.equal(i.defectTypeSource, null);
});

test('create does not keyword-infer design from 样式错乱', () => {
  const i = parseIntent('在 REQ-20260703-001 下创建缺陷，列表页样式错乱', null);
  assert.equal(i.defectType, undefined);
  assert.equal(i.defectTypeLabel, '（未选）');
});

test('create explicit type still works without agent', () => {
  const i = parseIntent(
    '在 REQ-20260703-001 下创建缺陷，标题 登录无响应，缺陷类型 设计问题',
    null,
  );
  assert.equal(i.defectType, '4');
  assert.equal(i.defectTypeSource, 'explicit');
  assert.equal(i.defectTypeLabel, '设计问题');
});

test('create no type signal stays unset', () => {
  const i = parseIntent('在 REQ-20260703-001 下创建缺陷，标题 偶发提示文案', null);
  assert.equal(i.defectType, undefined);
  assert.equal(i.defectTypeLabel, '（未选）');
});

test('create does not keyword-infer merge-related', () => {
  const i = parseIntent('在 REQ-20260703-001 下创建缺陷，合入后列表接口 500', null);
  assert.equal(i.defectType, undefined);
  assert.equal(i.defectTypeLabel, '（未选）');
});

test('legacy keyword infer helper still available when opted in', async () => {
  const { inferDefectTypeFromContent, applyDefectTypeToIntent, formatDefectTypeLabel } =
    await import('../tools/lib/defect-type.mjs');
  const hit = inferDefectTypeFromContent('登录按钮无响应，页面卡死');
  assert.equal(hit.defectType, '5');
  assert.equal(hit.source, 'content_infer');
  const applied = applyDefectTypeToIntent(
    { title: '负责人未带工号', description: '赋值缺少工号' },
    { defectType: '5' },
  );
  assert.equal(applied.defectType, '5');
  assert.equal(applied.defectTypeSource, 'agent_infer');
  assert.equal(applied.defectTypeLabel, '编码问题（自动判定）');
  assert.equal(formatDefectTypeLabel('5', 'agent_infer'), '编码问题（自动判定）');
});

test('blocked update creator', () => {
  const i = parseIntent('修改缺陷99的创建人为张三', null);
  assert.equal(i.blockedUpdateField, 'creator');
  assert.equal(i.operation, null);
});

test('update severity', () => {
  const i = parseIntent('把 TD-20260704-0001 严重性改成 B类（严重）', null);
  assert.equal(i.operation, 'update');
  assert.equal(i.updateBody.severity, 'B类（严重）');
});

test('blocked update discovery phase', () => {
  const i = parseIntent('修改缺陷99的发现阶段为已完成', null);
  assert.equal(i.blockedUpdateField, 'discoveryPhase');
  assert.equal(i.operation, null);
});

test('session defect', () => {
  const i = parseIntent('查刚才创建的缺陷', session);
  assert.equal(i.operation, 'detail');
  assert.equal(i.idOrNo, 'TD-20260704-0001');
});

test('create content_refine long text', () => {
  const longText =
    '在 http://localhost:5173/app/requirements/pool/requirement/4174 下创建缺陷，' +
    '需求编号 REQ-20260703-001 优先级高 现象：用户在 Chrome 浏览器点击登录按钮后页面完全卡死无响应。' +
    '复现步骤：1. 打开登录页 2. 输入账号密码 3. 点击登录 4. 页面冻结。' +
    '预期：正常跳转首页。实际：页面卡死需强制刷新。环境：Chrome 120 Windows 11。' +
    '补充：该问题在 Firefox 下偶现，Safari 暂未复现。日志显示前端 JS 报错 timeout。' +
    '相关接口 /api/auth/login 返回 200 但后续路由未执行。';
  const i = parseIntent(longText, null);
  assert.equal(i.operation, 'create');
  assert.equal(i.track, 'content_refine');
  assert.equal(i.refine_status, 'pending_agent');
  assert.equal(i.title, null);
  assert.ok(i.source_content && i.source_content.length >= 80);
  assert.ok(i.missing.includes('refine'));
  assert.equal(i.title_refine_max, 40);
});

test('create with assignee keyword', () => {
  const i = parseIntent(
    '在 http://localhost:5173/app/requirements/pool/requirement/4174 下创建缺陷，名称 desuwa，内容 xx，修复人张三',
    null,
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.title, 'desuwa');
  assert.equal(i.assigneeKeyword, '张三');
  assert.equal(i._parse.assignee_source, 'keyword');
});

test('create from platform titled link block', () => {
  const i = parseIntent(
    [
      '在标题：鸟之诗',
      '链接：http://localhost:5173/app/requirements/pool/requirement/4314下新建缺陷，名称AAA建材批发王总，内容1111111',
    ].join('\n'),
    null,
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.requirementId, '4314');
  assert.equal(i.title, 'AAA建材批发王总');
  assert.equal(i.description, '1111111');
  assert.notEqual(i.title, '鸟之诗');
});

console.log('test-parse-intent: all passed');
