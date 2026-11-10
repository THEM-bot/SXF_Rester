/**
 * P-229：工作区文档路径别名解析（@efficiency-hub-doc → 绝对路径）
 */
import fs from 'node:fs';
import path from 'node:path';

const ALIAS_PREFIXES = ['@efficiency-hub-doc/', 'efficiency-hub-doc/'];

/** 自 cwd 向上查找含 efficiency-hub-doc 的目录 */
export function findDocRepositoryRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const direct = path.join(dir, 'efficiency-hub-doc');
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      return direct;
    }
    const nested = path.join(dir, 'efficiency-hub', 'efficiency-hub-doc');
    if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
      return nested;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * @param {string} input 用户 @ 路径或相对路径
 * @returns {{ resolved: string, usedAlias: boolean, docRoot: string | null }}
 */
export function resolveDocPath(input) {
  const raw = String(input || '').trim().replace(/\\/g, '/');
  if (!raw) {
    throw new Error('路径不能为空');
  }

  let normalized = raw;
  if (normalized.startsWith('@')) normalized = normalized.slice(1);

  for (const prefix of ALIAS_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized === prefix.replace(/\/$/, '')) {
      const docRoot = findDocRepositoryRoot();
      if (!docRoot) {
        throw new Error(
          '未找到 efficiency-hub-doc 目录；请从含该目录的工作区运行，或改用绝对路径',
        );
      }
      const rel = normalized.slice(prefix.replace(/\/$/, '').length).replace(/^\//, '');
      return { resolved: path.join(docRoot, rel), usedAlias: true, docRoot };
    }
  }

  if (path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) {
    return { resolved: path.resolve(raw), usedAlias: false, docRoot: findDocRepositoryRoot() };
  }

  const docRoot = findDocRepositoryRoot();
  if (docRoot && !normalized.includes('..')) {
    const fromRoot = path.join(docRoot, normalized);
    if (fs.existsSync(fromRoot)) {
      return { resolved: fromRoot, usedAlias: true, docRoot };
    }
  }

  return { resolved: path.resolve(raw), usedAlias: false, docRoot };
}
