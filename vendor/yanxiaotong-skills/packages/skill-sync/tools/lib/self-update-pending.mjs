/**
 * 主包自更新两阶段（P-412）：持锁进程只 prepare；TEMP 独立脚本 apply。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  writeJsonAtomic,
  normalizeRelPath,
  REGISTRY_NAME,
  assertPathInsideRoot,
  isPathInsideRoot,
} from './paths.mjs';
import { cleanupStaging, atomicReplaceInPlace } from './atomic-write.mjs';

export const PENDING_MARKER_NAME = '.yanxiaotong-self-update-pending.json';
export const SELF_PENDING_STAGING_REL = path.join('.sync-staging', 'self-pending');

export function pendingMarkerPath(skillsRoot) {
  return path.join(path.resolve(skillsRoot), PENDING_MARKER_NAME);
}

export function selfPendingStagingRoot(skillsRoot) {
  return path.join(path.resolve(skillsRoot), SELF_PENDING_STAGING_REL);
}

export function readSelfUpdatePending(skillsRoot) {
  const file = pendingMarkerPath(skillsRoot);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function clearSelfUpdatePending(skillsRoot) {
  const file = pendingMarkerPath(skillsRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const staging = selfPendingStagingRoot(skillsRoot);
  cleanupStaging(staging);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * 生成仅依赖 node:fs/path 的落盘脚本（主脚本在 TEMP，避免占用包内文件）。
 */
export function writeTempSelfApplyScript(pending) {
  const scriptPath = path.join(os.tmpdir(), `yxt-self-apply-${randomUUID()}.mjs`);
  const payload = JSON.stringify(pending);
  const body = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const pending = ${payload};
const REGISTRY_NAME = ${JSON.stringify(REGISTRY_NAME)};

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

function isBusy(err) {
  const c = err && err.code;
  return c === 'EPERM' || c === 'EBUSY' || c === 'EACCES';
}

function withRetry(fn, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
      if (!isBusy(e) || i === tries - 1) throw e;
      sleep(50 * (i + 1));
    }
  }
  throw last;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

const EXCLUDE = new Set(['.sync-staging', '.git', 'node_modules', '.svn']);

function listRelFiles(root) {
  const out = [];
  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (EXCLUDE.has(ent.name)) continue;
      const childRel = rel ? (rel + '/' + ent.name) : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, childRel);
      else out.push(childRel.replace(/\\\\/g, '/'));
    }
  }
  walk(root, '');
  return out;
}

function copyFileInPlace(srcFile, destFile, failed) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const tmp = destFile + '.__yxt_upd_' + process.pid;
  try {
    withRetry(() => {
      fs.copyFileSync(srcFile, tmp);
      try {
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
      } catch (e) {
        if (!isBusy(e)) throw e;
        fs.copyFileSync(srcFile, destFile);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return;
      }
      fs.renameSync(tmp, destFile);
    });
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    failed.push(destFile + ': ' + (e.code || e.message));
  }
}

