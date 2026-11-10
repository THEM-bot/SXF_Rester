#!/usr/bin/env node
/**
 * content_refine golden-case 结构 + 语义探针（P-315 · P-347）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_REFINE_TITLE_LEN } from '../tools/lib/content-refine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = [
  path.join(ROOT, 'scripts/fixtures/refine-golden-g1.json'),
  path.join(ROOT, 'scripts/fixtures/refine-golden-g2.json'),
  path.join(ROOT, 'scripts/fixtures/refine-golden-g3.json'),
  path.join(ROOT, '..', 'defect', 'scripts/fixtures/refine-golden-d1.json'),
  path.join(ROOT, '..', 'defect', 'scripts/fixtures/refine-golden-d2.json'),
];

for (const fp of FIXTURES) {
  if (!fs.existsSync(fp)) throw new Error(`missing fixture: ${fp}`);
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (j.track !== 'content_refine') throw new Error(`${fp}: track must be content_refine`);
  if (!j.id || typeof j.id !== 'string') throw new Error(`${fp}: id required`);
  if (!j.source_excerpt || String(j.source_excerpt).length < 10) {
    throw new Error(`${fp}: source_excerpt required (min 10 chars)`);
  }
  if (!Array.isArray(j.expected_title_contains) || !j.expected_title_contains.length) {
    throw new Error(`${fp}: expected_title_contains required`);
  }
  if (!Array.isArray(j.expected_description_sections) || !j.expected_description_sections.length) {
    throw new Error(`${fp}: expected_description_sections required`);
  }
  if (Number(j.expected_title_max_len) > MAX_REFINE_TITLE_LEN) {
    throw new Error(`${fp}: expected_title_max_len > ${MAX_REFINE_TITLE_LEN}`);
  }
}

console.log('test-content-refine-golden: all passed');
