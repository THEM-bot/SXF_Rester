import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  BASE_URL_MAP,
  TOKEN_DIR,
  TOKEN_ENV,
  TOKEN_FILE,
  TOKEN_SUBDIR,
  ENV_REGISTRY,
  ENV_TOKEN_SLUG,
  deleteTokenFile as deleteTokenFileCore,
  maskToken,
  normalizeEnvironment,
  parseCli,
  publicEnvBaseUrl,
  publicEnvLabel,
  resolveBaseUrl,
  tokenFileForEnvironment,
  tokenStoreInfo,
  writeTokenFile,
} from '../../../../tools/lib/open-api-token.mjs';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const VERIFY_CJS = path.join(PACK_ROOT, 'scripts', 'verify-upload-response.cjs');
export const LEGACY_PACK_SESSION_PATH = path.join(PACK_ROOT, 'reference', 'upload-session.local.md');
export const SESSION_PATH = LEGACY_PACK_SESSION_PATH;

export {
  TOKEN_ENV,
  TOKEN_DIR,
  TOKEN_FILE,
  TOKEN_SUBDIR,
  ENV_TOKEN_SLUG,
  normalizeEnvironment,
  tokenFileForEnvironment,
  tokenStoreInfo,
  writeTokenFile,
  deleteTokenFileCore as deleteTokenFile,
  maskToken,
  parseCli,
  BASE_URL_MAP,
  resolveBaseUrl,
  publicEnvBaseUrl,
  publicEnvLabel,
};

export const SESSION_SUBDIR = path.join(TOKEN_DIR, 'sessions');

/** @param {string} [projectRoot] 用户 Demo 项目根路径（§1 已固定）；缺省为 process.cwd() */
export function normalizeProjectRoot(projectRoot) {
  const raw = projectRoot != null && String(projectRoot).trim() ? String(projectRoot).trim() : process.cwd();
  return path.resolve(raw);
}

