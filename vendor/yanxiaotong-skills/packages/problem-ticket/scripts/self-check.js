#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PACK_ROOT = path.resolve(__dirname, '..');
const errors = [];

function fail(msg) {
  errors.push(msg);
}

for (const rel of [
  'PACK.md',
  'pack.yaml',
  'reference/boot.md',
  'reference/instructions.md',
  'reference/open-api-contract.md',
  'reference/create-defaults.md',
  'reference/step-completion-gate.md',
  'reference/phases/create-phase.md',
  'reference/phases/metadata-phase.md',
  'tools/problem-ticket-api.mjs',
  'scripts/verify-problem-ticket-response.cjs',
]) {
  if (!fs.existsSync(path.join(PACK_ROOT, rel))) fail(`missing ${rel}`);
}

const pack = fs.readFileSync(path.join(PACK_ROOT, 'PACK.md'), 'utf8');
if (!/disable-model-invocation:\s*true/.test(pack)) fail('PACK.md: missing disable-model-invocation');
if (fs.existsSync(path.join(PACK_ROOT, 'SKILL.md'))) fail('SKILL.md: nested forbidden');

const contract = fs.readFileSync(path.join(PACK_ROOT, 'reference/open-api-contract.md'), 'utf8');
if (!/Idempotency-Key/.test(contract)) fail('contract must land Idempotency-Key');
if (!/\/api\/open\/problem-tickets\/metadata/.test(contract)) fail('contract missing metadata path');
if (!/\/api\/open\/problem-tickets/.test(contract)) fail('contract missing create path');

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/verify-problem-ticket-response.cjs'), '--fixtures'], {
    stdio: 'inherit',
  });
} catch {
  fail('fixtures verify failed');
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('problem-ticket self-check: ok');
