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
  'reference/create-defaults-detail.md',
  'reference/phases/create-phase.md',
  'reference/phases/detail-phase.md',
  'reference/phases/list-phase.md',
  'reference/phases/update-phase.md',
  'reference/phases/cancel-phase.md',
  'reference/ui/progress-display.md',
  'reference/ui/response-templates.md',
  'reference/ui/field-labels.md',
  'reference/error-humanize.md',
  'tools/task-api.mjs',
  'tools/parse-create-intent.mjs',
  'tools/lib/parse-create-intent.mjs',
  'tools/lib/build-create-body.mjs',
  'tools/lib/quick-create.mjs',
  'tools/lib/dedup-tasks.mjs',
  'scripts/verify-task-response.cjs',
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
if (/API 待开放|待开放/.test(readme)) fail('README.md: must not say API 待开放');

function listRefFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listRefFiles(full, acc);
    else if (/\.md$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

for (const file of [packPath, ...listRefFiles(path.join(PACK_ROOT, 'reference'))]) {
  const rel = path.relative(PACK_ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  for (const sub of FORBIDDEN) {
    if (text.includes(sub)) fail(`${rel}: forbidden "${sub}"`);
  }
}

const contractPath = path.join(PACK_ROOT, 'reference/open-api-contract.md');
if (fs.existsSync(contractPath)) {
  const c = fs.readFileSync(contractPath, 'utf8');
  if (!/tasks\/create/.test(c)) fail('open-api-contract: missing T01 path');
  if (!/findPage/.test(c)) fail('open-api-contract: missing T03 path');
  if (!/task-dictionaries/.test(c)) fail('open-api-contract: missing M10');
  if (!/local:ready/.test(c)) fail('open-api-contract: must be local:ready');
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/verify-task-response.cjs'), '--fixtures'], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`verify-task-response --fixtures failed: ${e.message}`);
}

const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const instr = fs.readFileSync(instrPath, 'utf8');
  if (!/local:ready/.test(instr)) fail('instructions: missing local:ready');
  if (!/create-defaults/.test(instr)) fail('instructions: missing create-defaults.md');
  if (!/T-CREATE-CONFIRM/.test(instr)) fail('instructions: missing T-CREATE-CONFIRM');
  if (!/user_input|content_refine|需求分析轨|apply-refine/.test(instr)) fail('instructions: missing v0.8 create tracks');
  if (!/T-QUERY-TYPE-ASK/.test(instr)) fail('instructions: missing T-QUERY-TYPE-ASK');
  if (!/禁止向用户展示路由/.test(instr)) fail('instructions: missing P-218');
  if (!/operation/.test(instr)) fail('instructions: missing operation discipline');
  if (!/T-CREATE-INPUT-ASK|P-408/.test(instr)) fail('instructions: missing P-408 menu-digit guard');
  if (!/T-CREATE-MODE-ASK|P-410/.test(instr)) fail('instructions: missing P-410 create-mode ask');
}

const createPhasePath = path.join(PACK_ROOT, 'reference/phases/create-phase.md');
if (fs.existsSync(createPhasePath)) {
  const cp = fs.readFileSync(createPhasePath, 'utf8');
  if (!/T-CREATE-INPUT-ASK/.test(cp)) fail('create-phase: missing T-CREATE-INPUT-ASK');
  if (!/P-408|菜单纯序号/.test(cp)) fail('create-phase: missing menu-digit guard');
  if (!/T-CREATE-MODE-ASK|P-410/.test(cp)) fail('create-phase: missing P-410 mode ask');
  if (!/T-CREATE-DEDUP-EMPTY-DONE/.test(cp)) fail('create-phase: missing T-CREATE-DEDUP-EMPTY-DONE');
}

const tplPath = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPath)) {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  for (const name of [
    'T-OP-TYPE-ASK',
    'T-QUERY-TYPE-ASK',
    'T-TASK-ID-ASK',
    'T-M10-PHASE-PICK',
    'T-CANCEL-CONFIRM',
    'T-CREATE-DONE',
    'T-CREATE-CONFIRM',
    'T-CREATE-INPUT-ASK',
    'T-CREATE-MODE-ASK',
    'T-CREATE-MANUAL-INPUT-ASK',
    'T-CREATE-DEDUP-EMPTY-DONE',
    'T-TASK-DEDUP-CLARIFY',
    'T-CREATE-QUICK-CONFIRM',
    'T-CREATE-EDIT-MENU',
    'T-CREATE-QUICK-EDIT-MENU',
    'T-T03-FILTER-MENU',
  ]) {
    if (!tpl.includes(name)) fail(`response-templates: missing ${name}`);
  }
  if (!/T-CREATE-DONE[\s\S]*详情链接/.test(tpl)) {
    fail('response-templates: T-CREATE-DONE must include 详情链接');
  }
}

