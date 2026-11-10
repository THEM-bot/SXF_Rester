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
      console.log(`OK: expected fail — ${path.basename(file)} → ${msg.slice(0, 48)}…`);
      return;
    }
    console.error(msg);
    process.exit(1);
  }

  if (expectFail) fail(`Expected failure for ${file} but got success`);

  const data = json.data;
  if (data && (data.requirementNo || data.requirementId) && data.title != null) {
    console.log(`OK: detail ${path.basename(file)}`);
    return;
  }
  if (data && data.requirementNo && data.requirementId) {
    if (!String(data.requirementNo).startsWith('REQ-')) fail(`missing valid requirementNo in ${file}`);
    console.log(`OK: create ${path.basename(file)}`);
    return;
  }
  if (data && Array.isArray(data.records)) {
    const hasReqRow = (r) => r && (r.requirementNo != null || r.requirementId != null);
    const totalNum = data.total != null ? Number(data.total) : NaN;
    const isRequirementList =
      data.records.some(hasReqRow) ||
      (data.records.length === 0 && totalNum === 0 && data.pages != null);
    if (isRequirementList) {
      const n = data.records.length;
      console.log(`OK: list ${path.basename(file)} ${n} records`);
    } else {
      console.log(`OK: metadata ${path.basename(file)} ${data.records.length} records`);
    }
    return;
  }
  if (data && Array.isArray(data.requirementLevel)) {
    console.log(`OK: metadata ${path.basename(file)} dictionaries`);
    return;
  }
  if (data === true || data === null || data === undefined) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  if (typeof data === 'object' && !data.records && !data.requirementNo) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  fail(`Unexpected response shape in ${file}`);
}

const arg = process.argv[2];
if (!arg) {
  fail('Usage: verify-requirement-response.cjs <response.json> | --fixtures');
}

if (arg === '--fixtures') {
  const dir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length < 5) fail('fixtures: need at least 5 JSON files');
  for (const f of files) {
    const expectFail = f.startsWith('error-');
    verifyFile(path.join(dir, f), { expectFail });
  }
  console.log(`OK: ${files.length} fixtures`);
  process.exit(0);
}

verifyFile(arg);
