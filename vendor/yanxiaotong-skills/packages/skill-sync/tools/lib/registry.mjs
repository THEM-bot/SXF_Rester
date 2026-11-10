import fs from 'node:fs';
import path from 'node:path';
import {
  REGISTRY_NAME,
  assertPathInsideRoot,
  isPathInsideRoot,
  normalizeRelPath,
  readJsonFile,
  readManifestFromSkillDir,
  resolveInstallDirName,
  sanitizeDirSegment,
  writeJsonAtomic,
} from './paths.mjs';

const DEFAULT_REGISTRY = { version: 1, skills: [] };

export function registryPath(skillsRoot) {
  return path.join(path.resolve(skillsRoot), REGISTRY_NAME);
}

export function readRegistry(skillsRoot) {
  const file = registryPath(skillsRoot);
  if (!fs.existsSync(file)) return { ...DEFAULT_REGISTRY, skills: [] };
  const data = readJsonFile(file);
  if (!Array.isArray(data.skills)) data.skills = [];
  if (data.version == null) data.version = 1;
  return data;
}

export function findRegistryEntry(registry, skillId) {
  const id = String(skillId);
  return (registry.skills || []).find((s) => String(s.skillId) === id) || null;
}

/**
 * @deprecated 登记文件不是同步比对真源；仅用于 installDir 辅助与落盘后回写。
 * 比对/是否可更新只看磁盘 skill-package.manifest.json（见 reconcileRegistryFromScan）。
 */
export function isLocalModified(registry, skillId, manifestMd5) {
  const entry = findRegistryEntry(registry, skillId);
  if (!entry || !entry.packageMd5) return false;
  return String(entry.packageMd5).toLowerCase() !== String(manifestMd5).toLowerCase();
}

/** check-all 时以磁盘 manifest 纠偏登记（登记跟随磁盘，不得反向判定是否已更新） */
export function reconcileRegistryFromScan(skillsRoot, scannedItem) {
  if (!scannedItem?.skillId || scannedItem.scanError) return null;
  const registry = readRegistry(skillsRoot);
  const entry = findRegistryEntry(registry, String(scannedItem.skillId));
  const diskMd5 = String(scannedItem.localMd5 || '').toLowerCase();
  if (!diskMd5) return null;

  const installDir = normalizeRelPath(scannedItem.installDir);
  const drift =
    !entry ||
    String(entry.packageMd5 || '').toLowerCase() !== diskMd5 ||
    normalizeRelPath(entry.installDir || '') !== installDir ||
    (scannedItem.currentVersion != null && entry.currentVersion !== scannedItem.currentVersion);

  if (!drift) return entry;

  return upsertSkill(skillsRoot, {
    skillId: String(scannedItem.skillId),
    installDir,
    packageMd5: diskMd5,
    currentVersion: scannedItem.currentVersion || entry?.currentVersion || null,
    source: entry?.source || 'plaza',
    installedAt: entry?.installedAt,
  });
}

export function upsertSkill(skillsRoot, entry) {
  const registry = readRegistry(skillsRoot);
  const id = String(entry.skillId);
  const now = new Date().toISOString();
  const normalized = {
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
    normalized.installedAt = registry.skills[idx].installedAt || normalized.installedAt;
    registry.skills[idx] = { ...registry.skills[idx], ...normalized };
  } else {
    registry.skills.push(normalized);
  }
  writeJsonAtomic(registryPath(skillsRoot), registry);
  return normalized;
}

export function listSkills(skillsRoot) {
  return readRegistry(skillsRoot).skills || [];
}

/**
 * 解析安装目标（P-266 · P-413）。
 * - 新装默认 `{name}-{skillId}`
 * - **粘滞**：引导安装常落纯名 `yanxiaotong-skills`；更新不得再开 `{name}-{id}` 第二份
 * - 同 skillId 的另一命名形态进 legacyDirs，落盘后删除
 */
function safeRelInstallDir(root, rel) {
  const cur = normalizeRelPath(rel);
  if (!cur) return null;
  const abs = path.resolve(root, cur);
  if (!isPathInsideRoot(root, abs)) return null;
  return normalizeRelPath(path.relative(root, abs));
}

export function resolveInstallTarget(skillsRoot, { displayName, skillId, currentInstallDir = null }) {
  const root = path.resolve(skillsRoot);
  const registry = readRegistry(root);
  const canonicalDir = resolveInstallDirName(displayName, skillId);
  const plainDir = sanitizeDirSegment(displayName);
  const plainAbs = path.join(root, plainDir);
  const canonicalAbs = path.join(root, canonicalDir);
  const id = skillId != null && String(skillId).trim() !== '' ? String(skillId).trim() : '';
  if (id && !/^\d+$/.test(id)) {
    const err = new Error(`invalid skillId: ${id}`);
    err.code = 'INVALID_SKILL_ID';
    throw err;
  }

  let installDir = canonicalDir;

  const plainMatchesSkill =
    id &&
    plainDir !== canonicalDir &&
    fs.existsSync(plainAbs) &&
    isPathInsideRoot(root, plainAbs) &&
    (() => {
      try {
        const m = readManifestFromSkillDir(plainAbs);
        return m && String(m.skillId) === id;
      } catch {
        return false;
      }
    })();

  // P-413：纯名已存在且同 skillId → 粘滞纯名（对齐 UAT 引导 zip 安装，避免自更新分叉）
  if (plainMatchesSkill) {
    installDir = plainDir;
  } else if (currentInstallDir) {
    const cur = safeRelInstallDir(root, currentInstallDir);
    if (cur && fs.existsSync(path.join(root, cur))) {
      installDir = cur;
    }
  }

  const targetAbs = assertPathInsideRoot(root, path.join(root, installDir));
  const legacyDirs = new Set();

  const addLegacy = (rel) => {
    const safe = safeRelInstallDir(root, rel);
    if (safe && safe !== installDir) legacyDirs.add(safe);
  };

  if (currentInstallDir) addLegacy(currentInstallDir);

  if (id) {
    const entry = findRegistryEntry(registry, id);
    if (entry?.installDir) addLegacy(entry.installDir);
    if (plainDir !== installDir && fs.existsSync(plainAbs) && isPathInsideRoot(root, plainAbs)) {
      legacyDirs.add(plainDir);
    }
    if (canonicalDir !== installDir && fs.existsSync(canonicalAbs) && isPathInsideRoot(root, canonicalAbs)) {
      legacyDirs.add(canonicalDir);
    }
  }

  legacyDirs.delete(installDir);
  return { installDir, targetAbs, legacyDirs: [...legacyDirs], registry };
}

export function removeLegacyInstallDirs(skillsRoot, legacyDirs) {
  const root = path.resolve(skillsRoot);
  for (const rel of legacyDirs || []) {
    const safe = safeRelInstallDir(root, rel);
    if (!safe) continue;
    const abs = path.join(root, safe);
    if (!fs.existsSync(abs)) continue;
    try {
      fs.rmSync(abs, { recursive: true, force: true });
    } catch {
      /* keep new install even if legacy cleanup fails */
    }
  }
}
