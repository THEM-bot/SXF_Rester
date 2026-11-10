#!/usr/bin/env node
/**
 * P-239 unit smoke：write-json-body 无 BOM + description-file 合并
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = path.join(here, '..', 'tools', 'requirement-api.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yx-write-json-'));
const meta = path.join(tmp, 'meta.json');
const desc = path.join(tmp, 'desc.txt');
const out = path.join(tmp, 'body.json');

fs.writeFileSync(
  meta,
  JSON.stringify({
    title: 't',
    businessDomainId: 2173363464410542080,
    projectId: '1',
    appServiceId: '2',
    requirementLevel: 'Feature',
  }),
  'utf8',
);
fs.writeFileSync(desc, '中文描述一行\n第二行', 'utf8');

const r = spawnSync(
  process.execPath,
  [api, 'write-json-body', '--json', meta, '--description-file', desc, '--out', out],
  { encoding: 'utf8' },
);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}

const buf = fs.readFileSync(out);
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  console.error('FAIL: BOM present');
  process.exit(1);
}
const body = JSON.parse(buf.toString('utf8'));
if (body.description !== '中文描述一行\n第二行') {
  console.error('FAIL: description merge', body.description);
  process.exit(1);
}
if (typeof body.businessDomainId !== 'string') {
  console.error('FAIL: long id not stringified', body.businessDomainId);
  process.exit(1);
}

console.log('OK: test-write-json-body');
