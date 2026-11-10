import fs from 'node:fs';
import path from 'node:path';
import {
  EXCLUDE_DIRS,
  MANIFEST_NAME,
  normalizeRelPath,
  readJsonFile,
  readSkillDisplayName,
} from './paths.mjs';

export function scanManifests(skillsRoot) {
  const root = path.resolve(skillsRoot);
  const results = [];
  const skillIdIndex = new Map();

  walk(root, root, (manifestPath) => {
    let manifest;
    try {
      manifest = readJsonFile(manifestPath);
    } catch (e) {
      results.push({
        manifestPath,
        installDir: normalizeRelPath(path.relative(root, path.dirname(manifestPath))),
        displayName: path.basename(path.dirname(manifestPath)),
        scanError: `invalid manifest: ${e.message}`,
      });
      return;
    }
    const skillId = manifest.skillId != null ? String(manifest.skillId) : '';
    const packageMd5 = String(manifest.packageMd5 || '').toLowerCase();
    if (!skillId || !/^\d+$/.test(skillId)) {
      results.push({
        manifestPath,
        installDir: normalizeRelPath(path.relative(root, path.dirname(manifestPath))),
        displayName: readSkillDisplayName(path.dirname(manifestPath)),
        skillId: skillId || null,
        scanError: 'missing or invalid skillId',
      });
      return;
    }
    if (!/^[0-9a-f]{32}$/.test(packageMd5)) {
      results.push({
        manifestPath,
        skillId,
        installDir: normalizeRelPath(path.relative(root, path.dirname(manifestPath))),
        displayName: readSkillDisplayName(path.dirname(manifestPath)),
        scanError: 'missing or invalid packageMd5',
      });
      return;
    }
    const installDir = normalizeRelPath(path.relative(root, path.dirname(manifestPath)));
    const displayName = readSkillDisplayName(path.dirname(manifestPath));
    const duplicateSkillId = skillIdIndex.has(skillId);
    skillIdIndex.set(skillId, (skillIdIndex.get(skillId) || 0) + 1);
    results.push({
      skillId,
      installDir,
      displayName,
      localMd5: packageMd5,
      currentVersion: manifest.currentVersion || null,
      manifestPath,
      duplicateSkillId,
    });
  });

  return results;
}

function walk(root, dir, onManifest) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() && ent.isFile() && ent.name === MANIFEST_NAME) {
      onManifest(path.join(dir, ent.name));
      continue;
    }
    if (!ent.isDirectory()) continue;
    if (EXCLUDE_DIRS.has(ent.name)) continue;
    walk(root, path.join(dir, ent.name), onManifest);
  }
}

export function scanManifestErrors(skillsRoot) {
  const root = path.resolve(skillsRoot);
  const errors = [];
  walk(root, root, (manifestPath) => {
    try {
      const manifest = readJsonFile(manifestPath);
      const skillId = manifest.skillId != null ? String(manifest.skillId) : '';
      const packageMd5 = String(manifest.packageMd5 || '').toLowerCase();
      if (!skillId || !/^\d+$/.test(skillId) || !/^[0-9a-f]{32}$/.test(packageMd5)) {
        errors.push({ manifestPath, skillId: skillId || null });
      }
    } catch {
      errors.push({ manifestPath, error: 'parse failed' });
    }
  });
  return errors;
}
