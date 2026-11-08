/**
 * 找研效通技能包在哪 + 存"只用配一次"的默认值。
 *
 * 为什么要找：研效通那套 CLI 不是 npm 包，是解压在某个目录里的技能包。
 * 用户机器上可能有多份（解压目录 / 已安装到 profile 的 skills 目录），
 * 所以按优先级探测，探到哪个用哪个，并允许显式覆盖。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本插件包根（pm-flow/） */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, '..', '..');

/** 判定一个目录是不是研效通包根：有 router/ 且有 requirement 子包的 CLI */
export function isYxtRoot(dir) {
  if (!dir) return false;
  const cli = path.join(dir, 'packages', 'requirement', 'tools', 'requirement-api.mjs');
  return fs.existsSync(cli);
}

function envRoot() {
  return process.env.YXT_ROOT || process.env.YANXIAOTONG_ROOT || '';
}

function configRoot() {
  try {
    const cfg = readConfig();
    return cfg.root || '';
  } catch {
    return '';
  }
}

/**
 * 在父目录下浅扫两层，找有没有研效通包。
 * 用户把包解压在 Plugins/_extracted/xxx/xxx/yanxiaotong-skills 这种地方，
 * 层级不固定，所以按「最多两层」扫一遍，命中就返回。
 */
function shallowScan(baseDir) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth < 0) return;
    if (isYxtRoot(dir)) {
      hits.push(dir);
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.name === 'projects' || e.name === 'vendor') continue;
      walk(path.join(dir, e.name), depth - 1);
    }
  };
  walk(baseDir, 2);
  return hits;
}

/**
 * 候选路径：显式参数 > 环境变量 > 配置文件 > 常见位置 > 浅扫。
 */
export function candidateRoots(explicit) {
  const home = os.homedir();
  const desk = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : path.join(home, 'Desktop');
  const list = [
    explicit,
    envRoot(),
    configRoot(),
    // 插件自己所在的 Plugins 目录（最常见的解压位置）
    path.join(PACKAGE_ROOT, '..', '_extracted', 'yanxiaotong-skills-skill', 'yanxiaotong-skills-skill', 'yanxiaotong-skills'),
    path.join(desk, 'Plugins', '_extracted', 'yanxiaotong-skills-skill', 'yanxiaotong-skills-skill', 'yanxiaotong-skills'),
    path.join('D:\\Users\\SXF-Admin\\Desktop\\Plugins', '_extracted', 'yanxiaotong-skills-skill', 'yanxiaotong-skills-skill', 'yanxiaotong-skills'),
    path.join(desk, 'Plugins', 'yanxiaotong-skills'),
    path.join(home, '.dsh', 'skills', 'yanxiaotong-skills'),
    path.join(home, '.dsh', 'profiles', 'desktop', 'skills', 'yanxiaotong-skills'),
    path.join(home, '.claude', 'skills', 'yanxiaotong-skills'),
  ].filter(Boolean);

  const out = [...new Set(list)];
  // 常见位置都不中时，浅扫两个可能的父目录
  if (!out.some((d) => isYxtRoot(d))) {
    for (const base of [path.join(PACKAGE_ROOT, '..'), path.join(desk, 'Plugins'), path.join(home, '.dsh', 'skills')]) {
      out.push(...shallowScan(base));
    }
  }
  return [...new Set(out)];
}

/** 返回 { root, source } 或 null */
export function findYxtRoot(explicit) {
  if (explicit && isYxtRoot(explicit)) return { root: path.resolve(explicit), source: '参数' };
  if (envRoot() && isYxtRoot(envRoot())) return { root: path.resolve(envRoot()), source: '环境变量 YXT_ROOT' };
  if (configRoot() && isYxtRoot(configRoot())) return { root: path.resolve(configRoot()), source: '配置文件' };
  for (const dir of candidateRoots(null)) {
    if (isYxtRoot(dir)) return { root: path.resolve(dir), source: '自动探测' };
  }
  return null;
}

/** 所有探测到的可用路径（doctor 用） */
export function allRoots(explicit) {
  const out = [];
  for (const dir of candidateRoots(explicit)) {
    if (isYxtRoot(dir)) out.push(path.resolve(dir));
  }
  return [...new Set(out)];
}

/* ============================ 配置文件 ============================ */

export function configFile() {
  return path.join(os.homedir(), '.pm-flow', 'yxt.json');
}

export function readConfig() {
  const file = configFile();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  const file = configFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8' });
  return next;
}

/** 常用默认值：建需求/任务时能省掉的必填项 */
export const CONFIG_KEYS = [
  'root',
  'businessDomainId',
  'projectId',
  'appServiceId',
  'requirementLevel',
  'taskPhase',
  'taskCategory',
  'teamId',
  'submitterName',
  'employeeId',
  'owners',
];

/** 取默认值（配置 + 兜底） */
export function defaults() {
  const cfg = readConfig();
  return {
    root: cfg.root || '',
    businessDomainId: cfg.businessDomainId || '',
    projectId: cfg.projectId || '',
    appServiceId: cfg.appServiceId || '',
    requirementLevel: cfg.requirementLevel || 'Story',
    taskPhase: cfg.taskPhase || '开发阶段',
    taskCategory: cfg.taskCategory || '开发编码',
    teamId: cfg.teamId || '',
    submitterName: cfg.submitterName || '',
    employeeId: cfg.employeeId || '',
    owners: Array.isArray(cfg.owners) ? cfg.owners : [],
  };
}
