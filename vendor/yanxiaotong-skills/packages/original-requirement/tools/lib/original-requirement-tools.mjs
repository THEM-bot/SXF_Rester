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

export function sessionFilePath() {
  const env = getActiveEnv();
  return path.join(os.homedir(), '.yanxiaotong', 'sessions', env.env_slug, 'original-requirement');
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
    if (out[field] != null && out[field] !== '') out[field] = String(out[field]);
  }
  return out;
}

/** M05 等元数据点选列表（与 defect 包同形；id 优先展示工号） */
export function printPickList(records, { labelKey = 'name', idKey = 'id', extra } = {}) {
  console.log('[yanxiaotong-original-requirement metadata]');
  console.log(`- total: ${records.length}`);
  if (!records.length) {
    console.log('- status: no records (do not type id manually)');
    return;
  }
  if (records.length === 1) {
    console.log('\nOnly 1 match: Agent may adopt directly (no index ask); still recite name+employeeId.');
  } else {
    console.log('\nPick one (reply with index number):');
  }
  records.forEach((rec, i) => {
    const label = rec[labelKey] ?? rec.name ?? rec.title ?? '';
    const id = rec[idKey] ?? rec.employeeId ?? rec.id ?? '';
    const extraTxt = extra ? extra(rec) : '';
    console.log(`${i + 1}. ${label}${extraTxt ? ` ${extraTxt}` : ''} (id: ${id})`);
  });
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
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(30_000);
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
  const data = { last_create_defaults: {}, last_original: {} };
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (top && !/^\s/.test(line)) {
      section = top[1];
      if (section === 'updated_at') data.updated_at = top[2].trim();
      continue;
    }
    const nested = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (!nested) continue;
    if (section === 'last_create_defaults') data.last_create_defaults[nested[1]] = nested[2].trim();
    if (section === 'last_original') data.last_original[nested[1]] = nested[2].trim();
  }
  return data;
}

export function writeSessionFile(data) {
  const d = data || {};
  const defs = d.last_create_defaults || {};
  const or = d.last_original || {};
  const env = getActiveEnv();
  const file = sessionFilePath();
  const text = `# original-requirement session (${env.env_label})
last_create_defaults:
  businessDomainId: ${defs.businessDomainId || ''}
  businessDomainName: ${defs.businessDomainName || ''}
last_original:
  id: ${or.id || ''}
  originalNo: ${or.originalNo || ''}
updated_at: ${new Date().toISOString()}
`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