/** 项目根路径 → 16 位 hex（跨平台稳定；Windows 路径先转小写） */
export function projectSlugForRoot(projectRoot) {
  const resolved = normalizeProjectRoot(projectRoot);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function projectLabelForRoot(projectRoot) {
  const root = normalizeProjectRoot(projectRoot);
  return path.basename(root) || root;
}

/** @param {Date} [date] */
export function formatMockZipTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${m}${d}${h}${min}${s}`;
}

/**
 * Default mock zip path under workspace root (P-192).
 * @param {string} workspaceRoot
 * @param {string} [projectName]
 * @param {Date} [date]
 */
export function defaultMockZipOut(workspaceRoot, projectName, date = new Date()) {
  const root = path.resolve(String(workspaceRoot));
  const label = (projectName && String(projectName).trim()) || 'demo';
  const ts = formatMockZipTimestamp(date);
  return path.join(root, `${label}-mock-${ts}.zip`);
}

/** @param {string} environment @param {string} [projectRoot] */
export function sessionFileForEnvironment(environment, projectRoot) {
  const env = normalizeEnvironment(environment);
  const envSlug = ENV_TOKEN_SLUG[env];
  const projSlug = projectSlugForRoot(projectRoot);
  return path.join(SESSION_SUBDIR, envSlug, projSlug);
}

function listProjectSessionsInEnv(envSlug) {
  const envDir = path.join(SESSION_SUBDIR, envSlug);
  if (!fs.existsSync(envDir)) return [];
  const st = fs.statSync(envDir);
  if (!st.isDirectory()) return [];
  return fs.readdirSync(envDir).map((slug) => {
    const file = path.join(envDir, slug);
    return { slug, file, exists: fs.existsSync(file) };
  });
}

/** @param {string} [environment] @param {string} [projectRoot] */
export function sessionStoreInfo(environment, projectRoot) {
  const isWin = process.platform === 'win32';
  if (environment && projectRoot) {
    const env = normalizeEnvironment(environment);
    const root = normalizeProjectRoot(projectRoot);
    const envSlug = ENV_TOKEN_SLUG[env];
    const projSlug = projectSlugForRoot(root);
    const file = sessionFileForEnvironment(env, root);
    return {
      environment: env,
      envSlug,
      projectRoot: root,
      projectLabel: projectLabelForRoot(root),
      projectSlug: projSlug,
      file,
      displayPath: isWin
        ? file
        : `~/.yanxiaotong/sessions/${envSlug}/${projSlug}`,
      exists: fs.existsSync(file),
    };
  }
  if (environment) {
    const env = normalizeEnvironment(environment);
    const envSlug = ENV_TOKEN_SLUG[env];
    const envDir = path.join(SESSION_SUBDIR, envSlug);
    const legacyFlat = envDir;
    const legacyFlatIsFile = fs.existsSync(legacyFlat) && fs.statSync(legacyFlat).isFile();
    return {
      environment: env,
      envSlug,
      dir: envDir,
      projects: listProjectSessionsInEnv(envSlug),
      legacyFlatFile: legacyFlatIsFile ? legacyFlat : null,
      displayPath: isWin ? envDir : `~/.yanxiaotong/sessions/${envSlug}/`,
    };
  }
  const perEnv = {};
  for (const [env, slug] of Object.entries(ENV_TOKEN_SLUG)) {
    const envDir = path.join(SESSION_SUBDIR, slug);
    const legacyFlatIsFile = fs.existsSync(envDir) && fs.statSync(envDir).isFile();
    perEnv[env] = {
      slug,
      dir: envDir,
      projects: listProjectSessionsInEnv(slug),
      legacyFlatFile: legacyFlatIsFile ? envDir : null,
    };
  }
  return {
    dir: SESSION_SUBDIR,
    perEnvironment: perEnv,
    legacyPackPath: LEGACY_PACK_SESSION_PATH,
    legacyPackExists: fs.existsSync(LEGACY_PACK_SESSION_PATH),
    displayPath: isWin ? SESSION_SUBDIR : '~/.yanxiaotong/sessions/',
  };
}

function readLegacyTokenFile() {
  if (!fs.existsSync(TOKEN_FILE)) return '';
  return fs.readFileSync(TOKEN_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
}

/** @param {string} [environment] demo 遗留包内会话迁移 */
export function readTokenFile(environment) {
  if (environment) {
    const envPath = tokenFileForEnvironment(environment);
    if (fs.existsSync(envPath)) {
      return fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').trim();
    }
    const legacy = readLegacyTokenFile();
    if (legacy) {
      const legacySession = readLegacyPackSession();
      if (legacySession && legacySession.last_environment === normalizeEnvironment(environment)) {
        writeTokenFile(legacy, environment);
        return legacy;
      }
    }
    return '';
  }
  return readLegacyTokenFile();
}

/** @param {{ cliToken?: string, environment?: string }} opts */
export function resolveToken(opts = {}) {
  const cli = String(opts.cliToken || '').trim();
  if (cli) return cli;
  const fromEnv = String(process.env[TOKEN_ENV] || '').trim();
  if (fromEnv) return fromEnv;
  const environment = String(opts.environment || '').trim();
  if (environment) {
    const fromFile = readTokenFile(environment);
    if (fromFile) return fromFile;
    return '';
  }
  const fromFile = readTokenFile();
  if (fromFile) return fromFile;
  const legacy = readLegacyToken();
  if (legacy) return legacy;
  return '';
}

function readLegacyToken() {
  if (!fs.existsSync(LEGACY_PACK_SESSION_PATH)) return '';
  for (const line of fs.readFileSync(LEGACY_PACK_SESSION_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^token:\s*(.*)$/);
    if (m) return m[1].trim();
  }
  return '';
}

function deleteLegacyPackSession() {
  if (fs.existsSync(LEGACY_PACK_SESSION_PATH)) fs.unlinkSync(LEGACY_PACK_SESSION_PATH);
}

function parseSessionText(text) {
  const s = {
    last_environment: '',
    project_root: '',
    d03: {},
    d04: {},
    updated_at: '',
  };
  let section = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const projectComment = line.match(/^#\s*project:\s*(.*)$/);
    if (projectComment) {
      s.project_root = projectComment[1].trim();
      continue;
    }
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (top && !/^\s/.test(line)) {
      section = top[1];
      const val = top[2].trim();
      if (section === 'last_environment' || section === 'updated_at') {
        s[section] = val;
      }
      continue;
    }
    const nested = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (nested && (section === 'd03' || section === 'd04')) {
      s[section][nested[1]] = nested[2].trim();
    }
  }
  return s;
}

function readLegacyPackSession() {
  if (!fs.existsSync(LEGACY_PACK_SESSION_PATH)) return null;
  return parseSessionText(fs.readFileSync(LEGACY_PACK_SESSION_PATH, 'utf8'));
}

function formatSessionText(data, environment) {
  const d03 = data.d03 || {};
  const d04 = data.d04 || {};
  const env = environment || data.last_environment || '';
  const root = data.project_root || '';
  const projSlug = root ? projectSlugForRoot(root) : '';
  return `# yanxiaotong-demo upload session (${env})
# token → ~/.yanxiaotong/tokens/（reference/upload/token-store.md）
# project: ${root}
# project_slug: ${projSlug}

last_environment: ${env}

d03:
  name: ${d03.name || ''}
  businessDomainId: ${d03.businessDomainId || ''}
  businessDomainName: ${d03.businessDomainName || ''}
  appServiceId: ${d03.appServiceId || ''}
  appServiceName: ${d03.appServiceName || ''}

d04:
  demo_id: ${d04.demo_id || ''}
  demo_code: ${d04.demo_code || ''}

updated_at: ${data.updated_at || ''}
`;
}

function migrateLegacyFlatSession(env, projectRoot) {
  const envSlug = ENV_TOKEN_SLUG[env];
  const flatPath = path.join(SESSION_SUBDIR, envSlug);
  if (!fs.existsSync(flatPath) || !fs.statSync(flatPath).isFile()) return null;
  const content = parseSessionText(fs.readFileSync(flatPath, 'utf8'));
  const root = normalizeProjectRoot(projectRoot);
  writeSession({ ...content, project_root: root }, env, root);
  fs.unlinkSync(flatPath);
  return { ...content, project_root: root };
}

/** @param {string} environment 生产|UAT|本地 @param {string} [projectRoot] */
export function readSession(environment, projectRoot) {
  const empty = {
    last_environment: '',
    project_root: '',
    d03: {},
    d04: {},
    updated_at: '',
  };
  if (!environment) return { ...empty };
  const env = normalizeEnvironment(environment);
  const root = normalizeProjectRoot(projectRoot);
  const file = sessionFileForEnvironment(env, root);
  if (fs.existsSync(file)) {
    const s = parseSessionText(fs.readFileSync(file, 'utf8'));
    s.project_root = s.project_root || root;
    return s;
  }
  const migratedFlat = migrateLegacyFlatSession(env, root);
  if (migratedFlat) return migratedFlat;
  const legacy = readLegacyPackSession();
  if (legacy && legacy.last_environment === env) {
    writeSession({ ...legacy, project_root: root }, env, root);
    deleteLegacyPackSession();
    return { ...legacy, project_root: root };
  }
  return { ...empty, last_environment: env, project_root: root };
}

/** @param {object} data @param {string} environment @param {string} [projectRoot] */
export function writeSession(data, environment, projectRoot) {
  const env = normalizeEnvironment(environment);
  const root = normalizeProjectRoot(projectRoot || data.project_root);
  const file = sessionFileForEnvironment(env, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    ...data,
    last_environment: env,
    project_root: root,
  };
  fs.writeFileSync(file, formatSessionText(payload, env), 'utf8');
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* ignore */
    }
  }
}

/** @param {string} [environment] @param {string} [projectRoot] 无参时清除全部环境会话 + 遗留包内文件 */
export function clearSession(environment, projectRoot) {
  if (environment && projectRoot) {
    const f = sessionFileForEnvironment(environment, projectRoot);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return;
  }
  if (environment) {
    const envSlug = ENV_TOKEN_SLUG[normalizeEnvironment(environment)];
    const envDir = path.join(SESSION_SUBDIR, envSlug);
    if (fs.existsSync(envDir)) {
      fs.rmSync(envDir, { recursive: true, force: true });
    }
    return;
  }
  if (fs.existsSync(SESSION_SUBDIR)) {
    fs.rmSync(SESSION_SUBDIR, { recursive: true, force: true });
  }
  deleteLegacyPackSession();
}

/** 解析 D04 标识：数字 demoId / demoCode / 访问链接 ?d= */
export function parseD04Identifier(input) {
  const t = String(input || '').trim();
  if (!t) return { pathParam: '', demoId: '', demoCode: '' };
  const urlMatch = t.match(/[?&]d=(\d+)/);
  if (urlMatch) return { pathParam: urlMatch[1], demoId: urlMatch[1], demoCode: '' };
  if (/^\d+$/.test(t)) return { pathParam: t, demoId: t, demoCode: '' };
  if (/^DEMO-/i.test(t)) return { pathParam: t, demoId: '', demoCode: t };
  return { pathParam: t, demoId: '', demoCode: '' };
}

/** D04 上传路径参数：CLI → session.demo_id → session.demo_code */
export function resolveD04PathParam(cliValue, session) {
  const fromCli = parseD04Identifier(cliValue);
  if (fromCli.pathParam) return fromCli.pathParam;
  const d04 = session?.d04 || {};
  return d04.demo_id || d04.demo_code || '';
}

/** Demo 预览页源站（仅最终 accessUrl 展示；上传/元数据 API 仍用 BASE_URL_MAP） */
export const PREVIEW_ORIGIN_MAP = Object.freeze({
  本地: ENV_REGISTRY.local.web_origin,
  UAT: ENV_REGISTRY.uat.web_origin,
  生产: ENV_REGISTRY.prod.web_origin,
});

/**
 * 将 API 返回的 accessUrl 重写为用户可访问的预览地址（含本地 localhost:5173）。
 * @param {string} environment 生产|UAT|本地
 * @param {string} accessUrl API 原始 accessUrl
 */
export function rewriteAccessUrlForPreview(environment, accessUrl) {
  const raw = String(accessUrl || '').trim();
  const origin = PREVIEW_ORIGIN_MAP[environment];
  if (!origin || !raw) return raw;
  try {
    const u = new URL(raw);
    return `${origin.replace(/\/$/, '')}${u.pathname}${u.search}${u.hash}`;
  } catch {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${origin.replace(/\/$/, '')}${path}`;
  }
}

