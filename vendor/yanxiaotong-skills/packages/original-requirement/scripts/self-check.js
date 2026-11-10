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
  if (/status\s*=\s*planned|API 待开放|规划轨/i.test(body)) {
    fail('PACK.md: must not declare planned status');
  }
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
  'reference/create-defaults.md',
  'reference/error-humanize.md',
  'reference/phases/create-phase.md',
  'reference/phases/detail-phase.md',
  'reference/phases/list-phase.md',
  'reference/phases/update-phase.md',
  'reference/ui/progress-display.md',
  'reference/ui/response-templates.md',
  'reference/ui/field-labels.md',
  'tools/original-requirement-api.mjs',
  'tools/lib/original-requirement-tools.mjs',
  'scripts/verify-original-requirement-response.cjs',
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
  if (/status\s*=\s*planned/i.test(c)) fail('open-api-contract: must not be planned-only');
  if (!/original-requirements/.test(c)) fail('open-api-contract: missing path prefix');
  if (!/findPage/.test(c)) fail('open-api-contract: missing OR07 findPage');
  if (!/PATCH/.test(c)) fail('open-api-contract: missing OR02 PATCH');
  if (!/curl/.test(c)) fail('open-api-contract: missing curl examples');
  if (!/businessDomainId/.test(c)) fail('open-api-contract: missing businessDomainId');
  if (!/expectedDeliveryDate/.test(c)) fail('open-api-contract: missing expectedDeliveryDate');
}

const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const instr = fs.readFileSync(instrPath, 'utf8');
  if (!/original-requirement-api\.mjs/.test(instr)) fail('instructions: missing CLI');
  if (/status\s*=\s*planned|尚未发布/i.test(instr)) fail('instructions: still planned wording');
  if (!/T-CREATE-NEED-ASK/.test(instr) || !/自动提炼/.test(instr)) {
    fail('instructions: must require auto-refine for userNeedDesc (T-CREATE-NEED-ASK)');
  }
  if (!/禁止.*node -e|node -e.*禁止/.test(instr)) {
    fail('instructions: must forbid node -e for Chinese JSON body (Windows)');
  }
}

const bootPath = path.join(PACK_ROOT, 'reference/boot.md');
if (fs.existsSync(bootPath)) {
  const boot = fs.readFileSync(bootPath, 'utf8');
  if (!/禁止.*node -e|node -e.*禁止/.test(boot)) {
    fail('boot.md: must forbid node -e for Chinese JSON body (Windows)');
  }
  if (!/Write/.test(boot)) {
    fail('boot.md: must prefer editor/Write for body.json on Windows');
  }
}

const defaultsPath = path.join(PACK_ROOT, 'reference/create-defaults.md');
if (fs.existsSync(defaultsPath)) {
  const def = fs.readFileSync(defaultsPath, 'utf8');
  if (!/原始需求描述（强制）/.test(def)) fail('create-defaults: missing forced userNeedDesc refine');
  if (!/禁止.*T-CREATE-NEED-ASK/.test(def)) fail('create-defaults: must forbid default T-CREATE-NEED-ASK');
}

const createPhasePath = path.join(PACK_ROOT, 'reference/phases/create-phase.md');
if (fs.existsSync(createPhasePath)) {
  const cp = fs.readFileSync(createPhasePath, 'utf8');
  if (!/userNeedDesc.*强制|强制.*userNeedDesc/.test(cp)) {
    fail('create-phase: must force auto-refine userNeedDesc');
  }
  if (!/追问原始需求描述/.test(cp)) {
    fail('create-phase: must forbid asking userNeedDesc when substantial text exists');
  }
}

const tplPath = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPath)) {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  if (!/## T-CREATE-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(tpl)) {
    fail('response-templates: T-CREATE-CONFIRM must use | 项目 | 内容 | table');
  }
  if (/## T-CREATE-CONFIRM[\s\S]*?- 标题：/.test(tpl)) {
    fail('response-templates: T-CREATE-CONFIRM must not use bullet field list');
  }
  if (!/T-CREATE-DONE[\s\S]*详情链接/.test(tpl)) {
    fail('response-templates: T-CREATE-DONE must include 详情链接');
  }
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/verify-original-requirement-response.cjs'), '--fixtures'], {
    cwd: PACK_ROOT,
    stdio: 'pipe',
  });
} catch (e) {
  fail(`verify --fixtures failed: ${e.stderr?.toString?.() || e.message}`);
}

if (errors.length) {
  console.error('self-check FAILED (yanxiaotong-original-requirement):');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('self-check OK: yanxiaotong-original-requirement');
