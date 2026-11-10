#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PACK_ROOT = path.resolve(__dirname, '..');
const STANDARD_LIMIT = 50;
const FORBIDDEN = ['.cursor/skills/', 'efficiency-hub-doc/'];
const errors = [];

function fail(msg) {
  errors.push(msg);
}

const packPath = path.join(PACK_ROOT, 'PACK.md');
if (!fs.existsSync(packPath)) fail('missing PACK.md');
else {
  const raw = fs.readFileSync(packPath, 'utf8');
  if (!/disable-model-invocation:\s*true/.test(raw)) fail('PACK.md: missing disable-model-invocation');
  const body = raw.replace(/^---[\s\S]*?---\r?\n?/, '');
  const lines = body.trimEnd() ? body.trimEnd().split(/\r?\n/).length : 0;
  if (lines > STANDARD_LIMIT) fail(`PACK.md body has ${lines} lines (max ${STANDARD_LIMIT})`);
}

if (fs.existsSync(path.join(PACK_ROOT, 'SKILL.md'))) fail('SKILL.md: nested forbidden');

for (const rel of [
  'pack.yaml',
  'reference/boot.md',
  'reference/instructions.md',
  'reference/open-api-contract.md',
  'reference/step-completion-gate.md',
  'reference/create-defaults.md',
  'reference/phases/create-phase.md',
  'reference/phases/detail-phase.md',
  'reference/phases/list-phase.md',
  'reference/phases/append-progress-phase.md',
  'reference/phases/update-phase.md',
  'reference/ui/progress-display.md',
  'reference/ui/response-templates.md',
  'reference/ui/field-labels.md',
  'reference/error-humanize.md',
  'tools/org-todo-api.mjs',
  'scripts/verify-org-todo-response.cjs',
  'scripts/lib/error-humanize-rules.cjs',
  'scripts/lib/display-humanize.cjs',
  'scripts/fixtures/create-success.json',
  '快速入门.md',
  'README.md',
]) {
  if (!fs.existsSync(path.join(PACK_ROOT, rel))) fail(`missing ${rel}`);
}

const readme = fs.readFileSync(path.join(PACK_ROOT, 'README.md'), 'utf8');
if (!/Agent.*禁止|AGENT.*禁止/i.test(readme)) fail('README.md: missing Agent-forbidden notice');

const contractPath = path.join(PACK_ROOT, 'reference/open-api-contract.md');
if (fs.existsSync(contractPath)) {
  const c = fs.readFileSync(contractPath, 'utf8');
  if (!/org-todos\/findPage/.test(c)) fail('open-api-contract: missing OT01');
  if (!/org-todos\/detail/.test(c)) fail('open-api-contract: missing OT02');
  if (!/POST \/api\/open\/org-todos/.test(c)) fail('open-api-contract: missing OT03');
  if (!/progress/.test(c)) fail('open-api-contract: missing OT04');
  if (!/PATCH/.test(c)) fail('open-api-contract: missing OT05');
  if (!/local:ready/.test(c)) fail('open-api-contract: must be local:ready');
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/verify-org-todo-response.cjs'), '--fixtures'], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`verify-org-todo-response --fixtures failed: ${e.message}`);
}

