/**
 * parse-create-intent + refine 机测
 */
import assert from 'node:assert/strict';
import {
  parseCreateIntent,
  parseOriginalRequirementRef,
  extractCreateNlRemainder,
} from '../tools/lib/parse-create-intent.mjs';
import {
  refineFromUserInput,
  refineFromOriginalRequirement,
  resolveCreateTitleDescription,
} from '../tools/lib/refine-requirement-content.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`fail - ${name}`);
    throw e;
  }
}

test('parse OR-no under create', () => {
  const i = parseCreateIntent(
    '在 OR-20260701-0001 下新建需求，支持按原始需求拆池内条目，补充说明一段',
  );
  assert.equal(i.operation, 'create');
  assert.equal(i.needs_original_resolve, true);
  assert.equal(i.original_ref.originalIdOrNo, 'OR-20260701-0001');
  assert.equal(i.title, '支持按原始需求拆池内条目');
  assert.ok(i.description && i.description.includes('补充说明'));
  assert.deepEqual(i.missing, []);
});

test('parse under original requirement id', () => {
  const ref = parseOriginalRequirementRef('在原始需求 555 下创建需求，登录改造');
  assert.equal(ref.originalIdOrNo, '555');
  const i = parseCreateIntent('在原始需求 555 下创建需求，登录改造');
  assert.equal(i.title, '登录改造');
  assert.ok(i.user_text_substantial);
});

test('parse web original requirement URL', () => {
  const u =
    '在http://localhost:5173/app/requirements/original/requirement/203下新建需求';
  const ref = parseOriginalRequirementRef(u);
  assert.equal(ref.originalIdOrNo, '203');
  assert.equal(ref.source, 'url_web');
  const i = parseCreateIntent(u);
  assert.equal(i.needs_original_resolve, true);
  assert.equal(i.under_parent, true);
  assert.equal(i.user_text_substantial, false);
  assert.ok(i.missing.includes('description') || i.missing.includes('title'));
});

test('nl remainder strips OR and verb', () => {
  const r = extractCreateNlRemainder('在 OR-20260701-0001 下新建需求，登录页改造');
  assert.ok(r);
  assert.ok(!/OR-/i.test(r));
  assert.ok(!/新建需求/.test(r));
  assert.match(r, /登录页改造/);
});

test('原始需求为: OR-xxx 不得误当标题/描述', () => {
  const samples = [
    '创建需求 原始需求为: OR-20260629-0001',
    '/yanxiaotong-skills 创建需求 原始需求为: OR-20260629-0001',
    '原始需求为 OR-20260629-0001 创建需求',
    '创建需求，原始需求是：OR-20260629-0001',
  ];
  for (const s of samples) {
    const rem = extractCreateNlRemainder(s);
    assert.equal(rem, null, `remainder should be null for: ${s}`);
    const i = parseCreateIntent(s);
    assert.equal(i.needs_original_resolve, true);
    assert.equal(i.original_ref.originalIdOrNo, 'OR-20260629-0001');
    assert.equal(i.user_text_substantial, false);
    assert.notEqual(i.title, '原始需求为');
    assert.ok(
      i.missing.includes('title') || i.missing.includes('description') || i.title == null,
      `should lack title/desc without orDetail: ${s}`,
    );
  }
  const withOr = parseCreateIntent('创建需求 原始需求为: OR-20260629-0001', {
    orDetail: {
      id: '907',
      originalNo: 'OR-20260629-0001',
      title: '关键项目看板：本周有更新的已关闭待办/风险仍应展示',
      userNeedDesc: '对本周有更新的已关闭项一并展示',
      businessPain: '已关闭项被过滤导致信息断层',
    },
  });
  assert.equal(withOr.refine_source, 'original');
  assert.match(withOr.title, /关键项目看板/);
  assert.ok(withOr.description && withOr.description.includes('信息断层'));
  assert.deepEqual(withOr.missing, []);
});

test('正文含「原始需求」字样不得被剥净', () => {
  const r = extractCreateNlRemainder(
    '在 OR-20260701-0001 下新建需求，支持按原始需求拆池内条目',
  );
  assert.match(r, /按原始需求拆池内条目/);
});

test('no OR → needs_original_resolve false', () => {
  const i = parseCreateIntent('创建需求');
  assert.equal(i.needs_original_resolve, false);
  assert.equal(i.original_ref, null);
  assert.ok(i.missing.includes('title'));
  assert.ok(i.missing.includes('description'));
});

test('refine from user input', () => {
  const r = refineFromUserInput(
    '支付回调经常超时。需要在网关侧增加重试与告警，覆盖生产与预发。',
  );
  assert.equal(r.refine_source, 'user');
  assert.ok(r.title && r.title.length <= 40);
  assert.ok(r.description && r.description.includes('重试'));
});

test('refine from original when no user text', () => {
  const r = resolveCreateTitleDescription({
    userText: '',
    orDetail: {
      id: '203',
      originalNo: 'OR-20260721-0001',
      title: '开放 API 关联能力建设',
      businessPain: '<p>手工关联易漏</p>',
      userNeedDesc: '希望创建池内需求时自动挂上原始需求',
      valueDescription: '减少漏挂',
    },
  });
  assert.equal(r.refine_source, 'original');
  assert.ok(r.title);
  assert.ok(r.description && r.description.includes('手工关联'));
  assert.ok(r.description.includes('自动挂上'));
});

test('user text wins over original', () => {
  const r = resolveCreateTitleDescription({
    userText: '专门做列表筛选优化，支持按状态过滤',
    orDetail: {
      title: '原始大标题不应覆盖',
      userNeedDesc: '原始描述',
    },
  });
  assert.equal(r.refine_source, 'user');
  assert.match(r.title, /列表筛选/);
  assert.ok(!r.description.includes('原始描述'));
});

test('parse-create with orDetail fills from original', () => {
  const i = parseCreateIntent(
    '在http://localhost:5173/app/requirements/original/requirement/203下新建需求',
    {
      orDetail: {
        id: '1899408351909954560',
        title: '原始需求样例标题',
        userNeedDesc: '需要支持一键关联',
        businessPain: '现状靠人工',
      },
    },
  );
  assert.equal(i.refine_source, 'original');
  assert.equal(i.title, '原始需求样例标题');
  assert.ok(i.description && i.description.includes('一键关联'));
  assert.deepEqual(i.missing, []);
});

test('refineFromOriginalRequirement strips html', () => {
  const r = refineFromOriginalRequirement({
    title: 'T',
    businessPain: '<div>A<br/>B</div>',
  });
  assert.ok(!/</.test(r.description));
  assert.match(r.description, /A/);
});

console.log('all parse-create-intent tests passed');
