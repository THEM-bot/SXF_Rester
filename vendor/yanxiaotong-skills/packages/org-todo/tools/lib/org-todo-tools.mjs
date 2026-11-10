import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  getActiveEnv,
  parseCli,
  publicEnvBaseUrl,
  publicEnvLabel,
  resolveToken,
} from '../../../../tools/lib/open-api-token.mjs';
import { fetchWithRetry } from '../../../../tools/lib/http-json.mjs';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const VERIFY_CJS = path.join(PACK_ROOT, 'scripts', 'verify-org-todo-response.cjs');

export function sessionFilePath() {
  const env = getActiveEnv();
  return path.join(os.homedir(), '.yanxiaotong', 'sessions', env.env_slug, 'org-todo');
}

export { parseCli, publicEnvBaseUrl, publicEnvLabel, resolveToken, getActiveEnv };

export function resolveBaseUrl(cliBase) {
  const b = String(cliBase || '').trim();
  return b || publicEnvBaseUrl();
}

export function stripBomText(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

export function parseJsonText(text) {
  return JSON.parse(stripBomText(text));
}

export function stringifyFields(obj, fields) {
  const out = { ...(obj || {}) };
  for (const field of fields || []) {
    if (out[field] == null || out[field] === '') continue;
    // 数组字段须逐元素 String，禁止 String(array) 压成标量（会导致 Jackson 反序列化失败）
    if (Array.isArray(out[field])) {
      out[field] = out[field].map((x) => (x == null ? x : String(x)));
    } else {
      out[field] = String(out[field]);
    }
  }
  return out;
}

export async function httpJson(method, urlPath, { token, body, baseUrl } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const t =
    token ||
    resolveToken({ environment: publicEnvLabel() }) ||
    (() => {
      throw new Error('No token');
    })();
  const url = `${base.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
  const init = {
    method,
    headers: {
      'X-Open-Api-Token': t,
      Accept: 'application/json',
    },
  };
  if (body != null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetchWithRetry(() => fetch(url, init), { method, urlPath });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.success === false || (json.code != null && json.code !== 200 && json.code !== '200')) {
    const msg = json.message || json.msg || text.slice(0, 300);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function readSessionFile() {
  const file = sessionFilePath();
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const data = {
    last_create_defaults: {},
    last_org_todo: {},
    last_list_filters: {},
    token_user: {},
  };
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (top && !/^\s/.test(line)) {
      section = top[1];
      if (section === 'updated_at') data.updated_at = top[2].trim();
      continue;
    }
    const nested = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (!nested) continue;
    if (section === 'last_create_defaults') data.last_create_defaults[nested[1]] = nested[2].trim();
    if (section === 'last_org_todo') data.last_org_todo[nested[1]] = nested[2].trim();
    if (section === 'last_list_filters') data.last_list_filters[nested[1]] = nested[2].trim();
    if (section === 'token_user') data.token_user[nested[1]] = nested[2].trim();
  }
  return data;
}

export function writeSessionFile(data) {
  const d = data || {};
  const defs = d.last_create_defaults || {};
  const todo = d.last_org_todo || {};
  const filters = d.last_list_filters || {};
  const tu = d.token_user || {};
  const env = getActiveEnv();
  const file = sessionFilePath();
  const text = `# org-todo session (${env.env_label})
last_create_defaults:
  businessDomain: ${defs.businessDomain || ''}
  businessDomainName: ${defs.businessDomainName || ''}
  projectId: ${defs.projectId || ''}
  projectName: ${defs.projectName || ''}
  owners: ${defs.owners || ''}
last_org_todo:
  orgTodoNo: ${todo.orgTodoNo || ''}
  orgTodoId: ${todo.orgTodoId || ''}
  title: ${todo.title || ''}
token_user:
  employeeId: ${tu.employeeId || ''}
  name: ${tu.name || ''}
last_list_filters:
  filtersJson: ${filters.filtersJson || ''}
updated_at: ${new Date().toISOString()}
`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

export function printPickList(records, { labelKey = 'name', idKey = 'id', extra, hideId = true } = {}) {
  console.log('[yanxiaotong-org-todo metadata]');
  console.log(`- total: ${records.length}`);
  if (!records.length) {
    console.log('- status: no records (do not type id manually)');
    return [];
  }
  console.log('\nPick one (reply with index number):');
  const picks = records.map((rec, i) => {
    const label = rec[labelKey] ?? rec.title ?? rec.name ?? '';
    const id = rec[idKey] ?? rec.id ?? rec.employeeId ?? '';
    const extraTxt = extra ? extra(rec) : '';
    const line = hideId
      ? `${i + 1}. ${label}${extraTxt ? ` ${extraTxt}` : ''}`
      : `${i + 1}. ${label}${extraTxt ? ` ${extraTxt}` : ''} (id: ${id})`;
    console.log(line);
    return {
      index: i + 1,
      id: id != null && id !== '' ? String(id) : '',
      name: String(label || ''),
      employeeId: rec.employeeId != null ? String(rec.employeeId) : undefined,
    };
  });
  return picks;
}

export function resolveOutPath(args) {
  const out = args.out;
  if (out == null || out === '' || out === false) return null;
  if (out === true) throw new Error('--out 缺少文件路径');
  return String(out);
}

export function readJsonArg(jsonPath) {
  if (!jsonPath) throw new Error('--json is required');
  const raw = jsonPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(jsonPath, 'utf8');
  return parseJsonText(raw);
}

export function plainTextToDescriptionHtml(text) {
  const t = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!t) return '';
  const escaped = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parts = escaped
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map((p) => `<p>${p}</p>`).join('');
}

export function progressTextToBodyHtml(text) {
  return plainTextToDescriptionHtml(text);
}

/** 从提出人展示串解析工号（如「高欢鑫47420 47420」或「张三（47420）」） */
export function parseEmployeeIdFromDisplay(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const paren = s.match(/（\s*([A-Za-z0-9]+)\s*）|\(\s*([A-Za-z0-9]+)\s*\)/);
  if (paren) return (paren[1] || paren[2] || '').trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^[A-Za-z0-9]+$/.test(parts[parts.length - 1])) {
    return parts[parts.length - 1];
  }
  const trailing = s.match(/(\d{4,})\s*$/);
  return trailing ? trailing[1] : '';
}

export function formatOwnerDisplay(owner) {
  if (owner == null) return '—';
  if (typeof owner === 'string') return unwrapEmployeeIdParens(owner);
  const name = owner.name || owner.employeeName || owner.ownerName || '';
  const id = owner.employeeId || owner.ownerId || owner.id || '';
  if (name && id) {
    const nameClean = unwrapEmployeeIdParens(String(name));
    // 姓名已含工号时不重复
    if (nameClean.includes(String(id))) return nameClean.replace(/\s+/g, '');
    return `${nameClean.replace(/\s+/g, '')}${id}`;
  }
  return unwrapEmployeeIdParens(name || id || '—');
}

/** 去掉「姓名（工号）」类括号，统一为姓名工号 */
export function unwrapEmployeeIdParens(text) {
  return String(text || '')
    .replace(/（\s*([A-Za-z0-9]+)\s*）/g, '$1')
    .replace(/\(\s*([A-Za-z0-9]+)\s*\)/g, '$1')
    .trim();
}

/** 今天 + 1 个月 → yyyy-MM-dd（本地日历） */
export function defaultPlannedCloseAt(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 会话领域/项目是否可沿用询问（至少一组 id+名称成对） */
export function hasReusableDomainProjectDefaults(defs = {}) {
  const hasDomain = Boolean(String(defs.businessDomain || '').trim() && String(defs.businessDomainName || '').trim());
  const hasProject = Boolean(String(defs.projectId || '').trim() && String(defs.projectName || '').trim());
  return hasDomain || hasProject;
}