/** P-414：就地覆盖，禁止对安装根 rename */
function atomicReplaceInPlace(stagingSkillDir, targetInstallDirAbs) {
  const failed = [];
  if (!fs.existsSync(targetInstallDirAbs)) {
    copyDirRecursive(stagingSkillDir, targetInstallDirAbs);
    return { ok: true, mode: 'fresh', failed };
  }
  const stagingFiles = listRelFiles(stagingSkillDir);
  const stagingSet = new Set(stagingFiles);
  for (const rel of stagingFiles) {
    copyFileInPlace(path.join(stagingSkillDir, rel), path.join(targetInstallDirAbs, rel), failed);
  }
  for (const rel of listRelFiles(targetInstallDirAbs)) {
    if (stagingSet.has(rel)) continue;
    const abs = path.join(targetInstallDirAbs, rel);
    try { withRetry(() => fs.unlinkSync(abs)); }
    catch (e) { failed.push('unlink ' + abs + ': ' + (e.code || e.message)); }
  }
  function pruneEmpty(targetDir, stagingDir) {
    let entries;
    try { entries = fs.readdirSync(targetDir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (EXCLUDE.has(ent.name) || !ent.isDirectory()) continue;
      const tChild = path.join(targetDir, ent.name);
      const sChild = path.join(stagingDir, ent.name);
      pruneEmpty(tChild, sChild);
      if (!fs.existsSync(sChild)) {
        try { if (fs.readdirSync(tChild).length === 0) fs.rmdirSync(tChild); } catch { /* ignore */ }
      }
    }
  }
  pruneEmpty(targetInstallDirAbs, stagingSkillDir);
  if (failed.length) {
    const err = new Error('in-place replace incomplete (' + failed.length + '): ' + failed.slice(0, 5).join('; '));
    err.code = 'INPLACE_PARTIAL';
    err.failed = failed;
    throw err;
  }
  return { ok: true, mode: 'inplace', failed };
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Date.now() + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function upsertRegistry(skillsRoot, entry) {
  const file = path.join(skillsRoot, REGISTRY_NAME);
  let registry = { version: 1, skills: [] };
  if (fs.existsSync(file)) {
    try {
      registry = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
    } catch { /* reset */ }
  }
  if (!Array.isArray(registry.skills)) registry.skills = [];
  const id = String(entry.skillId);
  const now = new Date().toISOString();
  const next = {
    skillId: id,
    installDir: entry.installDir,
    packageMd5: String(entry.packageMd5 || '').toLowerCase(),
    currentVersion: entry.currentVersion || null,
    source: entry.source || 'plaza',
    installedAt: entry.installedAt || now,
    updatedAt: now,
  };
  const idx = registry.skills.findIndex((s) => String(s.skillId) === id);
  if (idx >= 0) {
    next.installedAt = registry.skills[idx].installedAt || next.installedAt;
    registry.skills[idx] = next;
  } else {
    registry.skills.push(next);
  }
  writeJsonAtomic(file, registry);
  return next;
}

function cleanupStaging(stagingDir) {
  if (!stagingDir || !fs.existsSync(stagingDir)) return;
  try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  if (!pending?.stagingSkillDir || !pending?.targetAbs || !pending?.skillsRoot) {
    throw new Error('invalid self-update pending payload');
  }
  if (!fs.existsSync(pending.stagingSkillDir)) {
    throw new Error('self-update staging missing: ' + pending.stagingSkillDir);
  }
  atomicReplaceInPlace(pending.stagingSkillDir, pending.targetAbs);
  upsertRegistry(pending.skillsRoot, {
    skillId: pending.skillId,
    installDir: pending.installDir,
    packageMd5: pending.packageMd5,
    currentVersion: pending.currentVersion,
    source: 'plaza',
  });
  // P-413：删除同 skillId 的另一命名目录（如 yanxiaotong-skills-337）；须位于 skillsRoot 内
  function isInsideRoot(root, targetAbs) {
    const rootAbs = path.resolve(root);
    const abs = path.resolve(targetAbs);
    const rel = path.relative(rootAbs, abs);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
  }
  if (Array.isArray(pending.legacyDirs)) {
    for (const rel of pending.legacyDirs) {
      if (!rel) continue;
      const abs = path.resolve(pending.skillsRoot, rel);
      if (!isInsideRoot(pending.skillsRoot, abs)) continue;
      if (path.resolve(abs) === path.resolve(pending.targetAbs)) continue;
      if (!fs.existsSync(abs)) continue;
      try {
        withRetry(() => fs.rmSync(abs, { recursive: true, force: true }));
      } catch { /* keep new install */ }
    }
  }
  const marker = path.join(pending.skillsRoot, ${JSON.stringify(PENDING_MARKER_NAME)});
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  cleanupStaging(path.join(pending.skillsRoot, ${JSON.stringify(SELF_PENDING_STAGING_REL)}));
  console.log(JSON.stringify({
    ok: true,
    selfUpdate: true,
    self_update: true,
    replaceMode: 'inplace',
    skillId: pending.skillId,
    installDir: pending.installDir,
    installPath: pending.targetAbs,
    packageMd5: pending.packageMd5,
    currentVersion: pending.currentVersion || null,
    legacyRemoved: pending.legacyDirs || [],
  }, null, 2));
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}
`;
  fs.writeFileSync(scriptPath, body, 'utf8');
  return scriptPath;
}

/**
 * 将已校验的 skillDir 固化到 self-pending staging，并写标记 + TEMP apply 脚本。
 * @returns {{ pending, applyScriptPath, applyCmd }}
 */
export function prepareSelfUpdatePending({
  skillsRoot,
  skillId,
  packageMd5,
  currentVersion = null,
  displayName,
  installDir,
  targetAbs,
  stagingSkillDir,
  legacyDirs = [],
}) {
  const root = path.resolve(skillsRoot);
  const safeTarget = assertPathInsideRoot(root, targetAbs);
  const safeInstallDir = normalizeRelPath(path.relative(root, safeTarget));
  const safeLegacy = (legacyDirs || [])
    .map((d) => normalizeRelPath(d))
    .filter((d) => d && isPathInsideRoot(root, path.resolve(root, d)));
  const pendingRoot = selfPendingStagingRoot(root);
  cleanupStaging(pendingRoot);
  fs.mkdirSync(pendingRoot, { recursive: true });
  const destSkillDir = path.join(pendingRoot, 'skill');
  copyDirRecursive(stagingSkillDir, destSkillDir);

  const pending = {
    version: 1,
    skillId: String(skillId),
    packageMd5: String(packageMd5 || '').toLowerCase(),
    currentVersion: currentVersion || null,
    displayName: displayName || null,
    installDir: safeInstallDir || normalizeRelPath(installDir),
    targetAbs: safeTarget,
    stagingSkillDir: destSkillDir,
    skillsRoot: root,
    legacyDirs: safeLegacy,
    createdAt: new Date().toISOString(),
  };

  const applyScriptPath = writeTempSelfApplyScript(pending);
  pending.applyScriptPath = applyScriptPath;
  const applyCmd = `${process.execPath} ${JSON.stringify(applyScriptPath)}`;
  pending.applyCmd = applyCmd;

  writeJsonAtomic(pendingMarkerPath(root), pending);
  return { pending, applyScriptPath, applyCmd };
}

/**
 * 在当前进程执行 apply（仅用于测试或确认无占用时）；生产路径推荐 TEMP 脚本。
 */
export async function applySelfUpdatePendingInProcess(skillsRoot, { atomicReplaceInPlace, upsertSkill, assertDiskPackageMd5, removeLegacyInstallDirs }) {
  const pending = readSelfUpdatePending(skillsRoot);
  if (!pending) {
    return { ok: false, error: 'no self-update pending' };
  }
  if (!fs.existsSync(pending.stagingSkillDir)) {
    return { ok: false, error: `staging missing: ${pending.stagingSkillDir}` };
  }
  atomicReplaceInPlace(pending.stagingSkillDir, pending.targetAbs);
  if (pending.legacyDirs?.length && removeLegacyInstallDirs) {
    removeLegacyInstallDirs(pending.skillsRoot, pending.legacyDirs);
  }
  const installedManifest = assertDiskPackageMd5(pending.targetAbs, pending.packageMd5);
  upsertSkill(pending.skillsRoot, {
    skillId: pending.skillId,
    installDir: pending.installDir,
    packageMd5: installedManifest.packageMd5,
    currentVersion: installedManifest.currentVersion || pending.currentVersion,
    source: 'plaza',
  });
  clearSelfUpdatePending(pending.skillsRoot);
  return {
    ok: true,
    selfUpdate: true,
    replaceMode: 'inplace',
    skillId: pending.skillId,
    installDir: pending.installDir,
    installPath: pending.targetAbs,
    packageMd5: String(installedManifest.packageMd5 || '').toLowerCase(),
    currentVersion: installedManifest.currentVersion || pending.currentVersion || null,
  };
}

/** 若已有 pending，刷新 TEMP apply 脚本路径（残留场景）。 */
export function refreshSelfUpdateApplyCmd(skillsRoot) {
  const pending = readSelfUpdatePending(skillsRoot);
  if (!pending) return null;
  const applyScriptPath = writeTempSelfApplyScript(pending);
  pending.applyScriptPath = applyScriptPath;
  pending.applyCmd = `${process.execPath} ${JSON.stringify(applyScriptPath)}`;
  writeJsonAtomic(pendingMarkerPath(skillsRoot), pending);
  return {
    self_update_pending: true,
    self_update_apply_cmd: pending.applyCmd,
    pending,
  };
}
