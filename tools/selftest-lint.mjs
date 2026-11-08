#!/usr/bin/env node
/**
 * lint 单元自测：纯函数，不碰文件系统、不连 Obsidian。
 *
 * 这些断言锁住的是「会不会乱报」——
 * 一致性检查最怕的不是漏报，是每天报一堆假的，用户三天后就不看了。
 */
import {
  tableBlocks,
  definedTerms,
  tableFieldWords,
  fieldNameConflicts,
  acCoverage,
  demoFeatures,
  demoCoverage,
  lintDocs,
  suffixOf,
} from './lib/lint.mjs';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? `  ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? `  ${extra}` : ''}`);
  }
};

/* ---------------- 表格解析 ---------------- */
console.log('表格解析：');
{
  const md = ['| 字段名 | 定义 |', '| --- | --- |', '| 变更时间 | 对比基准 |', '| 失效时间 | 30 天 |'].join('\n');
  const blocks = tableBlocks(md);
  ok('切出 1 张表', blocks.length === 1);
  ok('表头 2 列', blocks[0].header.length === 2);
  ok('数据行 2 行', blocks[0].rows.length === 2);
  ok('分隔行被丢掉', !blocks[0].rows.some((r) => r[0].includes('---')));
}
{
  const md = ['说明文字', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '结尾'].join('\n');
  ok('正文里的表也能切出来', tableBlocks(md).length === 1);
}

/* ---------------- 标准字段名 ---------------- */
console.log('\n标准字段名：');
const MASTER = [
  '# 预算重构',
  '',
  '| 字段名 | 定义 | 来源 |',
  '| --- | --- | --- |',
  '| 变更时间 | 新旧对比唯一基准 | 盘古供 |',
  '| 失效时间 | 在池截止日 | 盘古供 |',
  '| 变更型号 | 切换后型号编码 | 盘古供 |',
  '',
  '| 编号 | 可核对结果 |',
  '| --- | --- |',
  '| X-AC01 | 能跑通 |',
].join('\n');
{
  const { strict } = definedTerms(MASTER);
  ok('从定义表抽出 3 个标准字段', strict.size === 3, `[${[...strict].join('、')}]`);
  ok('含「变更时间」', strict.has('变更时间'));
  ok('通用词「编号」不算字段', !strict.has('编号'));
}

/* ---------------- 字段叫法冲突 ---------------- */
console.log('\n字段叫法冲突：');
const MOD_BAD = [
  '| 场景 | 来源 | 处理规则 | 生效时间 |',
  '| --- | --- | --- | --- |',
  '| 导入 | 用户 | 校验 | 同上 |',
].join('\n');
const MOD_OK = [
  '| 场景 | 来源 | 处理规则 | 变更时间 |',
  '| --- | --- | --- | --- |',
  '| 导入 | 用户 | 校验 | 同上 |',
].join('\n');
{
  const { strict } = definedTerms(MASTER);
  const bad = fieldNameConflicts({ standard: strict, docs: [{ name: 'MOD-01', text: MOD_BAD }] });
  ok('抓到「生效时间」不是标准叫法', bad.length === 1 && bad[0].word === '生效时间');
  ok('给出总 PRD 的对应名', bad[0].standard === '变更时间');
  const good = fieldNameConflicts({ standard: strict, docs: [{ name: 'MOD-01', text: MOD_OK }] });
  ok('叫法一致时不报', good.length === 0);
}
{
  // 「变更日期」跟「变更时间」词干一样、后缀同族 —— 这才是最该抓的那种写法漂移
  const near = '| 字段名 | 定义 |\n| --- | --- |\n| 变更日期 | 同上 |';
  const { strict } = definedTerms(MASTER);
  const r = fieldNameConflicts({ standard: strict, docs: [{ name: 'x', text: near }] });
  ok('词干相同后缀不同也能抓到', r.length === 1 && r[0].word === '变更日期', `[${r.map((x) => `${x.word}↔${x.standard}`).join(',')}]`);
  ok('这种按提醒级处理（不拦）', r[0].sameStem === true);
}
{
  const words = tableFieldWords('| 编号 | 可核对结果 |\n| --- | --- |\n| BG-01-AC01 | 能导入 |');
  ok('通用表头「编号」不进字段集合', !words.has('编号'));
  ok('长句子「BG-01-AC01」不进字段集合', !words.has('BG-01-AC01'));
}
ok('后缀识别：变更时间 → 时间', suffixOf('变更时间') === '时间');
ok('后缀识别：预算金额 → 金额', suffixOf('预算金额') === '金额');
ok('后缀识别：普通词无后缀', suffixOf('导入预算') === '');

