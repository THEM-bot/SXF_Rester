import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const PARENT_ROOT = path.resolve(PACK_ROOT, '..', '..');
export const SKILL_INSTALL_SCRIPTS = path.resolve(PARENT_ROOT, '..', 'skill-install', 'scripts');

export const MANIFEST_NAME = 'skill-package.manifest.json';
export const REGISTRY_NAME = '.yanxiaotong-installed.json';
export const EXCLUDE_DIRS = new Set(['.sync-staging', 'node_modules', '.git', '.svn']);

export function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

export function readJsonFile(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')));
}

export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function normalizeRelPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export function resolveSkillsRoot({ skillsRoot, projectRoot = process.cwd() } = {}) {
  if (skillsRoot) {
    const abs = path.isAbsolute(skillsRoot)
      ? path.resolve(skillsRoot)
      : path.resolve(projectRoot, skillsRoot);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`skillsRoot not found: ${abs}`);
    }
    return abs;
  }
  return detectSkillsRoot(projectRoot);
}

function detectSkillsRoot(projectRoot) {
  const candidates = [
    path.join(projectRoot, '.cursor', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(os.homedir(), '.cursor', 'skills'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return path.resolve(c);
  }
  try {
    const ps1 = path.join(SKILL_INSTALL_SCRIPTS, 'install.ps1');
    if (fs.existsSync(ps1) && process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Detect -ProjectRoot "${projectRoot}"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const json = JSON.parse(out.trim());
      if (json.installSkillsRoot) {
        const rel = String(json.installSkillsRoot).replace(/^\.\//, '');
        const abs = path.resolve(projectRoot, rel);
        if (fs.existsSync(abs)) return abs;
      }
    }
  } catch {
    /* fallback below */
  }
  throw new Error(
    'Cannot detect skillsRoot; pass --skills-root (e.g. .cursor/skills)'
  );
}

export function findSkillMdDir(rootDir) {
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isFile() && ent.name === 'SKILL.md') return dir;
      if (ent.isDirectory() && !EXCLUDE_DIRS.has(ent.name)) queue.push(full);
    }
  }
  return null;
}

export function readSkillDisplayName(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return path.basename(skillDir);
  const content = fs.readFileSync(skillMd, 'utf8');
  const m = content.match(/^name:\s*(.+)\s*$/m);
  return m ? m[1].trim() : path.basename(skillDir);
}

/** 目录名片段：去掉 Windows/跨平台非法字符；拒绝 `.` / `..`（防路径穿越） */
export function sanitizeDirSegment(name) {
  const cleaned =
    String(name || 'skill')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'skill';
  if (cleaned === '.' || cleaned === '..') return 'skill';
  return cleaned;
}

/**
 * 断言 targetAbs 位于 root 之内（严格子路径，不含 root 自身）。
 * 用 path.relative，避免 path.join(root, '..') 越界写删。
 */
export function assertPathInsideRoot(root, targetAbs) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(targetAbs);
  const rel = path.relative(rootAbs, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error(`path escapes skillsRoot: ${abs}`);
    err.code = 'PATH_ESCAPE';
    throw err;
  }
  return abs;
}

export function isPathInsideRoot(root, targetAbs) {
  try {
    assertPathInsideRoot(root, targetAbs);
    return true;
  } catch {
    return false;
  }
}

/**
 * 安装目录名 SSOT：有 skillId 时为 `{技能包名}-{skillId}`；无 manifest 时回退纯包名。
 * 同 skillId 重装落同一目录 → 覆盖。
 */
export function resolveInstallDirName(skillName, skillId) {
  const base = sanitizeDirSegment(skillName);
  const id = skillId != null && String(skillId).trim() !== '' ? String(skillId).trim() : '';
  if (id && !/^\d+$/.test(id)) {
    const err = new Error(`invalid skillId: ${id}`);
    err.code = 'INVALID_SKILL_ID';
    throw err;
  }
  return id ? `${base}-${id}` : base;
}

export function readManifestFromSkillDir(skillDir) {
  const manifestPath = path.join(skillDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return readJsonFile(manifestPath);
  } catch {
    return null;
  }
}

/** 落盘后校验：manifest 必须存在且 packageMd5 与预期一致（登记写入前置条件） */
export function assertDiskPackageMd5(skillDirAbs, expectedMd5) {
  const manifest = readManifestFromSkillDir(skillDirAbs);
  if (!manifest) {
    const err = new Error('manifest missing on disk after install/update');
    err.code = 'VERIFY_FAILED';
    throw err;
  }
  const diskMd5 = String(manifest.packageMd5 || '').toLowerCase();
  const expected = String(expectedMd5 || '').toLowerCase();
  if (!diskMd5 || diskMd5 !== expected) {
    const err = new Error(
      `disk manifest MD5 mismatch: ${diskMd5 || 'empty'} !== ${expected || 'empty'}`
    );
    err.code = 'VERIFY_FAILED';
    throw err;
  }
  return manifest;
}
