#!/usr/bin/env node
/**
 * 安装路径消毒 / skillsRoot 包含性校验（安全审计高危 2）
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sanitizeDirSegment,
  resolveInstallDirName,
  assertPathInsideRoot,
  isPathInsideRoot,
} from '../packages/skill-sync/tools/lib/paths.mjs';
import {
  resolveInstallTarget,
  removeLegacyInstallDirs,
} from '../packages/skill-sync/tools/lib/registry.mjs';

assert.equal(sanitizeDirSegment('..'), 'skill');
assert.equal(sanitizeDirSegment('.'), 'skill');
assert.equal(sanitizeDirSegment('yanxiaotong-skills'), 'yanxiaotong-skills');
assert.equal(resolveInstallDirName('demo', '1120'), 'demo-1120');
assert.throws(() => resolveInstallDirName('demo', '../x'), /invalid skillId/);
assert.throws(() => resolveInstallDirName('demo', 'abc'), /invalid skillId/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yxt-path-guard-'));
const skillsRoot = path.join(tmp, 'skills');
const outside = path.join(tmp, 'outside-victim');
fs.mkdirSync(skillsRoot, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(outside, 'keep.txt'), 'safe', 'utf8');

assert.equal(isPathInsideRoot(skillsRoot, path.join(skillsRoot, 'a')), true);
assert.equal(isPathInsideRoot(skillsRoot, path.join(skillsRoot, '..', 'outside-victim')), false);
assert.throws(
  () => assertPathInsideRoot(skillsRoot, path.join(skillsRoot, '..', 'outside-victim')),
  (e) => e && e.code === 'PATH_ESCAPE'
);

{
  const t = resolveInstallTarget(skillsRoot, {
    displayName: '..',
    skillId: '337',
    currentInstallDir: '../outside-victim',
  });
  assert.equal(t.installDir, 'skill-337');
  assert.ok(isPathInsideRoot(skillsRoot, t.targetAbs));
  assert.ok(!t.legacyDirs.some((d) => d.includes('..')));
}

assert.throws(
  () =>
    resolveInstallTarget(skillsRoot, {
      displayName: 'ok',
      skillId: '../337',
    }),
  (e) => e && e.code === 'INVALID_SKILL_ID'
);

removeLegacyInstallDirs(skillsRoot, ['../outside-victim', '..', 'missing-ok']);
assert.ok(fs.existsSync(path.join(outside, 'keep.txt')), 'outside must not be deleted');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-path-escape-guard: all passed');