/* ---------------- 验收覆盖 ---------------- */
console.log('\n验收覆盖：');
{
  const md = [
    '| 场景 | 来源 | 处理规则 | 结果 |',
    '| --- | --- | --- | --- |',
    '| a | x | 1 | ok |',
    '| b | x | 2 | ok |',
    '| c | x | 3 | ok |',
    '| 编号 | 可核对结果 |',
    '| --- | --- |',
    '| BG-01-AC01 | 能导入 |',
  ].join('\n');
  const cov = acCoverage(md);
  ok('数出 3 行规则', cov.ruleRows === 3, `ruleRows=${cov.ruleRows}`);
  ok('数出 1 条验收', cov.acCount === 1, `acCount=${cov.acCount}`);
}
{
  const defOnly = '| 字段名 | 定义 |\n| --- | --- |\n| 变更时间 | x |\n| 失效时间 | y |\n| 变更型号 | z |';
  ok('定义表不算规则表', acCoverage(defOnly).ruleRows === 0);
}

/* ---------------- demo 覆盖 ---------------- */
console.log('\ndemo 覆盖：');
{
  const html = '<div data-feature="BG-01">a</div><div data-feature=\'BG-02\'>b</div>';
  const f = demoFeatures(html);
  ok('抽出 2 个功能点（单双引号都认）', f.size === 2 && f.has('BG-01') && f.has('BG-02'));
}
{
  const r = demoCoverage({ features: new Set(['BG-01', 'BG-09']), ids: ['BG-01', 'BG-02'], hasDemo: true });
  ok('demo 多做的报问题', r.problems.length === 1 && r.problems[0].includes('BG-09'));
  ok('PRD 有 demo 没做的报提醒', r.warns.length === 1 && r.warns[0].includes('BG-02'));
}
{
  const r = demoCoverage({ features: new Set(), ids: ['BG-01'], hasDemo: true });
  ok('没有 data-feature 时只提醒不报错', r.problems.length === 0 && r.warns.length === 1);
}
{
  const r = demoCoverage({ features: new Set(['X']), ids: ['BG-01'], hasDemo: false });
  ok('根本没有 demo 时不出声', r.problems.length === 0 && r.warns.length === 0);
}

/* ---------------- 汇总：干净文档不出声 ---------------- */
console.log('\n汇总：');
{
  const { strict } = definedTerms(MASTER);
  const clean = [
    { name: '总 PRD', text: MASTER, kind: 'master' },
    { name: 'MOD-01', text: MOD_OK, kind: 'module' },
    {
      name: 'BG-01',
      text: [
        '| 场景 | 处理规则 |',
        '| --- | --- |',
        '| a | 1 |',
        '| BG-01-AC01 | 能导入 |',
      ].join('\n'),
      kind: 'sub',
    },
  ];
  const r = lintDocs({ standard: strict, docs: clean, features: new Set(), prdIds: ['BG-01', 'MOD-01'], hasDemo: false });
  ok('干净文档：0 问题', r.problems.length === 0, `[${r.problems.join(' | ')}]`);
  ok('干净文档：0 提醒', r.warns.length === 0, `[${r.warns.join(' | ')}]`);
}
{
  const { strict } = definedTerms(MASTER);
  const r = lintDocs({
    standard: strict,
    docs: [
      { name: '总 PRD', text: MASTER, kind: 'master' },
      { name: 'MOD-01', text: MOD_BAD, kind: 'module' },
    ],
    features: new Set(['BG-01', 'BG-09']),
    prdIds: ['BG-01'],
    hasDemo: true,
  });
  ok('脏文档：抓到字段叫法', r.problems.some((p) => p.includes('生效时间')));
  ok('脏文档：抓到 demo 多做', r.problems.some((p) => p.includes('BG-09')));
  ok('脏文档：总 PRD 不被查验收覆盖', !r.warns.some((w) => w.startsWith('总 PRD')));
}

console.log(`\n${fail ? '✗' : '✓'} lint 自测：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
