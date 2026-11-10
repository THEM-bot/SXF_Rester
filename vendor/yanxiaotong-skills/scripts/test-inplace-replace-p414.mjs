#!/usr/bin/env node
/**
 * P-414：就地覆盖不 rename 安装根
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { atomicReplaceInPlace } from '../packages/skill-sync/tools/lib/atomic-write.mjs';
import {
  prepareSelfUpdatePending,
  readSelfUpdatePending,
  clearSelfUpdatePending,
} from '../packages/skill-sync/tools/lib/self-update-pending.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yxt-inplace-'));
const skillsRoot = path.join(tmp, 'skills');
const target = path.join(skillsRoot, 'yanxiaotong-skills');
const staging = path.join(tmp, 'staging');

fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'OLD.txt'), 'old\n');
fs.mkdirSync(path.join(target, 'KEEP_DIR'), { recursive: true });
fs.writeFileSync(path.join(target, 'KEEP_DIR', 'x.txt'), 'x\n');
fs.writeFileSync(path.join(target, 'gone.txt'), 'gone\n');

fs.mkdirSync(staging, { recursive: true });
fs.writeFileSync(path.join(staging, 'NEW.txt'), 'new\n');
fs.writeFileSync(path.join(staging, 'OLD.txt'), 'old2\n');
fs.mkdirSync(path.join(staging, 'KEEP_DIR'), { recursive: true });
fs.writeFileSync(path.join(staging, 'KEEP_DIR', 'x.txt'), 'x2\n');
fs.writeFileSync(
  path.join(staging, 'skill-package.manifest.json'),
  JSON.stringify({ skillId: '337', packageMd5: 'c'.repeat(32), currentVersion: 'v9' }),
);

// 目录在覆盖前后应仍存在（未整目录 rename）
assert.ok(fs.existsSync(target));
const r = atomicReplaceInPlace(staging, target);
assert.equal(r.mode, 'inplace');
assert.equal(fs.readFileSync(path.join(target, 'OLD.txt'), 'utf8'), 'old2\n');
assert.equal(fs.readFileSync(path.join(target, 'NEW.txt'), 'utf8'), 'new\n');
assert.equal(fs.existsSync(path.join(target, 'gone.txt')), false);
assert.ok(fs.existsSync(target));

// TEMP apply 路径同样就地覆盖
clearSelfUpdatePending(skillsRoot);
const staging2 = path.join(tmp, 'staging2');
fs.mkdirSync(staging2, { recursive: true });
fs.writeFileSync(path.join(staging2, 'SKILL.md'), '---\nname: yanxiaotong-skills\n---\n');
fs.writeFileSync(path.join(staging2, 'MARK.txt'), 'mark\n');
fs.writeFileSync(
  path.join(staging2, 'skill-package.manifest.json'),
  JSON.stringify({ skillId: '337', packageMd5: 'd'.repeat(32), currentVersion: 'v10' }),
);
const prepared = prepareSelfUpdatePending({
  skillsRoot,
  skillId: '337',
  packageMd5: 'd'.repeat(32),
  currentVersion: 'v10',
  displayName: 'yanxiaotong-skills',
  installDir: 'yanxiaotong-skills',
  targetAbs: target,
  stagingSkillDir: staging2,
});
assert.ok(readSelfUpdatePending(skillsRoot));
const out = execFileSync(process.execPath, [prepared.applyScriptPath], {
  encoding: 'utf8',
  cwd: os.tmpdir(),
});
const applied = JSON.parse(out);
assert.equal(applied.ok, true);
assert.equal(applied.replaceMode, 'inplace');
assert.equal(fs.readFileSync(path.join(target, 'MARK.txt'), 'utf8'), 'mark\n');
assert.equal(readSelfUpdatePending(skillsRoot), null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-inplace-replace-p414: all passed');
