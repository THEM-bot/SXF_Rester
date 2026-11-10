import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractIntentPrefix } from './intent-prefix.mjs';

/** 开放 API 令牌 · 父包公共（SSOT：router/token-store.md） */
export const TOKEN_ENV = 'YXT_OPEN_API_TOKEN';
export const TOKEN_DIR = path.join(os.homedir(), '.yanxiaotong');
export const TOKEN_FILE = path.join(TOKEN_DIR, 'YXT_OPEN_API_TOKEN');
export const TOKEN_SUBDIR = path.join(TOKEN_DIR, 'tokens');
export const SELECTED_ENV_FILE = path.join(TOKEN_DIR, 'sessions', 'selected-env.json');

/** 环境地址唯一维护处（改 UAT/生产 URL 只改此文件） */
export const ENV_REGISTRY_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env-registry.json');

function loadEnvRegistryFile() {
  const raw = JSON.parse(fs.readFileSync(ENV_REGISTRY_FILE, 'utf8').replace(/^\uFEFF/, ''));
  const envs = raw && raw.envs;
  if (!raw?.DEFAULT_ENV_SLUG || !envs?.local || !envs?.uat || !envs?.prod) {
    throw new Error(`Invalid env-registry.json: ${ENV_REGISTRY_FILE}`);
  }
  return raw;
}

const ENV_FILE = loadEnvRegistryFile();

function freezeEnv(cfg) {
  return Object.freeze({ ...cfg });
}

/** 环境注册表（数据 SSOT：tools/lib/env-registry.json · Agent 纪律见 router/public-env.md） */
export const ENV_REGISTRY = Object.freeze({
  local: freezeEnv(ENV_FILE.envs.local),
  uat: freezeEnv(ENV_FILE.envs.uat),
  prod: freezeEnv(ENV_FILE.envs.prod),
});

/** Q25 默认环境（SSOT：env-registry.json）；未指定时一律生产，不沿用本地上次环境 */
export const DEFAULT_ENV_SLUG = ENV_FILE.DEFAULT_ENV_SLUG;

/** @deprecated 使用 getActiveEnv()；保留兼容探针 */
export const PUBLIC_ENV = ENV_REGISTRY[DEFAULT_ENV_SLUG];

export const ENV_TOKEN_SLUG = Object.freeze({
  本地: 'local',
  UAT: 'uat',
  生产: 'prod',
});

export const ENV_MENU_INDEX = Object.freeze({
  1: 'local',
  2: 'uat',
  3: 'prod',
});

export const BASE_URL_MAP = Object.freeze({
  本地: ENV_REGISTRY.local.base_url,
  UAT: ENV_REGISTRY.uat.base_url,
  生产: ENV_REGISTRY.prod.base_url,
});

export function getEnvConfig(envSlugOrLabel) {
  const key = String(envSlugOrLabel || '').trim();
  if (ENV_REGISTRY[key]) return ENV_REGISTRY[key];
  const slug = ENV_TOKEN_SLUG[key];
  if (slug && ENV_REGISTRY[slug]) return ENV_REGISTRY[slug];
  throw new Error(`Unknown environment: ${envSlugOrLabel}`);
}

export function getEnvByMenuIndex(index) {
  const slug = ENV_MENU_INDEX[String(index).trim()];
  if (!slug) throw new Error(`Unknown environment menu index: ${index}`);
  return ENV_REGISTRY[slug];
}

export function listEnvConfigs() {
  return [ENV_REGISTRY.local, ENV_REGISTRY.uat, ENV_REGISTRY.prod];
}

export function readSelectedEnv() {
  if (!fs.existsSync(SELECTED_ENV_FILE)) return ENV_REGISTRY[DEFAULT_ENV_SLUG];
  try {
    const raw = JSON.parse(fs.readFileSync(SELECTED_ENV_FILE, 'utf8').replace(/^\uFEFF/, ''));
    const slug = raw.env_slug || ENV_TOKEN_SLUG[raw.env_label];
    if (slug && ENV_REGISTRY[slug]) {
      return { ...ENV_REGISTRY[slug], ...raw, env_slug: slug };
    }
  } catch {
    /* fall through */
  }
  return ENV_REGISTRY[DEFAULT_ENV_SLUG];
}

