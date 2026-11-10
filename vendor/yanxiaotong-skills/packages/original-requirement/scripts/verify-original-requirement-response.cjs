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
  if (data && data.originalNo && data.title != null) {
    console.log(`OK: detail ${path.basename(file)}`);
    return;
  }
  if (data && data.originalNo && (data.id != null || data.updatedAt != null)) {
    if (!String(data.originalNo).startsWith('OR-')) fail(`missing valid originalNo in ${file}`);
    console.log(`OK: create/update ${path.basename(file)}`);
    return;
  }
  if (data && Array.isArray(data.records)) {
    console.log(`OK: list ${path.basename(file)} ${data.records.length} records`);
    return;
  }
  if (data && Array.isArray(data.records) === false && data === true) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  if (typeof data === 'object' && data && !data.records && data.originalNo == null && data.id == null) {
    // metadata page shape without OR fields
    if (Array.isArray(data.records) || data.total != null) {
      console.log(`OK: metadata ${path.basename(file)}`);
      return;
    }
  }
  if (data && Array.isArray(data) === false && typeof data === 'object') {
    // m01 often { records: [...] } already handled; mutation: id+originalNo+updatedAt handled
    if (data.updatedAt != null || data.id != null) {
      console.log(`OK: mutation ${path.basename(file)}`);
      return;
    }
  }
  if (data === true || data === null || data === undefined) {
    console.log(`OK: mutation ${path.basename(file)}`);
    return;
  }
  fail(`Unexpected response shape in ${file}`);
}

const arg = process.argv[2];
if (!arg) {
  fail('Usage: verify-original-requirement-response.cjs <response.json> | --fixtures');
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
