#!/usr/bin/env node
/**
 * P-412：主包自更新 pending 准备 / TEMP apply / 排序
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  prepareSelfUpdatePending,
  readSelfUpdatePending,
  clearSelfUpdatePending,
  refreshSelfUpdateApplyCmd,
  PENDING_MARKER_NAME,
} from '../packages/skill-sync/tools/lib/self-update-pending.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yxt-self-upd-'));
const skillsRoot = path.join(tmpRoot, 'skills');
const targetAbs = path.join(skillsRoot, 'yanxiaotong-skills');
const stagingSkill = path.join(tmpRoot, 'staging-skill');

fs.mkdirSync(targetAbs, { recursive: true });
fs.writeFileSync(path.join(targetAbs, 'OLD.txt'), 'old\n', 'utf8');
fs.writeFileSync(
  path.join(targetAbs, 'SKILL.md'),
  '---\nname: yanxiaotong-skills\n---\n',
  'utf8'
);

fs.mkdirSync(stagingSkill, { recursive: true });
fs.writeFileSync(
  path.join(stagingSkill, 'SKILL.md'),
  '---\nname: yanxiaotong-skills\n---\n',
  'utf8'
);
fs.writeFileSync(path.join(stagingSkill, 'NEW.txt'), 'new\n', 'utf8');
fs.writeFileSync(
  path.join(stagingSkill, 'skill-package.manifest.json'),
  JSON.stringify({ skillId: '999', packageMd5: 'abc123', currentVersion: '1.0.0' }, null, 2),
  'utf8'
);

const prepared = prepareSelfUpdatePending({
  skillsRoot,
  skillId: '999',
  packageMd5: 'abc123',
  currentVersion: '1.0.0',
  displayName: 'yanxiaotong-skills',
  installDir: 'yanxiaotong-skills',
  targetAbs,
  stagingSkillDir: stagingSkill,
});

assert.ok(prepared.applyCmd);
assert.ok(fs.existsSync(path.join(skillsRoot, PENDING_MARKER_NAME)));
assert.ok(readSelfUpdatePending(skillsRoot));
// 阶段 A：目标目录尚未被替换
assert.ok(fs.existsSync(path.join(targetAbs, 'OLD.txt')));
assert.equal(fs.existsSync(path.join(targetAbs, 'NEW.txt')), false);

const refreshed = refreshSelfUpdateApplyCmd(skillsRoot);
assert.equal(refreshed.self_update_pending, true);
assert.ok(refreshed.self_update_apply_cmd);

const script = refreshed.pending.applyScriptPath;
assert.ok(fs.existsSync(script));
const out = execFileSync(process.execPath, [script], {
  encoding: 'utf8',
  cwd: os.tmpdir(),
});
const applied = JSON.parse(out);
assert.equal(applied.ok, true);
assert.equal(applied.selfUpdate, true);
assert.equal(fs.existsSync(path.join(targetAbs, 'NEW.txt')), true);
assert.equal(fs.existsSync(path.join(targetAbs, 'OLD.txt')), false);
assert.equal(readSelfUpdatePending(skillsRoot), null);
assert.equal(fs.existsSync(path.join(skillsRoot, PENDING_MARKER_NAME)), false);

const registryPath = path.join(skillsRoot, '.yanxiaotong-installed.json');
assert.ok(fs.existsSync(registryPath));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
assert.equal(String(registry.skills[0].skillId), '999');
assert.equal(registry.skills[0].packageMd5, 'abc123');

clearSelfUpdatePending(skillsRoot);
fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('test-self-update-pending-p412: all passed');
