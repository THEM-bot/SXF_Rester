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
  'reference/intent-routing.md',
  'reference/open-api-contract.md',
  'reference/step-completion-gate.md',
  'reference/create-defaults.md',
  'reference/phases/create-phase.md',
  'reference/phases/detail-phase.md',
  'reference/phases/list-phase.md',
  'reference/phases/update-phase.md',
  'reference/phases/status-phase.md',
  'reference/phases/close-phase.md',
  'reference/ui/progress-display.md',
  'reference/ui/response-templates.md',
  'reference/ui/field-labels.md',
  'reference/error-humanize.md',
  'tools/defect-api.mjs',
  'tools/parse-intent.mjs',
  'tools/lib/parse-intent-core.mjs',
  'tools/lib/prepare-execute.mjs',
  'tools/lib/build-create-body.mjs',
  'scripts/verify-defect-response.cjs',
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
  if (!/defects\/create/.test(c)) fail('open-api-contract: missing D01 path');
  if (!/findPage/.test(c)) fail('open-api-contract: missing D03 path');
  if (!/defect-dictionaries/.test(c)) fail('open-api-contract: missing M11');
  if (!/local:ready/.test(c)) fail('open-api-contract: must be local:ready');
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/verify-defect-response.cjs'), '--fixtures'], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`verify-defect-response --fixtures failed: ${e.message}`);
}

const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const instr = fs.readFileSync(instrPath, 'utf8');
  if (!/local:ready/.test(instr)) fail('instructions: missing local:ready');
  if (!/parse-intent/.test(instr)) fail('instructions: missing parse-intent');
  if (!/T-DEFECT-CREATE-QUICK-CONFIRM/.test(instr)) fail('instructions: missing quick create confirm');
  if (!/defect-api\.mjs/.test(instr)) fail('instructions: missing defect-api.mjs');
  if (!/intent-routing/.test(instr)) fail('instructions: missing intent-routing');
  if (!/禁止向用户展示路由/.test(instr)) fail('instructions: missing P-218');
}

const tplPath = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPath)) {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  for (const name of [
    'T-OP-TYPE-ASK',
    'T-QUERY-TYPE-ASK',
    'T-DEFECT-ID-ASK',
    'T-DEFECT-CREATE-QUICK-CONFIRM',
    'T-STATUS-CONFIRM',
    'T-CLOSE-CONFIRM',
    'T-DEFECT-CREATE-DONE',
    'T-D03-FILTER-MENU',
  ]) {
    if (!tpl.includes(name)) fail(`response-templates: missing ${name}`);
  }
  if (!/T-DEFECT-CREATE-QUICK-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(tpl)) {
    fail('response-templates: T-DEFECT-CREATE-QUICK-CONFIRM must use | 项目 | 内容 | table');
  }
  if (!/T-DEFECT-CREATE-QUICK-CONFIRM[\s\S]*\| 缺陷描述 \|/.test(tpl)) {
    fail('response-templates: T-DEFECT-CREATE-QUICK-CONFIRM must include 缺陷描述 row');
  }
  if (!/description_for_confirm|<br>/.test(tpl)) {
    fail('response-templates: defect description must require <br> / description_for_confirm');
  }
  if (/T-DEFECT-CREATE-QUICK-CONFIRM[\s\S]*?- 所属需求：/.test(tpl)) {
    fail('response-templates: T-DEFECT-CREATE-QUICK-CONFIRM must not use bullet field list');
  }
  if (!/T-DEFECT-CREATE-DONE[\s\S]*详情链接/.test(tpl)) {
    fail('response-templates: T-DEFECT-CREATE-DONE must include 详情链接');
  }
}

const apiPath = path.join(PACK_ROOT, 'tools/defect-api.mjs');
if (fs.existsSync(apiPath)) {
  const apiSrc = fs.readFileSync(apiPath, 'utf8');
  if (!/--out/.test(apiSrc)) fail('defect-api.mjs: missing --out');
  if (!/prepare/.test(apiSrc)) fail('defect-api.mjs: missing prepare');
  if (!/text-file/.test(apiSrc)) fail('defect-api.mjs: missing --text-file (Windows UTF-8)');
  if (!/execute/.test(apiSrc)) fail('defect-api.mjs: missing execute');
  if (!/apply-refine/.test(apiSrc)) fail('defect-api.mjs: missing apply-refine');
}

const defaultsPath = path.join(PACK_ROOT, 'reference/create-defaults.md');
if (fs.existsSync(defaultsPath)) {
  const d = fs.readFileSync(defaultsPath, 'utf8');
  if (!/content_refine/.test(d)) fail('create-defaults: missing content_refine v0.4');
  if (!/缺陷类型自动判定/.test(d) || !/Agent 语义/.test(d)) {
    fail('create-defaults: missing defect type Agent semantic auto-infer v0.6');
  }
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-parse-intent.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-parse-intent failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-description-format.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-description-format failed: ${e.message}`);
}

if (errors.length) {
  console.error('self-check FAILED (yanxiaotong-defect):');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('self-check OK: yanxiaotong-defect');
