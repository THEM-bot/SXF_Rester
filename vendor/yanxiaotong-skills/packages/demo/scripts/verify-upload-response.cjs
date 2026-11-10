#!/usr/bin/env node
'use strict';

/**
 * Verify yanxiaotong Demo upload API response (D03/D04).
 * Always .cjs so host project "type":"module" does not break require().
 *
 * Usage (from skill pack path):
 *   node scripts/verify-upload-response.cjs response.json
 *   curl ... | node scripts/verify-upload-response.cjs
 */

const fs = require('fs');

function readInput() {
  const arg = process.argv[2];
  if (arg && arg !== '-') {
    return fs.readFileSync(arg, 'utf8');
  }
  return fs.readFileSync(0, 'utf8');
}

function fail(msg) {
  console.error(`verify-upload-response FAILED: ${msg}`);
  process.exit(1);
}

let raw;
try {
  raw = readInput().trim();
} catch (e) {
  fail(`cannot read input: ${e.message}`);
}

if (!raw) fail('empty input');

let body;
try {
  body = JSON.parse(raw);
} catch (e) {
  fail(`invalid JSON: ${e.message}`);
}

if (typeof body.success !== 'boolean') {
  fail('missing or invalid field: success (boolean)');
}

if (body.success === true) {
  const data = body.data;
  if (!data || typeof data !== 'object') {
    fail('success=true but data is missing or not an object');
  }
  const hasId = data.demoId != null || data.demoCode != null;
  if (!hasId) {
    fail('success=true but data.demoId and data.demoCode are both missing');
  }
  if (data.accessUrl != null && typeof data.accessUrl !== 'string') {
    fail('data.accessUrl must be a string when present');
  }
  console.log('verify-upload-response OK: success response looks valid');
  process.exit(0);
}

if (body.message == null && body.code == null) {
  fail('success=false but neither message nor code present');
}

console.log('verify-upload-response OK: failure response has message/code');
process.exit(0);
