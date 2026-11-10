#!/usr/bin/env node
/**
 * API-D03b：仅新建 Demo 草稿（默认 IMAGE，不传包）。
 * 供 demo-docker-deploy 阶段①：拿 demoCode 写平台库 / 搭架子；出包后再 D04。
 */
import { createRequire } from 'node:module';
import { fetchWithRetry } from '../../../tools/lib/http-json.mjs';
import {
  parseCli,
  readSession,
  resolveBaseUrl,
  resolveToken,
  buildDemoDetailShareUrl,
  writeSession,
} from './lib/demo-tools.mjs';

const require = createRequire(import.meta.url);
const { formatUploadSuccess, formatUploadFail } = require('../scripts/lib/display-humanize.cjs');

/** @param {string} raw */
function normalizeSourceType(raw) {
  const t = String(raw || '').trim();
  if (!t) return 'IMAGE';
  if (t.toUpperCase() === 'UPLOAD' || t === '上传包') return 'UPLOAD';
  if (t.toUpperCase() === 'IMAGE' || t === '镜像') return 'IMAGE';
  return '';
}

function usage() {
  console.error(
    'Usage: node tools/create-demo.mjs --environment 生产|UAT|本地 --name <名称> [--source-type IMAGE|UPLOAD] [--require-binding] [--project-root <路径>] [--token ...] [--business-domain-id ...] [--business-domain-name ...] [--app-service-id ...] [--app-service-name ...] [--save-session]'
  );
  process.exit(1);
}

const args = parseCli(process.argv.slice(2));
if (args.help) usage();

const environment = String(args.environment || '');
const name = String(args.name || '');
if (!environment || !name) usage();

const sourceTypeNorm = normalizeSourceType(String(args['source-type'] || ''));
if (!sourceTypeNorm) {
  console.error('--source-type 仅支持 UPLOAD|IMAGE（或 上传包|镜像）；缺省为 IMAGE');
  process.exit(1);
}

const requireBinding = Boolean(args['require-binding']);
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
const saveSession = Boolean(args['save-session']);

/** @type {Record<string, string>} */
const meta = { name: name.trim(), sourceType: sourceTypeNorm };
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

if (requireBinding) {
  const missing = [];
  if (!meta.businessDomainId) missing.push('businessDomainId');
  if (!meta.businessDomainName) missing.push('businessDomainName');
  if (!meta.appServiceId) missing.push('appServiceId');
  if (!meta.appServiceName) missing.push('appServiceName');
  if (missing.length) {
    console.error(
      `--require-binding 需要领域/服务四参（或 session.d03），缺少: ${missing.join(', ')}`
    );
    process.exit(1);
  }
  if (sourceTypeNorm !== 'IMAGE') {
    console.error('--require-binding 场景须 --source-type IMAGE（demo-docker-deploy 捆包主路径）');
    process.exit(1);
  }
}

const url = `${baseUrl}/api/open/demos`;
const res = await fetchWithRetry(
  () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'X-Open-Api-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meta),
    }),
  { method: 'POST', urlPath: '/api/open/demos' }
);

const body = await res.text();
const httpCode = res.status;

let demoIdOut = '';
let demoCode = '';
let sourceTypeOut = '';
let status = 'failed';
try {
  const parsed = JSON.parse(body);
  if (parsed.success === true && parsed.data) {
    status = 'ok';
    demoIdOut = parsed.data.demoId || '';
    demoCode = parsed.data.demoCode || '';
    sourceTypeOut = String(parsed.data.sourceType || '').trim().toUpperCase();
  } else if (parsed.message) {
    status = `failed (${parsed.message})`;
  }
} catch {
  status = 'failed (invalid JSON)';
}

if (saveSession && httpCode === 200 && status === 'ok') {
  session.last_environment = environment;
  session.updated_at = new Date().toISOString();
  session.d03 = { ...session.d03, ...meta };
  session.d04 = session.d04 || {};
  session.d04.demo_id = demoIdOut;
  session.d04.demo_code = demoCode;
  session.project_root = projectRoot;
  writeSession(session, environment, projectRoot);
}

const ok = httpCode === 200 && status === 'ok';
const snippet = body.length > 400 ? `${body.slice(0, 400)}...` : body;
console.error(`[agent] create-demo env=${environment} sourceType=${sourceTypeNorm} http=${httpCode}`);
console.error(`[agent] snippet=${snippet}`);

let typeMismatch = false;
if (ok) {
  if (sourceTypeOut && sourceTypeOut !== sourceTypeNorm) {
    typeMismatch = true;
    console.error(
      `[agent] SOURCE_TYPE_MISMATCH expected=${sourceTypeNorm} actual=${sourceTypeOut}`
    );
    console.log(`SOURCE_TYPE_MISMATCH=${sourceTypeOut}`);
  }
  const detailUrl = buildDemoDetailShareUrl(environment, demoIdOut);
  console.log(formatUploadSuccess({ demoId: demoIdOut, demoCode, accessUrl: '', detailUrl }));
  // 机读行：技能阶段①可直接取 demoCode 写连接
  console.log(`DEMO_CODE=${demoCode}`);
  console.log(`DEMO_ID=${demoIdOut}`);
  console.log(`SOURCE_TYPE=${sourceTypeOut || sourceTypeNorm}`);
} else {
  const reason = status.startsWith('failed') ? status.replace(/^failed\s*/i, '') : status;
  console.log(formatUploadFail(reason || `HTTP ${httpCode}`));
}

// require-binding / 主路径：类型被改写则非 0，避免 Agent 当成功继续搭架子
const failOnMismatch = requireBinding || sourceTypeNorm === 'IMAGE';
process.exit(ok && !(typeMismatch && failOnMismatch) ? 0 : 1);
