import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { findSkillMdDir, readJsonFile, MANIFEST_NAME } from './paths.mjs';

/** @deprecated Do not stage inside installDir — atomicReplace moves .bak over staging (P-258). */
export function createStaging(installDirAbs) {
  const stagingRoot = path.join(installDirAbs, '.sync-staging', randomUUID());
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

export function createInstallStaging(skillsRoot) {
  const stagingRoot = path.join(skillsRoot, '.sync-staging', `install-${randomUUID()}`);
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

/** Update staging must live outside target installDir (P-258). */
export function createUpdateStaging(skillsRoot) {
  const stagingRoot = path.join(skillsRoot, '.sync-staging', `update-${randomUUID()}`);
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

export function cleanupStaging(stagingDir) {
  if (!stagingDir || !fs.existsSync(stagingDir)) return;
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const parent = path.dirname(stagingDir);
  try {
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
      fs.rmdirSync(parent);
    }
  } catch {
    /* ignore */
  }
}

export function findManifestInTree(rootDir) {
  const manifestPath = findManifestPath(rootDir);
  return manifestPath;
}

function findManifestPath(rootDir) {
  const skillDir = findSkillMdDir(rootDir);
  if (!skillDir) return null;
  const manifestPath = path.join(skillDir, MANIFEST_NAME);
  return fs.existsSync(manifestPath) ? manifestPath : null;
}

export function verifyStaging(stagingDir, expectedMd5) {
  const manifestPath = findManifestPath(stagingDir);
  if (!manifestPath) {
    return { ok: false, reason: 'manifest missing in staging package' };
  }
  const manifest = readJsonFile(manifestPath);
  const md5 = String(manifest.packageMd5 || '').toLowerCase();
  const expected = String(expectedMd5 || '').toLowerCase();
  if (!md5 || md5 !== expected) {
    return {
      ok: false,
      reason: `manifest MD5 mismatch: staging=${md5 || 'empty'} expected=${expected}`,
    };
  }
  const skillDir = path.dirname(manifestPath);
  return { ok: true, skillDir, manifestPath, manifest };
}

function isBusyError(err) {
  const c = err?.code;
  return c === 'EPERM' || c === 'EBUSY' || c === 'EACCES';
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function withBusyRetry(fn, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
      if (!isBusyError(e) || i === tries - 1) throw e;
      sleepSync(50 * (i + 1));
    }
  }
  throw last;
}

export function atomicReplace(stagingSkillDir, targetInstallDirAbs) {
  const parent = path.dirname(targetInstallDirAbs);
  fs.mkdirSync(parent, { recursive: true });
  const bakDir = `${targetInstallDirAbs}.bak-${Date.now()}`;
  let hadTarget = false;

  if (fs.existsSync(targetInstallDirAbs)) {
    hadTarget = true;
    withBusyRetry(() => fs.renameSync(targetInstallDirAbs, bakDir));
  }

  try {
    copyDirRecursive(stagingSkillDir, targetInstallDirAbs);
    if (hadTarget && fs.existsSync(bakDir)) {
      withBusyRetry(() => fs.rmSync(bakDir, { recursive: true, force: true }));
    }
    return { ok: true };
  } catch (e) {
    if (fs.existsSync(targetInstallDirAbs)) {
      try {
        fs.rmSync(targetInstallDirAbs, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (hadTarget && fs.existsSync(bakDir)) {
      withBusyRetry(() => fs.renameSync(bakDir, targetInstallDirAbs));
    }
    throw e;
  }
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

const INPLACE_EXCLUDE = new Set(['.sync-staging', '.git', 'node_modules', '.svn']);

function listRelFiles(root, excludeNames = INPLACE_EXCLUDE) {
  const out = [];
  function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (excludeNames.has(ent.name)) continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, childRel);
      else out.push(childRel.replace(/\\/g, '/'));
    }
  }
  walk(root, '');
  return out;
}

function copyFileInPlace(srcFile, destFile, failed) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const tmp = `${destFile}.__yxt_upd_${process.pid}`;
  try {
    withBusyRetry(() => {
      fs.copyFileSync(srcFile, tmp);
      try {
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
      } catch (e) {
        if (!isBusyError(e)) throw e;
        // 目标占用：尝试直接覆盖
        fs.copyFileSync(srcFile, destFile);
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        return;
      }
      fs.renameSync(tmp, destFile);
    });
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    failed.push(`${destFile}: ${e.code || e.message}`);
  }
}

/**
 * 就地覆盖安装目录（P-414）：**禁止**对安装根做 rename。
 * 用于主包自更新，避免 Cursor 占用目录时 EBUSY。
 */
export function atomicReplaceInPlace(stagingSkillDir, targetInstallDirAbs) {
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

  const targetFiles = listRelFiles(targetInstallDirAbs);
  for (const rel of targetFiles) {
    if (stagingSet.has(rel)) continue;
    const abs = path.join(targetInstallDirAbs, rel);
    try {
      withBusyRetry(() => fs.unlinkSync(abs));
    } catch (e) {
      failed.push(`unlink ${abs}: ${e.code || e.message}`);
    }
  }

  // 清理空目录（自底向上，忽略占用）
  pruneEmptyDirs(targetInstallDirAbs, stagingSkillDir);

  if (failed.length) {
    const err = new Error(
      `in-place replace incomplete (${failed.length}): ${failed.slice(0, 5).join('; ')}${
        failed.length > 5 ? '…' : ''
      }`
    );
    err.code = 'INPLACE_PARTIAL';
    err.failed = failed;
    throw err;
  }
  return { ok: true, mode: 'inplace', failed };
}

function pruneEmptyDirs(targetRoot, stagingRoot) {
  function walk(targetDir, stagingDir) {
    let entries;
    try {
      entries = fs.readdirSync(targetDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (INPLACE_EXCLUDE.has(ent.name)) continue;
      if (!ent.isDirectory()) continue;
      const tChild = path.join(targetDir, ent.name);
      const sChild = path.join(stagingDir, ent.name);
      walk(tChild, sChild);
      if (!fs.existsSync(sChild)) {
        try {
          if (fs.readdirSync(tChild).length === 0) fs.rmdirSync(tChild);
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(targetRoot, stagingRoot);
}