/**
 * 从用户首句解析环境；无匹配返回 null（Q22 · Agent/CLI 共用）
 * 仅扫意图前缀（标题/内容/### 之前）；前缀内多个环境词取**最早出现**者。
 */
export function parseEnvFromUserText(text) {
  const t = extractIntentPrefix(text);
  if (!t) return null;

  const patterns = [
    { re: /本地环境|本地|\blocal\b/gi, env: ENV_REGISTRY.local },
    { re: /UAT环境|\buat\b|预发/gi, env: ENV_REGISTRY.uat },
    { re: /生产环境|生产|\bprod\b/gi, env: ENV_REGISTRY.prod },
  ];

  let best = null;
  for (const { re, env } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (!m) continue;
    if (!best || m.index < best.index) {
      best = { index: m.index, env };
    }
  }
  return best ? best.env : null;
}

/**
 * 父包 @ 入口环境（Q22 · Q24 · Q25）
 * - 当轮首句有环境词（UAT / 本地 / 生产）→ 用之并 write（env_source: user_text）
 * - 否则 → **一律默认生产**并 write（env_source: default）
 * - **禁止**读取 selected-env.json 作为上一轮环境记忆
 */
export function resolveEntryEnv(userText) {
  const parsed = parseEnvFromUserText(userText);
  if (parsed) {
    writeSelectedEnv(parsed.env_label);
    return { ...parsed, env_source: 'user_text' };
  }

  const cfg = ENV_REGISTRY[DEFAULT_ENV_SLUG];
  writeSelectedEnv(cfg.env_label);
  return { ...cfg, env_source: 'default' };
}

/** 入口环境说明后缀（T-FIRST-SCREEN · handoff） */
export function envSourceSuffix(envSource) {
  if (envSource === 'user_text') return '（您本次指定）';
  if (envSource === 'switched') return '（已切换）';
  return '（默认生产）';
}