const tplPath = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPath)) {
  for (const name of [
    'T-OP-TYPE-ASK',
    'T-QUERY-TYPE-ASK',
    'T-OT-ID-ASK',
    'T-OT-DESC-ASK',
    'T-OT-PROGRESS-NOTE-ASK',
    'T-OT-PLANNED-CLOSE-ASK',
    'T-OT-PROPOSED-BY-ASK',
    'T-OT-SESSION-DOMAIN-REUSE-ASK',
    'T-OT-CREATE-CONFIRM',
    'T-OT-CREATE-EDIT-MENU',
    'T-OT-CREATE-DONE',
    'T-OT-PROGRESS-CONFIRM',
    'T-OT-PROGRESS-DONE',
    'T-OT-UPDATE-FIELD-ASK',
    'T-OT-STATUS-PICK',
    'T-OT-UPDATE-CONFIRM',
  ]) {
    if (!fs.readFileSync(tplPath, 'utf8').includes(name)) fail(`response-templates: missing ${name}`);
  }
  const tpl = fs.readFileSync(tplPath, 'utf8');
  if (/## T-OT-TITLE-ASK/.test(tpl)) {
    fail('response-templates: T-OT-TITLE-ASK must be removed (align Web: no title field)');
  }
  if (!/待处理（新建默认，不可改）/.test(tpl)) {
    fail('response-templates: T-OT-CREATE-CONFIRM must show read-only 待处理 status');
  }
  if (!/进展说明/.test(tpl)) {
    fail('response-templates: create confirm/edit must include 进展说明');
  }
  if (!/\| 提出人 \|/.test(tpl)) {
    fail('response-templates: T-OT-CREATE-CONFIRM must include 提出人');
  }
  if (/姓名（工号）/.test(tpl)) {
    fail('response-templates: person display must not use 姓名（工号）parens');
  }
  if (!/姓名工号/.test(tpl)) {
    fail('response-templates: person display must use 姓名工号');
  }
  if (/T-OT-CREATE-EDIT-MENU[\s\S]*?1\.\s*待办标题/.test(tpl)) {
    fail('response-templates: create edit menu must not list 待办标题');
  }
  if (!/T-OT-CREATE-EDIT-MENU[\s\S]*禁止[\s\S]*T-OT-STATUS-PICK/.test(tpl) && !/创建轨\*\*禁止\*\*使用/.test(tpl)) {
    fail('response-templates: create edit menu must forbid status pick');
  }
}

const defaultsPath = path.join(PACK_ROOT, 'reference/create-defaults.md');
if (fs.existsSync(defaultsPath)) {
  const d = fs.readFileSync(defaultsPath, 'utf8');
  if (!/resolve-token-user|技能静默/.test(d)) fail('create-defaults: missing token-user silent owners');
  if (!/proposedBy|提出人/.test(d)) fail('create-defaults: missing proposedBy / 提出人');
  if (!/今天\s*\+\s*1\s*个月|今天 \+ 1 个月/.test(d)) {
    fail('create-defaults: plannedCloseAt must default to today + 1 month');
  }
  if (!/T-OT-SESSION-DOMAIN-REUSE-ASK/.test(d)) {
    fail('create-defaults: missing T-OT-SESSION-DOMAIN-REUSE-ASK for domain/project cache');
  }
  if (!/禁止.*status|固定.*PENDING|待处理/.test(d)) fail('create-defaults: create must forbid status');
  if (!/对齐 Web|进展说明/.test(d)) fail('create-defaults: must align Web (进展说明 optional)');
  if (!/禁止.*title-file|禁止.*标题/.test(d)) fail('create-defaults: must forbid title / title-file');
  if (/姓名（工号）/.test(d)) fail('create-defaults: must not require 姓名（工号）parens');
}

const createPhasePath = path.join(PACK_ROOT, 'reference/phases/create-phase.md');
if (fs.existsSync(createPhasePath)) {
  const p = fs.readFileSync(createPhasePath, 'utf8');
  if (/T-OT-TITLE-ASK/.test(p)) fail('create-phase: must not use T-OT-TITLE-ASK');
  if (!/T-OT-PROGRESS-NOTE-ASK/.test(p)) fail('create-phase: missing T-OT-PROGRESS-NOTE-ASK');
  if (!/T-OT-DESC-ASK/.test(p)) fail('create-phase: missing T-OT-DESC-ASK');
  if (!/T-OT-SESSION-DOMAIN-REUSE-ASK/.test(p)) fail('create-phase: missing domain reuse ask');
  if (!/提出人/.test(p)) fail('create-phase: missing 提出人');
}

const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const instr = fs.readFileSync(instrPath, 'utf8');
  if (!/append-progress/.test(instr)) fail('instructions: missing append-progress');
  if (!/禁止向用户展示路由/.test(instr)) fail('instructions: missing P-218');
  if (!/resolve-token-user/.test(instr)) fail('instructions: missing resolve-token-user');
}

