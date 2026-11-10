#!/usr/bin/env node
/**
 * Cross-platform D03/D04 upload. Preferred on Windows Agent (avoids PS encoding issues).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fetchWithRetry } from '../../../tools/lib/http-json.mjs';
import {
  parseCli,
  parseD04Identifier,
  readSession,
  resolveBaseUrl,
  resolveD04PathParam,
  resolveToken,
  normalizeAccessUrlForDelivery,
  buildDemoDetailShareUrl,
  verifyResponseJson,
  writeSession,
} from './lib/demo-tools.mjs';

const require = createRequire(import.meta.url);
const { formatUploadSuccess, formatUploadFail } = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));

/** @param {string} raw */
function normalizeSourceType(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (t.toUpperCase() === 'UPLOAD' || t === '上传包') return 'UPLOAD';
  if (t.toUpperCase() === 'IMAGE' || t === '镜像') return 'IMAGE';
  return '';
}

function usage() {
  console.error(
    'Usage: node tools/upload-demo.mjs --mode d03|d04 --environment 生产|UAT|本地 --zip <path> [--project-root <路径>] [--token ...] [--name ...] [--source-type UPLOAD|IMAGE] [--expect-source-type IMAGE|UPLOAD] [--demo-id ...] [--business-domain-id ...] [--business-domain-name ...] [--app-service-id ...] [--app-service-name ...] [--save-session] [--no-verify]'
  );
  process.exit(1);
}

if (args.help) usage();
const mode = String(args.mode || '');
const environment = String(args.environment || '');
const zipPath = String(args.zip || '');
if (!mode || !environment || !zipPath) usage();
if (!fs.existsSync(zipPath)) {
  console.error(`Zip not found: ${zipPath}`);
  process.exit(1);
}

const token = resolveToken({ cliToken: args.token, environment });
if (!token) {
  console.error(
    'Token required: --token, YXT_OPEN_API_TOKEN, or ~/.yanxiaotong/tokens/{local|uat|prod} for this environment'
  );
  process.exit(1);
}
const projectRoot = String(args['project-root'] || process.cwd());
const session = readSession(environment, projectRoot);

const baseUrl = resolveBaseUrl(environment);
const noVerify = Boolean(args['no-verify']);
const saveSession = Boolean(args['save-session']);

let url;
/** @type {Record<string, string>} */
let meta = {};
/** @type {{ pathParam: string; demoId: string; demoCode: string }} */
let d04Parsed = { pathParam: '', demoId: '', demoCode: '' };
let d04PathParam = '';

if (mode === 'd03') {
  let name = String(args.name || session.d03?.name || '');
  if (!name) {
    console.error('D03 requires --name or d03.name in session');
    process.exit(1);
  }
  const sourceTypeRaw = String(args['source-type'] || session.d03?.sourceType || '');
  const sourceTypeNorm = normalizeSourceType(sourceTypeRaw);
  if (!sourceTypeNorm) {
    console.error(
      'D03 requires --source-type UPLOAD|IMAGE（或 上传包|镜像）；也可写入 session.d03.sourceType'
    );
    process.exit(1);
  }
  meta = { name, sourceType: sourceTypeNorm };
  const pairs = [
    ['business-domain-id', 'businessDomainId'],
    ['business-domain-name', 'businessDomainName'],
    ['app-service-id', 'appServiceId'],
    ['app-service-name', 'appServiceName'],
  ];
  for (const [argKey, metaKey] of pairs) {
    const v = String(args[argKey] || session.d03?.[metaKey] || '');
    if (v) meta[metaKey] = v;
  }
  url = `${baseUrl}/api/open/demos/package-upload`;
} else if (mode === 'd04') {
  const cliRaw = String(args['demo-id'] || '');
  d04Parsed = parseD04Identifier(cliRaw);
  d04PathParam = d04Parsed.pathParam || resolveD04PathParam('', session);
  if (!d04PathParam) {
    console.error('D04 requires --demo-id or d04.demo_id/demo_code in session');
    process.exit(1);
  }
  url = `${baseUrl}/api/open/demos/${encodeURIComponent(d04PathParam)}/package-upload`;
} else {
  usage();
}