/**
 * 去掉全屏标志（`f`/`expFs`）。
 * 开放 API 常返回 `…&exp=1&pv=…&f=1`；从对话深链打开全屏时 iframe 资源未就绪易显整页空白。
 * 交付用户改用抽屉体验链（同 `buildDemoExperienceDrawerShareUrl`）。
 * @param {string} accessUrl
 */
export function stripExperienceFullscreenFlags(accessUrl) {
  const raw = String(accessUrl || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const exp = u.searchParams.get('exp');
    if (exp === '1' || exp === 'true') {
      u.searchParams.delete('f');
      u.searchParams.delete('expFs');
      return u.toString();
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

/**
 * 交付用户前的最终访问链：预览源站重写 + 去掉全屏。
 * @param {string} environment
 * @param {string} accessUrl
 */
export function normalizeAccessUrlForDelivery(environment, accessUrl) {
  return stripExperienceFullscreenFlags(rewriteAccessUrlForPreview(environment, accessUrl));
}

/**
 * Demo 详情分享链（仅 `?d=`，不自动进体验，避免空白 iframe）。
 * @param {string} environment
 * @param {string} demoId
 */
export function buildDemoDetailShareUrl(environment, demoId) {
  const id = String(demoId || '').trim();
  if (!id) return '';
  const origin = (PREVIEW_ORIGIN_MAP[environment] || '').replace(/\/$/, '');
  if (!origin) return '';
  return `${origin}/app/requirements/demos?d=${encodeURIComponent(id)}`;
}

export function verifyResponseJson(jsonText, { noVerify = false } = {}) {
  if (noVerify) return;
  const tmp = path.join(os.tmpdir(), `yxt-verify-${Date.now()}.json`);
  fs.writeFileSync(tmp, jsonText, 'utf8');
  try {
    const r = spawnSync(process.execPath, [VERIFY_CJS, tmp], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || 'verify-upload-response failed');
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