const parseLibPath = path.join(PACK_ROOT, 'tools/lib/parse-create-intent.mjs');
if (fs.existsSync(parseLibPath)) {
  const parseLib = fs.readFileSync(parseLibPath, 'utf8');
  if (!/isMenuChoiceOnly/.test(parseLib)) fail('parse-create-intent: missing isMenuChoiceOnly');
  if (!/MENU_CHOICE_ONLY/.test(parseLib)) fail('parse-create-intent: missing MENU_CHOICE_ONLY');
  if (!/isRequirementRefOnly/.test(parseLib)) fail('parse-create-intent: missing isRequirementRefOnly');
  if (!/NEED_CREATE_MODE/.test(parseLib)) fail('parse-create-intent: missing NEED_CREATE_MODE');
  if (!/hasAutoCreateCue/.test(parseLib)) fail('parse-create-intent: missing hasAutoCreateCue');
}

const apiPath = path.join(PACK_ROOT, 'tools/task-api.mjs');
if (fs.existsSync(apiPath)) {
  const apiSrc = fs.readFileSync(apiPath, 'utf8');
  if (!/--out/.test(apiSrc)) fail('task-api.mjs: missing --out');
  if (!/create-quick/.test(apiSrc)) fail('task-api.mjs: missing create-quick');
  if (!/prepare-create/.test(apiSrc)) fail('task-api.mjs: missing prepare-create');
  if (!/apply-dedup/.test(apiSrc)) fail('task-api.mjs: missing apply-dedup');
  if (!/apply-refine/.test(apiSrc)) fail('task-api.mjs: missing apply-refine');
  if (!/resolve-only/.test(apiSrc)) fail('task-api.mjs: missing --resolve-only');
  if (!/force-track/.test(apiSrc)) fail('task-api.mjs: missing --force-track');
}

const defaultsPath = path.join(PACK_ROOT, 'reference/create-defaults.md');
if (fs.existsSync(defaultsPath)) {
  const d = fs.readFileSync(defaultsPath, 'utf8');
  if (!/开发阶段/.test(d) || !/开发编码/.test(d)) fail('create-defaults: missing phase/category defaults');
  if (!/content_refine/.test(d)) fail('create-defaults: missing content_refine track v0.8');
  if (!/P-410|pending_create_mode|T-CREATE-MODE-ASK/.test(d)) fail('create-defaults: missing P-410 mode ask');
  if (!/task-api\.mjs/.test(d)) fail('create-defaults: missing task-api CLI');
}
const detailPath = path.join(PACK_ROOT, 'reference/create-defaults-detail.md');
if (!fs.existsSync(detailPath)) fail('missing create-defaults-detail.md');

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-parse-create-intent.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-parse-create-intent failed: ${e.message}`);
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-analyze-requirement-tasks.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-analyze-requirement-tasks failed: ${e.message}`);
}

if (errors.length) {
  console.error('self-check FAILED (yanxiaotong-task):');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('self-check OK: yanxiaotong-task');