const form = new FormData();
if (mode === 'd03') {
  form.append('metadata', JSON.stringify(meta));
}
const blob = new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' });
form.append('file', blob, path.basename(zipPath));

const uploadPath =
  mode === 'd03' ? '/api/open/demos/package-upload' : `/api/open/demos/${d04PathParam}/package-upload`;

const res = await fetchWithRetry(
  () => fetch(url, { method: 'POST', headers: { 'X-Open-Api-Token': token }, body: form }),
  { method: 'POST', urlPath: uploadPath },
);
const body = await res.text();
const httpCode = res.status;
const curlExit = httpCode === 200 ? 0 : 1;

try {
  verifyResponseJson(body, { noVerify });
} catch (e) {
  console.warn(String(e.message || e));
}

let accessUrl = '';
let demoIdOut = '';
let demoCode = '';
let sourceTypeOut = '';
let status = 'failed';

try {
  const parsed = JSON.parse(body);
  if (parsed.success === true && parsed.data) {
    status = 'ok';
    accessUrl = parsed.data.accessUrl || '';
    demoIdOut = parsed.data.demoId || '';
    demoCode = parsed.data.demoCode || '';
    sourceTypeOut = String(parsed.data.sourceType || '').trim().toUpperCase();
    if (accessUrl) accessUrl = normalizeAccessUrlForDelivery(environment, accessUrl);
  } else if (parsed.message) {
    status = `failed (${parsed.message})`;
  }
} catch {
  status = 'failed (invalid JSON)';
}

if (saveSession && httpCode === 200 && status === 'ok') {
  session.last_environment = environment;
  session.updated_at = new Date().toISOString();
  if (mode === 'd03') {
    session.d03 = { ...session.d03, ...meta };
  } else {
    session.d04 = session.d04 || {};
    session.d04.demo_id = demoIdOut || d04Parsed.demoId || (/^\d+$/.test(d04PathParam) ? d04PathParam : '');
    session.d04.demo_code = demoCode || d04Parsed.demoCode || (/^DEMO-/i.test(d04PathParam) ? d04PathParam : '');
  }
  session.project_root = projectRoot;
  writeSession(session, environment, projectRoot);
}

const snippet = body.length > 400 ? `${body.slice(0, 400)}...` : body;
const ok = httpCode === 200 && status === 'ok';

console.error(`[agent] zip=${zipPath} api=${mode.toUpperCase()} env=${environment} http=${httpCode} exit=${curlExit}`);
console.error(`[agent] snippet=${snippet}`);

const expectRaw = String(args['expect-source-type'] || '');
const expectNorm = normalizeSourceType(expectRaw);
if (expectRaw && !expectNorm) {
  console.error('--expect-source-type 仅支持 UPLOAD|IMAGE（或 上传包|镜像）');
  process.exit(1);
}
/** @type {string} */
let expectedSourceType = expectNorm;
if (!expectedSourceType) {
  if (mode === 'd03') {
    expectedSourceType = String(meta.sourceType || '').toUpperCase();
  } else {
    const fromArg = normalizeSourceType(String(args['source-type'] || ''));
    const fromSession = String(session.d03?.sourceType || '').toUpperCase();
    expectedSourceType = fromArg || fromSession;
  }
}

let typeMismatch = false;
if (ok) {
  if (expectedSourceType && sourceTypeOut && sourceTypeOut !== expectedSourceType) {
    typeMismatch = true;
    console.error(
      `[agent] SOURCE_TYPE_MISMATCH expected=${expectedSourceType} actual=${sourceTypeOut}`
    );
    console.log(`SOURCE_TYPE_MISMATCH=${sourceTypeOut}`);
  }
  if (sourceTypeOut) {
    console.log(`SOURCE_TYPE=${sourceTypeOut}`);
  }
  const detailUrl = buildDemoDetailShareUrl(environment, demoIdOut);
  console.log(formatUploadSuccess({ demoId: demoIdOut, demoCode, accessUrl, detailUrl }));
} else {
  const reason = status.startsWith('failed') ? status.replace(/^failed\s*/i, '') : status;
  console.log(formatUploadFail(reason || `HTTP ${httpCode}`));
}

// 类型被改写时非 0，避免 Agent 当成功
process.exit(ok && !typeMismatch ? 0 : 1);