export function writeSelectedEnv(environment) {
  const cfg = getEnvConfig(environment);
  fs.mkdirSync(path.dirname(SELECTED_ENV_FILE), { recursive: true });
  fs.writeFileSync(
    SELECTED_ENV_FILE,
    `${JSON.stringify(
      {
        env_slug: cfg.env_slug,
        env_label: cfg.env_label,
        base_url: cfg.base_url,
        requirement_api: cfg.requirement_api,
        original_requirement_api: cfg.original_requirement_api,
        task_api: cfg.task_api,
        defect_api: cfg.defect_api,
        org_todo_api: cfg.org_todo_api,
        problem_ticket_api: cfg.problem_ticket_api,
        updated_at: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return cfg;
}

export function getActiveEnv() {
  return readSelectedEnv();
}

export function normalizeEnvironment(environment) {
  const e = String(environment || '').trim();
  if (!ENV_TOKEN_SLUG[e]) throw new Error(`Unknown environment: ${e}`);
  return e;
}

export function tokenFileForEnvironment(environment) {
  const env = normalizeEnvironment(environment);
  return path.join(TOKEN_SUBDIR, ENV_TOKEN_SLUG[env]);
}

export function resolveBaseUrl(environment) {
  if (!environment) return getActiveEnv().base_url;
  return getEnvConfig(environment).base_url;
}

export function publicEnvBaseUrl() {
  return getActiveEnv().base_url;
}

export function publicEnvLabel() {
  return getActiveEnv().env_label;
}

function secureTokenFile(filePath) {
  if (process.platform === 'win32') {
    const user = process.env.USERNAME || process.env.USER;
    if (user) {
      spawnSync('icacls', [filePath, '/inheritance:r', '/grant:r', `${user}:F`], {
        stdio: 'ignore',
        windowsHide: true,
      });
    }
  } else {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      /* ignore */
    }
  }
}

function readLegacyTokenFile() {
  if (!fs.existsSync(TOKEN_FILE)) return '';
  return fs.readFileSync(TOKEN_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
}

function deleteLegacyTokenFile() {
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
}

/** @param {string} [environment] */
export function readTokenFile(environment) {
  if (environment) {
    const envPath = tokenFileForEnvironment(environment);
    if (fs.existsSync(envPath)) {
      return fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').trim();
    }
    const legacy = readLegacyTokenFile();
    if (legacy && environment === publicEnvLabel()) {
      writeTokenFile(legacy, environment);
      deleteLegacyTokenFile();
      return legacy;
    }
    return '';
  }
  return readLegacyTokenFile();
}

/** @param {string} token @param {string} [environment] */
export function writeTokenFile(token, environment) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Token is empty');
  const target = environment ? tokenFileForEnvironment(environment) : TOKEN_FILE;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (process.platform === 'win32' && fs.existsSync(target)) {
    const user = process.env.USERNAME || process.env.USER;
    if (user) {
      spawnSync('icacls', [target, '/grant', `${user}:F`], {
        stdio: 'ignore',
        windowsHide: true,
      });
    }
  }
  const writeOpts =
    process.platform === 'win32' ? { encoding: 'utf8' } : { encoding: 'utf8', mode: 0o600 };
  fs.writeFileSync(target, `${t}\n`, writeOpts);
  secureTokenFile(target);
  if (environment) deleteLegacyTokenFile();
  return target;
}

/** @param {string} [environment] */
export function deleteTokenFile(environment) {
  if (environment) {
    const p = tokenFileForEnvironment(environment);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  if (fs.existsSync(TOKEN_SUBDIR)) {
    for (const slug of Object.values(ENV_TOKEN_SLUG)) {
      const p = path.join(TOKEN_SUBDIR, slug);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  deleteLegacyTokenFile();
}

export function tokenStoreInfo(environment) {
  const isWin = process.platform === 'win32';
  const base = {
    env: TOKEN_ENV,
    dir: TOKEN_DIR,
    tokensDir: TOKEN_SUBDIR,
    platform: process.platform,
    homedir: os.homedir(),
    legacyFile: TOKEN_FILE,
    selectedEnvFile: SELECTED_ENV_FILE,
    activeEnv: getActiveEnv(),
  };
  if (environment) {
    const env = normalizeEnvironment(environment);
    const file = tokenFileForEnvironment(env);
    return {
      ...base,
      environment: env,
      slug: ENV_TOKEN_SLUG[env],
      file,
      displayPath: isWin ? file : `~/.yanxiaotong/tokens/${ENV_TOKEN_SLUG[env]}`,
      exists: fs.existsSync(file),
    };
  }
  const perEnv = {};
  for (const [env, slug] of Object.entries(ENV_TOKEN_SLUG)) {
    const file = path.join(TOKEN_SUBDIR, slug);
    perEnv[env] = { slug, file, exists: fs.existsSync(file) };
  }
  return {
    ...base,
    perEnvironment: perEnv,
    legacyExists: fs.existsSync(TOKEN_FILE),
    displayPath: isWin ? TOKEN_SUBDIR : '~/.yanxiaotong/tokens/',
  };
}

/** @param {{ cliToken?: string, environment?: string }} opts */
export function resolveToken(opts = {}) {
  const cli = String(opts.cliToken || '').trim();
  if (cli) return cli;
  const fromEnv = String(process.env[TOKEN_ENV] || '').trim();
  if (fromEnv) return fromEnv;
  const environment = String(opts.environment || getActiveEnv().env_label || '').trim();
  if (environment) {
    const fromFile = readTokenFile(environment);
    if (fromFile) return fromFile;
    return '';
  }
  return readTokenFile() || '';
}

export function maskToken(token) {
  const t = String(token || '').trim();
  if (!t) return '（未配置）';
  if (t.length <= 12) return 'ehub_live_…****';
  return `${t.slice(0, 9)}…${t.slice(-4)}`;
}

/** @param {string[]} argv */
export function parseCli(argv) {
  /** @type {Record<string, string|boolean|string[]>} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('-')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}
