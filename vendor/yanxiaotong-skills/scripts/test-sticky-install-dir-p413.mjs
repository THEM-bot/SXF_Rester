#!/usr/bin/env node
/**
 * P-413：纯名与 name-id 粘滞，避免自更新分叉第二份
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveInstallTarget } from '../packages/skill-sync/tools/lib/registry.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yxt-sticky-'));
const skillsRoot = path.join(tmp, 'skills');
fs.mkdirSync(skillsRoot, { recursive: true });

const plain = path.join(skillsRoot, 'yanxiaotong-skills');
const withId = path.join(skillsRoot, 'yanxiaotong-skills-337');
fs.mkdirSync(plain, { recursive: true });
fs.writeFileSync(
  path.join(plain, 'skill-package.manifest.json'),
  JSON.stringify({ skillId: 337, packageMd5: 'a'.repeat(32), currentVersion: 'v1' }),
  'utf8'
);
fs.writeFileSync(path.join(plain, 'SKILL.md'), '---\nname: yanxiaotong-skills\n---\n', 'utf8');

// 仅纯名：更新粘滞纯名
{
  const t = resolveInstallTarget(skillsRoot, {
    displayName: 'yanxiaotong-skills',
    skillId: '337',
    currentInstallDir: 'yanxiaotong-skills',
  });
  assert.equal(t.installDir, 'yanxiaotong-skills');
  assert.ok(!t.legacyDirs.includes('yanxiaotong-skills'));
}

// 纯名 + name-id 双开：粘滞纯名，name-id 进 legacy
fs.mkdirSync(withId, { recursive: true });
fs.writeFileSync(
  path.join(withId, 'skill-package.manifest.json'),
  JSON.stringify({ skillId: 337, packageMd5: 'b'.repeat(32), currentVersion: 'v2' }),
  'utf8'
);
{
  const t = resolveInstallTarget(skillsRoot, {
    displayName: 'yanxiaotong-skills',
    skillId: '337',
    currentInstallDir: 'yanxiaotong-skills-337',
  });
  assert.equal(t.installDir, 'yanxiaotong-skills');
  assert.ok(t.legacyDirs.includes('yanxiaotong-skills-337'));
}

// 全新安装（无纯名）：用 name-id
fs.rmSync(plain, { recursive: true, force: true });
fs.rmSync(withId, { recursive: true, force: true });
{
  const t = resolveInstallTarget(skillsRoot, {
    displayName: 'yanxiaotong-skills',
    skillId: '337',
    currentInstallDir: null,
  });
  assert.equal(t.installDir, 'yanxiaotong-skills-337');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-sticky-install-dir-p413: all passed');
