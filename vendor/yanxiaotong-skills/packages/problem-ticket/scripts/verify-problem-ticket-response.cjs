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
  if (data && data.problemNo && data.id) {
    console.log(`OK: create ${path.basename(file)}`);
    return;
  }
  if (data && data.version && Array.isArray(data.problemTypes)) {
    console.log(`OK: metadata ${path.basename(file)}`);
    return;
  }
  if (data && data.employeeId) {
    console.log(`OK: token-user ${path.basename(file)}`);
    return;
  }
  fail(`Unexpected response shape in ${file}`);
}

const arg = process.argv[2];
if (!arg) fail('Usage: verify-problem-ticket-response.cjs <response.json> | --fixtures');

if (arg === '--fixtures') {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const expectFail = f.startsWith('error-');
    verifyFile(path.join(dir, f), { expectFail });
  }
  process.exit(0);
}

verifyFile(arg);
