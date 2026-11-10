#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { humanize } = require('./lib/error-humanize-rules.cjs');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function verifyFile(file, { expectFail = false } = {}) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`Invalid JSON ${file}: ${e.message}`);
  }

  const ok = json.success === true || json.code === 200 || json.code === '200';
  if (!ok) {
    const msg = humanize(json.message || json.msg);
    if (expectFail) {
      console.log(`OK: expected fail — ${path.basename(file)}`);
      return;
    }
    console.error(msg);
    process.exit(1);
  }
  if (expectFail) fail(`Expected failure for ${file} but got success`);

  const data = json.data;
  if (data && data.taskNo && data.taskId && data.title != null) {
    console.log(`OK: detail ${path.basename(file)}`);
    return;
  }
  if (data && data.taskNo && data.taskId) {
    console.log(`OK: create ${path.basename(file)}`);
    return;
  }
  if (data && Array.isArray(data.records) && data.records.some((r) => r.taskNo || r.taskId)) {
    console.log(`OK: list ${path.basename(file)} ${data.records.length} records`);
    return;
  }
  if (data && Array.isArray(data.taskPhase)) {
    console.log(`OK: metadata ${path.basename(file)} m10`);
    return;
  }
  if (data === true || data === null || data === undefined) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  if (typeof data === 'object' && !data.records && !data.taskNo) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  fail(`Unexpected response shape in ${file}`);
}

const arg = process.argv[2];
if (!arg) fail('Usage: verify-task-response.cjs <response.json> | --fixtures');

if (arg === '--fixtures') {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('refine-golden-'))) {
    verifyFile(path.join(dir, f));
  }
  process.exit(0);
}

verifyFile(arg);