const apiPath = path.join(PACK_ROOT, 'tools/org-todo-api.mjs');
if (fs.existsSync(apiPath)) {
  const apiSrc = fs.readFileSync(apiPath, 'utf8');
  if (!/--out/.test(apiSrc)) fail('org-todo-api.mjs: missing --out');
  if (!/append-progress/.test(apiSrc)) fail('org-todo-api.mjs: missing append-progress');
  if (!/PATCH/.test(apiSrc)) fail('org-todo-api.mjs: missing PATCH update');
  if (!/resolve-token-user/.test(apiSrc)) fail('org-todo-api.mjs: missing resolve-token-user');
  if (!/\bm05\b/.test(apiSrc)) fail('org-todo-api.mjs: missing m05');
  if (!/normalizeCreateBody|delete out\.status|delete body\.status/.test(apiSrc)) {
    fail('org-todo-api.mjs: create must strip status');
  }
  if (!/progress-file|progress-text|readCreateProgressPlain/.test(apiSrc)) {
    fail('org-todo-api.mjs: create must support optional first progress (progress-file)');
  }
  if (!/defaultPlannedCloseAt/.test(apiSrc)) {
    fail('org-todo-api.mjs: create must default plannedCloseAt via defaultPlannedCloseAt');
  }
  if (!/proposedBy/.test(apiSrc)) {
    fail('org-todo-api.mjs: create must fill proposedBy');
  }
}

const toolsPath = path.join(PACK_ROOT, 'tools/lib/org-todo-tools.mjs');
if (fs.existsSync(toolsPath)) {
  const t = fs.readFileSync(toolsPath, 'utf8');
  if (!/hideId/.test(t)) fail('org-todo-tools.mjs: printPickList must support hideId');
  if (!/Array\.isArray\(out\[field\]\)/.test(t)) {
    fail('org-todo-tools.mjs: stringifyFields must stringify array elements');
  }
  if (!/defaultPlannedCloseAt/.test(t)) fail('org-todo-tools.mjs: missing defaultPlannedCloseAt');
  if (!/hasReusableDomainProjectDefaults/.test(t)) {
    fail('org-todo-tools.mjs: missing hasReusableDomainProjectDefaults');
  }
  if (/\$\{name\}（\$\{id\}）|`\$\{name\}（/.test(t)) {
    fail('org-todo-tools.mjs: formatOwnerDisplay must not wrap id in Chinese parens');
  }
}

const humanizePath = path.join(PACK_ROOT, 'scripts/lib/display-humanize.cjs');
if (fs.existsSync(humanizePath)) {
  const {
    formatDetailText,
    formatListText,
    formatProgressText,
    formatUpdateText,
    formatOwners,
  } = require(humanizePath);
  const detailFix = JSON.parse(
    fs.readFileSync(path.join(PACK_ROOT, 'scripts/fixtures/detail-success.json'), 'utf8'),
  );
  const detailHuman = formatDetailText(detailFix.data, { env: 'local' });
  if (!/\| 项目 \| 内容 \|/.test(detailHuman)) fail('formatDetailText: missing markdown kv table');
  if (/组织待办编号：/.test(detailHuman)) fail('formatDetailText: must not use 字段：值 lines');
  if (!/\| 关联项目 \|/.test(detailHuman)) fail('formatDetailText: missing 关联项目 row');
  if (!/\| 最新进展 \|/.test(detailHuman)) fail('formatDetailText: missing 最新进展 row');
  if (!/\| 详情链接 \|/.test(detailHuman)) fail('formatDetailText: missing 详情链接 row');
  if (/张三（47420）/.test(detailHuman)) fail('formatDetailText: proposedBy/owners must unwrap parens');
  if (!/张三47420/.test(detailHuman)) fail('formatDetailText: expected 张三47420 person display');

  const ownersHuman = formatOwners([{ employeeId: '47420', name: '张三' }]);
  if (ownersHuman !== '张三47420') fail(`formatOwners: expected 张三47420, got ${ownersHuman}`);

  const listFix = JSON.parse(
    fs.readFileSync(path.join(PACK_ROOT, 'scripts/fixtures/list-success.json'), 'utf8'),
  );
  const listHuman = formatListText(listFix.data);
  if (!/\| # \| 组织待办编号 \|/.test(listHuman)) fail('formatListText: missing markdown list table');

  const progressHuman = formatProgressText({ operatorName: '张三', progressTime: 't' }, 'OT-1');
  if (!/\| 项目 \| 内容 \|/.test(progressHuman)) fail('formatProgressText: missing markdown kv table');

  const updateHuman = formatUpdateText('OT-1', { status: 'IN_PROGRESS' });
  if (!/\| 项目 \| 内容 \|/.test(updateHuman)) fail('formatUpdateText: missing markdown kv table');
}

if (errors.length) {
  console.error('self-check FAILED (yanxiaotong-org-todo):');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('self-check OK: yanxiaotong-org-todo');
