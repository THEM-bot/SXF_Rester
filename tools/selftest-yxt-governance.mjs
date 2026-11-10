import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'tools', 'pmw.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmf-governance-'));
const env = { ...process.env, YXT_ROOT: path.join(root, 'vendor', 'yanxiaotong-skills') };
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], { env, encoding: 'utf8' });
  assert.ok(result.stdout, result.stderr);
  return { status: result.status, json: JSON.parse(result.stdout) };
}

try {
  const iter = path.join(tmp, 'iteration');
  const folder = path.join(iter, 'REQ-01');
  fs.mkdirSync(folder, { recursive: true });
  const story = path.join(folder, 'REQ-01.md');
  fs.writeFileSync(story, '# 预算导入\n\n| 字段 | 内容 |\n| --- | --- |\n| 故事点 | 3 SP |\n| 优先级 | 高 |\n', 'utf8');

  const parsed = run(['yxt', 'story', 'parse', '--path', story]);
  assert.equal(parsed.status, 0);
  assert.equal(parsed.json.result.data.parsed.storyPoint, 3);
  assert.equal(parsed.json.result.data.parsed.priority, '高');
  assert.ok(parsed.json.result.data.warnings.some((w) => w.blocked));

  const scanned = run(['yxt', 'story', 'scan', '--path', iter]);
  assert.equal(scanned.status, 0);
  assert.equal(scanned.json.result.data.total, 1);
  assert.equal(scanned.json.result.data.items[0].docPath, story);

  const missing = run(['yxt', 'story', 'parse', '--path', path.join(tmp, 'missing.md')]);
  assert.notEqual(missing.status, 0);
  assert.equal(missing.json.ok, false);

  const unprepared = run(['yxt', 'problem', '--title', 'test', '--desc', 'details', '--submitter', 'test']);
  assert.notEqual(unprepared.status, 0);
  assert.match(unprepared.json.error, /prepare/);
  const mixed = run(['yxt', 'problem', '--prepared', story, '--dry']);
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.json.error, /不能与/);
  console.log('研效通需求治理自测通过');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
