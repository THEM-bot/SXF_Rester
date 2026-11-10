#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PACK_ROOT = path.resolve(__dirname, '..');
const STANDARD_LIMIT = 50;
const FORBIDDEN = ['.cursor/skills/', 'efficiency-hub-doc/'];
const errors = [];

function fail(msg) { errors.push(msg); }

const packPath = path.join(PACK_ROOT, 'PACK.md');
if (!fs.existsSync(packPath)) fail('missing PACK.md');
else {
  const raw = fs.readFileSync(packPath, 'utf8');
  if (!/disable-model-invocation:\s*true/.test(raw)) fail('PACK.md: missing disable-model-invocation');
  const body = raw.replace(/^---[\s\S]*?---\r?\n?/, '');
  const lines = body.trimEnd() ? body.trimEnd().split(/\r?\n/).length : 0;
  if (lines > STANDARD_LIMIT) fail(`PACK.md body has ${lines} lines (max ${STANDARD_LIMIT})`);
  if (/legacy-satoken/i.test(body)) fail('PACK.md: must not reference legacy-satoken executable track');
}
if (fs.existsSync(path.join(PACK_ROOT, 'SKILL.md'))) {
  fail('SKILL.md: nested SKILL.md forbidden');
}

for (const rel of [
  'pack.yaml',
  'reference/boot.md',
  'reference/instructions.md',
  'reference/open-api-contract.md',
  'reference/step-completion-gate.md',
  'reference/phases/create-phase.md',
  'reference/ui/progress-display.md',
  'reference/ui/response-templates.md',
  'reference/ui/field-labels.md',
  'reference/error-humanize.md',
  'tools/requirement-api.mjs',
  'scripts/verify-requirement-response.cjs',
  'scripts/lib/error-humanize-rules.cjs',
  'scripts/lib/parse-requirement-doc.cjs',
  'scripts/lib/create-body-from-doc.cjs',
  'scripts/infer-generate-mode.cjs',
  'scripts/fixtures/create-success.json',
  '快速入门.md',
  'README.md',
]) {
  if (!fs.existsSync(path.join(PACK_ROOT, rel))) fail(`missing ${rel}`);
}

const readme = fs.readFileSync(path.join(PACK_ROOT, 'README.md'), 'utf8');
if (!/Agent.*禁止|AGENT.*禁止/i.test(readme)) fail('README.md: missing Agent-forbidden notice');
if (/API 待开放|待开放/.test(readme)) fail('README.md: must not say API 待开放 (use local:ready)');

function listRefFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listRefFiles(full, acc);
    else if (/\.md$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

const agentFiles = [packPath, ...listRefFiles(path.join(PACK_ROOT, 'reference'))];
for (const file of agentFiles) {
  const rel = path.relative(PACK_ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  for (const sub of FORBIDDEN) {
    if (text.includes(sub)) fail(`${rel}: forbidden "${sub}"`);
  }
}

const contractPath = path.join(PACK_ROOT, 'reference/open-api-contract.md');
if (fs.existsSync(contractPath)) {
  const c = fs.readFileSync(contractPath, 'utf8');
  if (!/requirements\/create/.test(c)) fail('open-api-contract: missing R01 path');
  if (!/findPage/.test(c)) fail('open-api-contract: missing R03 path');
  if (!/curl/.test(c)) fail('open-api-contract: missing curl examples');
  if (!/M06/.test(c) || !/\/api\/open\/metadata\/teams/.test(c)) {
    fail('open-api-contract: must document M06 teams metadata');
  }
  if (/status\s*=\s*planned/i.test(c)) fail('open-api-contract: must not be planned-only');
  if (/priority":"HIGH"/.test(c)) fail('open-api-contract: R04 priority must use Chinese 高 not HIGH');
}
const verifyScript = path.join(PACK_ROOT, 'scripts/verify-requirement-response.cjs');
try {
  execFileSync(process.execPath, [verifyScript, '--fixtures'], { stdio: 'pipe', cwd: PACK_ROOT });
} catch (e) {
  fail(`verify-requirement-response --fixtures failed: ${e.message}`);
}

const humanizeRules = path.join(PACK_ROOT, 'scripts/lib/error-humanize-rules.cjs');
if (!fs.existsSync(humanizeRules)) fail('missing scripts/lib/error-humanize-rules.cjs');
const metaFixture = path.join(PACK_ROOT, 'scripts/fixtures/metadata-domains-success.json');
if (fs.existsSync(metaFixture)) {
  try {
    const out = execFileSync(process.execPath, [verifyScript, metaFixture], {
      encoding: 'utf8',
      cwd: PACK_ROOT,
    });
    if (!/OK: metadata/.test(out)) fail('metadata fixture must verify as metadata');
  } catch (e) {
    fail(`metadata fixture verify failed: ${e.message}`);
  }
}
const bootPath = path.join(PACK_ROOT, 'reference/boot.md');
if (fs.existsSync(bootPath)) {
  const boot = fs.readFileSync(bootPath, 'utf8');
  if (/router\/token-store\.md/.test(boot)) fail('boot.md: must not reference router/token-store.md');
  if (/requirement\.json/.test(boot) && !/禁止.*requirement\.json/.test(boot)) {
    fail('boot.md: must forbid requirement.json path (P-221)');
  }
  if (!/m01 --with-project-hints/.test(boot)) fail('boot.md: missing m01 --with-project-hints (P-223)');
}
const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const instr = fs.readFileSync(instrPath, 'utf8');
  if (!/local:ready/.test(instr)) fail('instructions: missing local:ready');
  if (!/requirement-api\.mjs/.test(instr) || !/禁止.*伪造|须调工具/.test(instr)) {
    fail('instructions: missing CLI success gate');
  }
  if (!/T-QUERY-TYPE-ASK/.test(instr)) fail('instructions: missing T-QUERY-TYPE-ASK');
  if (/legacy-satoken/i.test(instr) && !/禁止/.test(instr)) fail('instructions: must not reference legacy-satoken');
  if (/(?:须|必须|应).*读.*routing-rules|读\s*`?router\/routing-rules/.test(instr)) {
    fail('instructions: must not require reading router/routing-rules.md');
  }
  if (!/snowflake|long id|字符串/.test(instr)) fail('instructions: missing long id string rule');
  if (!/临时脚本/.test(instr)) fail('instructions: missing temp script prohibition');
  if (!/T-BATCH-CREATE-DONE/.test(instr)) fail('instructions: missing batch create discipline (P-212)');
  if (!/禁止.*(?:路由|调试).*JSON|禁止向用户展示路由/.test(instr)) {
    fail('instructions: missing forbid routing JSON to user (P-218)');
  }
  if (/首条用户可见回复须含/.test(instr)) {
    fail('instructions: must not require user-visible routing JSON (P-345)');
  }
  if (/T-INTENT-MENU/.test(instr) && !/废止/.test(instr)) {
    fail('instructions: stale T-INTENT-MENU (use T-FIRST-SCREEN)');
  }
  if (!/沿用 自创/.test(instr)) fail('instructions: missing 沿用 自创 command parsing (P-214)');
  if (!/operation 解析|P-220/.test(instr)) fail('instructions: missing operation routing card discipline (P-220)');
  if (/requirement\.json/.test(instr) && !/禁止.*requirement\.json/.test(instr)) {
    fail('instructions: must forbid requirement.json session path (P-221)');
  }
  if (!/parse-doc/.test(instr)) fail('instructions: missing parse-doc tool (P-225/P-226)');
}

const humanizeMd = path.join(PACK_ROOT, 'reference/error-humanize.md');
if (fs.existsSync(humanizeMd) && fs.existsSync(humanizeRules)) {
  const md = fs.readFileSync(humanizeMd, 'utf8');
  const { HUMANIZE } = require(humanizeRules);
  if (!/机检真源/.test(md)) fail('error-humanize.md: missing 机检真源 pointer');
  if (HUMANIZE.length < 14) fail('error-humanize-rules: expected >= 14 mappings');
  for (const { text } of HUMANIZE) {
    const key = text.slice(0, 12);
    if (!md.includes(key)) fail(`error-humanize.md out of sync (missing: ${key}…)`);
  }
}

const tplPath = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPath)) {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  if (!/T-CANCEL-DONE/.test(tpl)) {
    fail('response-templates: missing T-CANCEL-DONE');
  }
  if (!/T-DETAIL-THEN-ACT/.test(tpl)) {
    fail('response-templates: missing T-DETAIL-THEN-ACT');
  }
  if (!/T-META-PICK-PAGE/.test(tpl)) {
    fail('response-templates: missing T-META-PICK-PAGE');
  }
  if (/requirementNo:\s*\{/.test(tpl)) {
    fail('response-templates: T-DETAIL-DONE must use Chinese field labels (Q23)');
  }
  if (!/需求编号：/.test(tpl)) fail('response-templates: T-DETAIL-DONE must include 需求编号 (Q23)');
  if (/id=\{id\}/.test(tpl)) fail('response-templates: T-META-PICK must not show id= to user (P-175)');
  if (!/fieldLabel/.test(tpl)) fail('response-templates: T-BLACKLIST-FIELD must use fieldLabel (P-174)');
  if (!/T-LIST-FILTER-ASK/.test(tpl)) {
    fail('response-templates: missing T-LIST-FILTER-ASK');
  }
  if (!/请回复序号[\s\S]*T-LIST-FILTER-ASK|T-LIST-FILTER-ASK[\s\S]*请回复序号/.test(tpl)) {
    fail('response-templates: T-LIST-FILTER-ASK must include 请回复序号');
  }
  const numberedAskTemplates = [
    'T-REQ-ID-ASK',
    'T-UPDATE-FIELD-ASK',
    'T-LIST-EMPTY-RETRY-ASK',
    'T-PRIORITY-PICK',
    'T-REQUIREMENT-CATEGORY-PICK',
    'T-ABSOLUTE-PRIORITY-ASK',
    'T-UPDATE-CONTINUE-ASK',
    'T-CREATE-TITLE-ASK',
    'T-CREATE-DESC-ASK',
  ];
  for (const name of numberedAskTemplates) {
    if (!tpl.includes(name)) fail(`response-templates: missing ${name} (P-184～P-190)`);
  }
  if (!/T-LIST-EMPTY-RETRY-ASK[\s\S]*请回复序号/.test(tpl)) {
    fail('response-templates: T-LIST-EMPTY-RETRY-ASK must include 请回复序号');
  }
  if (!/T-UPDATE-FIELD-ASK[\s\S]*请回复序号/.test(tpl)) {
    fail('response-templates: T-UPDATE-FIELD-ASK must include 请回复序号');
  }
  if (!/T-PRIORITY-PICK[\s\S]*请回复序号/.test(tpl)) {
    fail('response-templates: T-PRIORITY-PICK must include 请回复序号');
  }
  if (!/T-REQUIREMENT-CATEGORY-PICK[\s\S]*L1 - AI 辅助需求/.test(tpl)) {
    fail('response-templates: T-REQUIREMENT-CATEGORY-PICK must use Web labels (P-194)');
  }
  if (!/T-UPDATE-FIELD-ASK[\s\S]*7\. 需求分类/.test(tpl)) {
    fail('response-templates: T-UPDATE-FIELD-ASK must split 需求分类 (P-196)');
  }
  if (!/T-UPDATE-CONTINUE-ASK[\s\S]*请回复序号/.test(tpl)) {
    fail('response-templates: T-UPDATE-CONTINUE-ASK must include 请回复序号 (P-198)');
  }
  if (!/T-DOC-FOLDER-ACK/.test(tpl)) fail('response-templates: missing T-DOC-FOLDER-ACK (P-209)');
  if (!/T-OP-TYPE-ASK[\s\S]*P-220/.test(tpl)) fail('response-templates: T-OP-TYPE-ASK must include operation mapping (P-220)');
  if (!/T-CREATE-DONE[\s\S]*以 API 返回为准/.test(tpl)) {
    fail('response-templates: T-CREATE-DONE must note doc vs API numbering (P-210)');
  }
  if (!/T-CREATE-DONE[\s\S]*需求标题[\s\S]*需求分类[\s\S]*优先级/.test(tpl)) {
    fail('response-templates: T-CREATE-DONE must align with batch columns (P-228)');
  }
  if (!/T-DOC-CONTENT-CONFIRM/.test(tpl)) fail('response-templates: missing T-DOC-CONTENT-CONFIRM (P-213)');
  if (/T-DOC-CONTENT-CONFIRM[\s\S]*?## /m.test(tpl)) {
    const docConfirm = tpl.match(/## T-DOC-CONTENT-CONFIRM([\s\S]*?)(?=\n## )/);
    const section = docConfirm?.[1] || '';
    if (/摘要（仅展示前 200 字）|完整（展示全文后确认）|描述展示方式/.test(section)) {
      fail('response-templates: T-DOC-CONTENT-CONFIRM must not ask 摘要/完整 (P-213)');
    }
    if (!/完整上传|此处不预览/.test(section)) {
      fail('response-templates: T-DOC-CONTENT-CONFIRM must state full upload without body preview (P-213)');
    }
    if (!/确认，继续选归属/.test(section)) {
      fail('response-templates: T-DOC-CONTENT-CONFIRM must offer 确认，继续选归属');
    }
  }
  if (!/T-DOC-CONTENT-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(tpl)) {
    fail('response-templates: T-DOC-CONTENT-CONFIRM must use project/content table');
  }
  if (!/## T-CREATE-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(tpl)) {
    fail('response-templates: missing T-CREATE-CONFIRM table (align task)');
  }
  if (!/## T-CREATE-CONFIRM[\s\S]*故事点/.test(tpl)) {
    fail('response-templates: T-CREATE-CONFIRM must show 故事点 (SC-260802-005)');
  }
  if (!/## T-CREATE-CONFIRM[\s\S]*来源/.test(tpl)) {
    fail('response-templates: T-CREATE-CONFIRM must show 来源 marks (SC-260802-005)');
  }
  if (!/yml.*会话.*手选.*故事卡|故事卡.*手选/.test(tpl) && !/来源枚举[\s\S]*yml/.test(tpl)) {
    fail('response-templates: must document source enum yml/会话/手选/故事卡');
  }
  // 描述必填：T-CREATE-DESC-ASK 禁止提供「跳过」
  {
    const descAsk = tpl.match(/## T-CREATE-DESC-ASK([\s\S]*?)(?=\n## )/);
    if (!descAsk) fail('response-templates: missing T-CREATE-DESC-ASK section');
    else if (/跳过/.test(descAsk[1]) && !/禁止.*跳过|不可跳过/.test(descAsk[1])) {
      fail('response-templates: T-CREATE-DESC-ASK must not offer 跳过 (description required)');
    }
    if (!/必填|不可跳过/.test(descAsk?.[1] || '')) {
      fail('response-templates: T-CREATE-DESC-ASK must state description is required');
    }
  }
  if (!fs.existsSync(path.join(PACK_ROOT, 'tools/lib/refine-requirement-content.mjs'))) {
    fail('missing tools/lib/refine-requirement-content.mjs');
  }
  const createDefaults = fs.readFileSync(path.join(PACK_ROOT, 'reference/create-defaults.md'), 'utf8');
  if (!/url_web|original\/requirement/.test(createDefaults)) {
    fail('create-defaults: must document Web original requirement URL');
  }
  if (!/refine-create|refine_source/.test(createDefaults)) {
    fail('create-defaults: must document refine-create / refine_source');
  }
  if (!/P-241/.test(createDefaults) || !/描述 HTML|转 HTML/.test(createDefaults)) {
    fail('create-defaults: must document description HTML (P-241)');
  }
  if (!/T-CREATE-DONE[\s\S]*详情链接/.test(tpl)) {
    fail('response-templates: T-CREATE-DONE must include 详情链接');
  }
  if (!/T-BATCH-CREATE-DONE[\s\S]*详情链接/.test(tpl)) {
    fail('response-templates: T-BATCH-CREATE-DONE must include 详情链接');
  }
  if (!/T-BATCH-DOC-CREATE-ACK/.test(tpl)) fail('response-templates: missing T-BATCH-DOC-CREATE-ACK (P-212)');
  if (!/T-BATCH-CREATE-DONE/.test(tpl)) fail('response-templates: missing T-BATCH-CREATE-DONE (P-215)');
  if (!/沿用 自创/.test(tpl)) fail('response-templates: missing 沿用 自创 command (P-214)');
  if (!/口令表/.test(tpl)) fail('response-templates: missing 口令表 (P-214/P-216)');
  if (!/T-CANCEL-CONFIRM[\s\S]*请回复序号（如 `1`）/.test(tpl)) {
    fail('response-templates: T-CANCEL-CONFIRM must include 请回复序号 example (P-189)');
  }
  const phaseTemplateGates = [
    { phase: 'reference/phases/detail-phase.md', templates: ['T-REQ-ID-ASK'] },
    { phase: 'reference/phases/update-phase.md', templates: ['T-REQ-ID-ASK', 'T-UPDATE-FIELD-ASK', 'T-PRIORITY-PICK', 'T-REQUIREMENT-CATEGORY-PICK', 'T-UPDATE-CONTINUE-ASK'] },
    { phase: 'reference/phases/cancel-phase.md', templates: ['T-REQ-ID-ASK'] },
    { phase: 'reference/phases/list-phase.md', templates: ['T-LIST-EMPTY-RETRY-ASK'] },
    { phase: 'reference/phases/create-phase.md', templates: ['T-CREATE-TITLE-ASK', 'T-CREATE-DESC-ASK', 'T-PRIORITY-PICK', 'T-DOC-FOLDER-ACK', 'T-DOC-CONTENT-CONFIRM', 'T-CREATE-CONFIRM', 'T-BATCH-DOC-CREATE-ACK', 'T-BATCH-CREATE-DONE'] },
  ];
  for (const { phase, templates } of phaseTemplateGates) {
    const phasePath = path.join(PACK_ROOT, phase);
    if (!fs.existsSync(phasePath)) {
      fail(`missing ${phase}`);
      continue;
    }
    const phaseText = fs.readFileSync(phasePath, 'utf8');
    for (const t of templates) {
      if (!phaseText.includes(t)) fail(`${phase}: must reference ${t} (P-191)`);
    }
  }
  if (!/史诗EPIC/.test(tpl)) fail('response-templates: M09 must use Web level labels (P-199)');
}

const apiPath = path.join(PACK_ROOT, 'tools/requirement-api.mjs');
if (fs.existsSync(apiPath) && !/--out/.test(fs.readFileSync(apiPath, 'utf8'))) {
  fail('requirement-api.mjs: missing --out (P-170)');
}

const instrPath2 = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath2) && !/--out/.test(fs.readFileSync(instrPath2, 'utf8'))) {
  fail('instructions: missing --out discipline (P-169/P-170)');
}

const fieldLabelsPath = path.join(PACK_ROOT, 'reference/ui/field-labels.md');
const displayHumanize = path.join(PACK_ROOT, 'scripts/lib/display-humanize.cjs');
if (fs.existsSync(fieldLabelsPath) && fs.existsSync(displayHumanize)) {
  const fl = fs.readFileSync(fieldLabelsPath, 'utf8');
  const { FIELD_LABELS, formatDetailText, formatUpdateFieldSummary } = require(displayHumanize);
  if (!/机检真源/.test(fl)) fail('field-labels.md: missing 机检真源 pointer');
  if (!/禁止.*英文字段名/.test(fl)) fail('field-labels.md: missing forbid English field names (Q23)');
  for (const label of ['需求编号', '需求标题', '状态', '需求层级', '需求分类']) {
    if (!fl.includes(label)) fail(`field-labels.md: missing label ${label}`);
  }
  const sample = formatDetailText({
    requirementNo: 'REQ-1',
    title: 't',
    status: '草稿',
    requirementLevel: 'Story',
    requirementType: 'L2',
    priority: '中',
  });
  if (/requirementNo:|title:|：Story\b|：Epic\b|：Feature\b/.test(sample)) {
    fail('display-humanize: detail output must not contain English field names or bare level codes');
  }
  if (!/故事Story/.test(sample)) fail('display-humanize: Story must map to 故事Story (P-199)');
  if (!/L2 - 简单改动需求/.test(sample)) fail('display-humanize: L2 must use Web category label (P-194)');
  const upd = formatUpdateFieldSummary({ title: 'x', priority: '高', requirementType: 'L2' });
  if (/title|priority|L2[^ ]/.test(upd) && !/L2 -/.test(upd)) {
    fail('display-humanize: update summary must use Chinese labels (P-173)');
  }
  if (!/需求标题/.test(upd) || !/优先级/.test(upd) || !/需求分类/.test(upd)) {
    fail('display-humanize: update summary missing Chinese labels');
  }
  const cancelled = require(displayHumanize).humanizeFieldValue('status', 'CANCELLED');
  if (cancelled !== '作废') fail('display-humanize: CANCELLED must map to 作废 (P-200)');
  const createTxt = require(displayHumanize).formatCreateText(
    { requirementNo: 'REQ-1', requirementId: '1' },
    { title: 't1', priority: '高', requirementType: 'L2' },
  );
  if (!/以 API 返回为准/.test(createTxt)) fail('formatCreateText: missing P-210 footnote');
  if (!/需求标题[\s\S]*需求分类[\s\S]*优先级/.test(createTxt)) {
    fail('formatCreateText: must include batch-aligned columns (P-228)');
  }
  if (!/L2 - 简单改动需求/.test(createTxt)) fail('formatCreateText: category must use Web label (P-228)');
  const { formatBatchCreateText } = require(displayHumanize);
  if (typeof formatBatchCreateText !== 'function') {
    fail('display-humanize: missing formatBatchCreateText (P-215)');
  } else {
    const batchTxt = formatBatchCreateText([
      { title: 't1', requirementType: 'L2', priority: '高', requirementNo: 'REQ-1', requirementId: '1' },
      { title: 't2', priority: '中', error: '400 xxx' },
    ]);
    if (!/批量创建完成，共 2 条/.test(batchTxt)) fail('formatBatchCreateText: missing batch header (P-215)');
    if (!/L2 - 简单改动需求/.test(batchTxt)) fail('formatBatchCreateText: category must use Web label (P-215)');
    if (!/创建失败/.test(batchTxt)) fail('formatBatchCreateText: must mark failed rows (P-215)');
    if (!/以 API 返回为准/.test(batchTxt)) fail('formatBatchCreateText: missing P-210 footnote');
  }
}
const apiPath2 = path.join(PACK_ROOT, 'tools/requirement-api.mjs');
if (fs.existsSync(apiPath2)) {
  const apiSrc = fs.readFileSync(apiPath2, 'utf8');
  if (!/resolveOutPath/.test(apiSrc)) fail('requirement-api.mjs: missing resolveOutPath (P-206)');
  if (!/priority: body\.priority/.test(apiSrc)) fail('requirement-api.mjs: session must save priority (P-207)');
  if (!/with-project-hints|withProjectHints/.test(apiSrc)) {
    fail('requirement-api.mjs: missing m01 --with-project-hints (P-223)');
  }
  if (!/parse-doc/.test(apiSrc)) fail('requirement-api.mjs: missing parse-doc (P-225/P-226)');
  if (!/scan-iter/.test(apiSrc)) fail('requirement-api.mjs: missing scan-iter (P-230)');
  if (!/batch-create/.test(apiSrc)) fail('requirement-api.mjs: missing batch-create (P-232)');
  if (!/resolve-doc-path/.test(apiSrc)) fail('requirement-api.mjs: missing resolve-doc-path (P-229)');
  if (!/resolve-upload-defaults/.test(apiSrc)) {
    fail('requirement-api.mjs: missing resolve-upload-defaults (SC-260802-005)');
  }
  if (!/write-json-body/.test(apiSrc)) {
    fail('requirement-api.mjs: missing write-json-body (P-239)');
  }
  if (!/write-json-body\.mjs|lib\/write-json-body/.test(apiSrc)) {
    fail('requirement-api.mjs: must import write-json-body lib (P-239)');
  }
  if (!/applyDescriptionHtml/.test(apiSrc)) {
    fail('requirement-api.mjs: missing applyDescriptionHtml (P-241)');
  }
  if (!/normalizeCreateBody[\s\S]*applyDescriptionHtml/.test(apiSrc)) {
    fail('requirement-api.mjs: normalizeCreateBody must apply description HTML (P-241)');
  }
  if (!/generate-modes/.test(apiSrc)) {
    fail('requirement-api.mjs: missing generate-modes (SC-260827-001 · 对齐 m01 拉列表)');
  }
  if (!/create-from-doc/.test(apiSrc)) fail('requirement-api.mjs: missing create-from-doc');
  if (!/enforceSkillGenerateMode/.test(apiSrc)) {
    fail('requirement-api.mjs: missing enforceSkillGenerateMode');
  }
}

const descHtmlLib = path.join(PACK_ROOT, 'scripts/lib/description-to-html.cjs');
if (!fs.existsSync(descHtmlLib)) {
  fail('missing scripts/lib/description-to-html.cjs (P-241)');
} else {
  const src = fs.readFileSync(descHtmlLib, 'utf8');
  if (!/normalizeDescriptionHtml/.test(src)) fail('description-to-html: missing normalizeDescriptionHtml');
  if (!/neutralizeHtmlRiskLiterals/.test(src)) fail('description-to-html: missing P-240 neutralize');
  if (!/markdownOrPlainToHtml|looksLikeHtml/.test(src)) {
    fail('description-to-html: missing markdown/plain → HTML path');
  }
  try {
    execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-description-to-html.mjs')], {
      stdio: 'pipe',
      cwd: PACK_ROOT,
    });
  } catch (e) {
    fail(`test-description-to-html failed: ${e.message}`);
  }
}

const writeJsonBodyLib = path.join(PACK_ROOT, 'tools/lib/write-json-body.mjs');
if (!fs.existsSync(writeJsonBodyLib)) {
  fail('missing tools/lib/write-json-body.mjs (P-239)');
}

const bootMd = path.join(PACK_ROOT, 'reference/boot.md');
if (fs.existsSync(bootMd)) {
  const boot = fs.readFileSync(bootMd, 'utf8');
  if (!/P-239/.test(boot) || !/write-json-body/.test(boot)) {
    fail('boot.md: must document write-json-body / P-239');
  }
  if (!/P-241/.test(boot) || !/description-to-html|转 HTML/.test(boot)) {
    fail('boot.md: must document description HTML (P-241)');
  }
  if (/node -e/.test(boot) && !/禁止[\s\S]{0,40}node -e/.test(boot)) {
    fail('boot.md: node -e must appear only as banned pattern (P-239)');
  }
}

const gateMd = path.join(PACK_ROOT, 'reference/step-completion-gate.md');
if (fs.existsSync(gateMd)) {
  const gate = fs.readFileSync(gateMd, 'utf8');
  if (!/P-239/.test(gate) || !/write-json-body/.test(gate)) {
    fail('step-completion-gate.md: missing P-239 checklist');
  }
  if (!/P-241|规范化后为 HTML/.test(gate)) {
    fail('step-completion-gate.md: missing description HTML checklist (P-241)');
  }
  if (!/node -e/.test(gate)) {
    fail('step-completion-gate.md: must ban node -e explicitly');
  }
}

const openApiMd = path.join(PACK_ROOT, 'reference/open-api-contract.md');
if (fs.existsSync(openApiMd)) {
  const contract = fs.readFileSync(openApiMd, 'utf8');
  if (/也可直接走 stdin/.test(contract)) {
    fail('open-api-contract.md: must not recommend stdin as default Windows path (P-239)');
  }
  if (!/write-json-body/.test(contract)) {
    fail('open-api-contract.md: missing write-json-body example (P-239)');
  }
  if (!/P-241/.test(contract) || !/HTML/.test(contract)) {
    fail('open-api-contract.md: missing description HTML note (P-241)');
  }
}

const uploadDefaultsLib = path.join(PACK_ROOT, 'scripts/lib/parse-upload-defaults.cjs');
if (!fs.existsSync(uploadDefaultsLib)) {
  fail('missing scripts/lib/parse-upload-defaults.cjs (SC-260802-005)');
} else {
  const {
    parseRequirementUploadDefaultsFromText,
    matchUniqueByName,
    resolveNamesToIds,
  } = require(uploadDefaultsLib);
  const sample = `
product_name: x
requirement_upload_defaults:
  business_domain_name: "域A"
  feature_team_name: '组B'
  app_service_name: 服务C
repos:
  - name: z
`;
  const ud = parseRequirementUploadDefaultsFromText(sample);
  if (!ud.found || !ud.effective || ud.defaults.business_domain_name !== '域A') {
    fail('parse-upload-defaults: must parse requirement_upload_defaults');
  }
  const uniq = matchUniqueByName([{ id: '1', name: '域A' }, { id: '2', name: '域B' }], '域A');
  if (uniq.status !== 'unique') fail('parse-upload-defaults: exact unique match failed');
  const amb = matchUniqueByName([{ id: '1', name: '研效' }, { id: '2', name: '研效通' }], '研');
  if (amb.status !== 'ambiguous') fail('parse-upload-defaults: fuzzy ambiguous must not pick');
  const teamPath = resolveNamesToIds(
    { feature_team_name: '组B' },
    { teams: [{ id: '9', name: '组B' }], projects: [{ id: '8', name: '项目X' }] },
  );
  if (teamPath.resolved.teamId !== '9' || teamPath.resolved.featureTeamResolvePath !== 'team') {
    fail('parse-upload-defaults: feature_team_name must prefer M06 teamId');
  }
  const projectPath = resolveNamesToIds(
    { feature_team_name: '项目X' },
    { teams: [{ id: '9', name: '组B' }], projects: [{ id: '8', name: '项目X' }] },
  );
  if (
    projectPath.resolved.projectId !== '8' ||
    projectPath.resolved.featureTeamResolvePath !== 'project'
  ) {
    fail('parse-upload-defaults: feature_team_name must fall back to M02 projectId');
  }
}

if (!fs.existsSync(path.join(PACK_ROOT, 'reference/upload-defaults.md'))) {
  fail('missing reference/upload-defaults.md (SC-260802-005)');
}

const batchCreateLib = path.join(PACK_ROOT, 'tools/lib/batch-create.mjs');
if (fs.existsSync(batchCreateLib)) {
  const batchSrc = fs.readFileSync(batchCreateLib, 'utf8');
  if (!/storyPoint|buildCreateBodyFromParsed/.test(batchSrc)) {
    fail('batch-create.mjs: must pass parsed storyPoint to R01 (SC-260802-005)');
  }
  if (!/generateModeName|buildCreateBodyFromParsed/.test(batchSrc)) {
    fail('batch-create.mjs: must pass generateModeName');
  }
  if (!/generate-mode-pending|generateModeBlocked/.test(batchSrc)) {
    fail('batch-create.mjs: must gate generate mode (D1/D4)');
  }
}

const createFromDocLib = path.join(PACK_ROOT, 'scripts/lib/create-body-from-doc.cjs');
if (!fs.existsSync(createFromDocLib)) {
  fail('missing scripts/lib/create-body-from-doc.cjs (SC-260827-001)');
} else {
  const { buildCreateBodyFromParsed } = require(createFromDocLib);
  try {
    buildCreateBodyFromParsed(
      {
        title: 't',
        description: 'd',
        generateModeStatus: 'missing',
        warnings: [{ type: 'generate-mode-missing', blocked: true }],
      },
      { businessDomainId: '1', projectId: '2', appServiceId: '3', requirementLevel: 'Story' },
    );
    fail('create-body-from-doc: missing mode must throw');
  } catch (e) {
    if (!/生成模式|AI-Coding/.test(e.message)) fail('create-body-from-doc: unexpected error ' + e.message);
  }
  const okBody = buildCreateBodyFromParsed(
    {
      title: 't',
      description: 'd',
      implementationType: 'AI_CODING',
      generateModeName: '修改需求',
      generateModeStatus: 'hit',
      storyPoint: 5,
      warnings: [],
    },
    { businessDomainId: '1', projectId: '2', appServiceId: '3', requirementLevel: 'Story' },
  );
  if (okBody.generateModeName !== '修改需求') fail('create-body-from-doc: must set generateModeName');
  if (okBody.storyPoint !== 5) fail('create-body-from-doc: must pass storyPoint from parsed');
}

const inferPath = path.join(PACK_ROOT, 'scripts/infer-generate-mode.cjs');
if (fs.existsSync(inferPath)) {
  const { infer } = require(inferPath);
  const r = infer('新建一个新模块：运维看板', ['S1：新增/大 需求', '改动需求/小需求', '缺陷']);
  if (r.generateModeName !== 'S1：新增/大 需求') {
    fail('infer-generate-mode: 新模块 should map to S1：新增/大 需求');
  }
}

const parseDocLib = path.join(PACK_ROOT, 'scripts/lib/parse-requirement-doc.cjs');
if (fs.existsSync(parseDocLib)) {
  const {
    parsePriorityFromDoc,
    resolveDocPath,
    parseStoryPointFromDoc,
    parseWarningsFromDoc,
    parseGenerateModeFromDoc,
    parseImplementationTypeFromDoc,
  } = require(parseDocLib);
  const conflictText = '**优先级**: 高\n| 优先级 | P1 |\n';
  const pr = parsePriorityFromDoc(conflictText);
  if (pr.priority !== '高') fail('parse-requirement-doc: header priority must win over table (P-225)');
  if (!pr.priorityConflict) fail('parse-requirement-doc: must detect priority conflict (P-225)');
  const sp = parseStoryPointFromDoc('| 故事点 | 8 SP |\n');
  if (sp.storyPoint !== 8 || sp.missing) {
    fail('parse-requirement-doc: must parse 故事点 N SP (SC-260802-005)');
  }
  const spDec = parseStoryPointFromDoc('| 故事点 | 8.5 SP |\n');
  if (spDec.storyPoint !== 9 || !spDec.storyPointCeiled || spDec.missing) {
    fail('parse-requirement-doc: decimal story points must ceil (8.5 → 9)');
  }
  const spMiss = parseStoryPointFromDoc('| 优先级 | P1 |\n');
  if (!spMiss.missing) fail('parse-requirement-doc: missing story point must set missing');
  const ceilWarn = parseWarningsFromDoc('', {
    storyPointCeiledInfo: { rawNumber: 8.5, storyPoint: 9, raw: '8.5 SP' },
  });
  if (!ceilWarn.some((w) => w.type === 'story-point-ceiled')) {
    fail('parse-requirement-doc: must emit story-point-ceiled warning');
  }
  const { scanIterationDirectory } = require(parseDocLib);
  const warn = parseWarningsFromDoc('**状态**: 作废\n', { priorityConflict: false });
  if (!warn.some((w) => w.type === 'status-cancelled')) {
    fail('parse-requirement-doc: must emit status-cancelled warning (P-235)');
  }
  const gmHit = parseGenerateModeFromDoc('| AI-Coding生成模式 | S2：改动/小需求 |\n');
  if (gmHit.generateModeStatus !== 'hit' || gmHit.generateModeName !== 'S2：改动/小需求') {
    fail('parse-requirement-doc: must parse AI-Coding生成模式 hit');
  }
  const gmStoryCard = parseGenerateModeFromDoc('- 实现方式：AI-Coding\n- 生成模式：S2：改动/小需求\n');
  if (gmStoryCard.generateModeStatus !== 'hit' || gmStoryCard.generateModeName !== 'S2：改动/小需求') {
    fail('parse-requirement-doc: must parse 故事卡列表 生成模式');
  }
  const implStory = parseImplementationTypeFromDoc('- 实现方式：AI-Coding\n');
  if (implStory !== 'AI_CODING') fail('parse-requirement-doc: must map 故事卡 实现方式');
  const gmPending = parseGenerateModeFromDoc('| AI-Coding生成模式 | [待确认] |\n');
  if (gmPending.generateModeStatus !== 'pending') {
    fail('parse-requirement-doc: must parse [待确认] as pending');
  }
  const gmMissing = parseGenerateModeFromDoc('# title only\n');
  if (gmMissing.generateModeStatus !== 'missing') {
    fail('parse-requirement-doc: missing mode must be missing');
  }
  const implTrad = parseImplementationTypeFromDoc('| 实现方式 | 传统开发 |\n');
  if (implTrad !== 'TRADITIONAL') fail('parse-requirement-doc: must map 传统开发');
  const modeWarn = parseWarningsFromDoc('', {
    priorityConflict: false,
    generateModeStatus: 'pending',
    implementationType: 'AI_CODING',
  });
  if (!modeWarn.some((w) => w.type === 'generate-mode-pending' && w.blocked)) {
    fail('parse-requirement-doc: pending mode must emit blocked warning');
  }
  const createPhase = fs.readFileSync(path.join(PACK_ROOT, 'reference/phases/create-phase.md'), 'utf8');
  if (!/parse-doc/.test(createPhase)) fail('create-phase: missing parse-doc reference (P-226)');
  if (!/scan-iter/.test(createPhase)) fail('create-phase: missing scan-iter (P-230)');
  if (!/batch-create/.test(createPhase)) fail('create-phase: missing batch-create (P-232)');
  if (!/P-233/.test(createPhase)) fail('create-phase: missing P-233 reuse+batch skip ACK');
  if (!/P-236|priority-conflict/.test(createPhase)) fail('create-phase: missing P-236 conflict gate');
  if (!/P-222|整批静默/.test(createPhase)) fail('create-phase: missing P-222 batch script ban');
  if (!/P-224|提交前复述环境/.test(createPhase)) fail('create-phase: missing P-224 batch env recap');
  if (!/resolve-upload-defaults|requirement_upload_defaults|故事点/.test(createPhase)) {
    fail('create-phase: missing upload defaults / 故事点 (SC-260802-005)');
  }
  if (!/禁止.*T-SESSION-REUSE-ASK|yml.*会话.*点选|静默带入会话/.test(createPhase)) {
    fail('create-phase: must prefer yml→session silent→pick without T-SESSION-REUSE-ASK');
  }
  if (!/generateModeName|AI-Coding生成模式/.test(createPhase)) {
    fail('create-phase: missing AI-Coding generate mode gate (SC-260827-001)');
  }
  if (!/force-conflicts.*生成模式|生成模式.*force-conflicts/.test(createPhase)) {
    fail('create-phase: must ban force-conflicts bypass for generate mode');
  }
  const uploadDefaultsMd = fs.readFileSync(path.join(PACK_ROOT, 'reference/upload-defaults.md'), 'utf8');
  if (!/归属预填优先级/.test(uploadDefaultsMd) || !/yml.*会话.*手选|yml.*会话.*点选/.test(uploadDefaultsMd)) {
    fail('upload-defaults.md: must document 归属预填优先级 yml→会话→点选');
  }
}

const tplConfirmGm = fs.readFileSync(path.join(PACK_ROOT, 'reference/ui/response-templates.md'), 'utf8');
if (!/AI-Coding 生成模式|AI-Coding生成模式/.test(tplConfirmGm)) {
  fail('response-templates: T-DOC-CONTENT-CONFIRM must show generate mode (SC-260827-001)');
}
if (!/模式来源/.test(tplConfirmGm)) {
  fail('response-templates: must show generate mode source');
}

const contractMdGm = fs.readFileSync(path.join(PACK_ROOT, 'reference/open-api-contract.md'), 'utf8');
if (!/generateModeName/.test(contractMdGm)) {
  fail('open-api-contract: missing generateModeName (SC-260827-001)');
}
if (!/generate-modes/.test(contractMdGm)) {
  fail('open-api-contract: missing generate-modes CLI (SC-260827-001)');
}

const humanizeMd2 = path.join(PACK_ROOT, 'reference/error-humanize.md');
if (fs.existsSync(humanizeMd2) && /Epic、Feature 或 Story/.test(fs.readFileSync(humanizeMd2, 'utf8'))) {
  fail('error-humanize.md: must not use bare Epic、Feature 或 Story in user text (P-177)');
}
const detailFixture = path.join(PACK_ROOT, 'scripts/fixtures/detail-success.json');
if (fs.existsSync(detailFixture)) {
  const df = JSON.parse(fs.readFileSync(detailFixture, 'utf8'));
  if (df?.data?.status === 'DRAFT') {
    fail('detail-success.json: status must use Chinese 草稿 (P-204)');
  }
}

const contractStringPath = path.join(PACK_ROOT, 'reference/open-api-contract.md');
if (fs.existsSync(contractStringPath)) {
  const contract = fs.readFileSync(contractStringPath, 'utf8');
  if (!/snowflake/.test(contract) || !/businessDomainId.*string/.test(contract)) {
    fail('open-api-contract: missing snowflake id string contract');
  }
}

const progressPath = path.join(PACK_ROOT, 'reference/ui/progress-display.md');
if (fs.existsSync(progressPath)) {
  const progress = fs.readFileSync(progressPath, 'utf8');
  if (/拉 M09\/M03/.test(progress)) fail('progress-display: stale combined M09/M03 step');
  if (!/拉 M09/.test(progress) || !/拉 M03/.test(progress)) {
    fail('progress-display: missing split M09/M03 steps');
  }
  if (!/P-172|重试不豁免/.test(progress)) fail('progress-display: missing P-172 retry rule');
  if (!/P-222|禁止整批静默脚本/.test(progress)) fail('progress-display: missing P-222 batch script ban');
  if (!/batch-create/.test(progress)) fail('progress-display: missing batch-create CLI (P-232/P-234)');
}

if (errors.length) {
  console.error('self-check FAILED (yanxiaotong-requirement):');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('self-check OK: yanxiaotong-requirement');
