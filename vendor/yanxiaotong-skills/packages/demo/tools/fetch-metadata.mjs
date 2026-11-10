#!/usr/bin/env node
/**
 * M01 business domains / M03 app-services for D03 metadata selection.
 * Usage:
 *   node tools/fetch-metadata.mjs --kind domains --environment 本地 --token ehub_live_xxx
 *   node tools/fetch-metadata.mjs --kind app-services --environment 本地 --token xxx --business-domain-id <id>
 *   node tools/fetch-metadata.mjs --kind domains --environment 本地 --match 平台组
 *   → 有命中：stdout 确认话术（Agent 原样贴）· stderr 含 match_json
 *   → 无命中：stdout 完整编号列表 + 未匹配说明
 */
import {
  BASE_URL_MAP,
  parseCli,
  resolveBaseUrl,
  resolveToken,
} from './lib/demo-tools.mjs';
import { fetchWithRetry } from '../../../tools/lib/http-json.mjs';
import {
  formatMetaMatchConfirm,
  formatMetaMatchMiss,
  fuzzyMatchMetadata,
} from './lib/fuzzy-match-metadata.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatMetadataFail, formatMetadataPickList } = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));

function usage() {
  console.error(
    'Usage: node tools/fetch-metadata.mjs --kind domains|app-services --environment 生产|UAT|本地 [--token ...] [--business-domain-id ...] [--keyword ...] [--match <用户口语>] [--pick-index N] [--output list|json]'
  );
  process.exit(1);
}

if (args.help) usage();
const kind = String(args.kind || '');
const environment = String(args.environment || '');
if (!kind || !environment || !BASE_URL_MAP[environment]) usage();

const token = resolveToken({ cliToken: args.token, environment });
if (!token) {
  console.error(
    'Token required: --token, YXT_OPEN_API_TOKEN, or per-environment file under ~/.yanxiaotong/tokens/'
  );
  process.exit(1);
}

const businessDomainId = String(args['business-domain-id'] || '');
if (kind === 'app-services' && !businessDomainId) {
  console.error('app-services requires --business-domain-id');
  process.exit(1);
}

const baseUrl = resolveBaseUrl(environment);
const params = new URLSearchParams();
params.set('current', String(args.current || '1'));
params.set('size', String(args.size || '50'));
if (args.keyword) params.set('keyword', String(args.keyword));
if (args['fetch-all']) params.set('fetchAll', 'true');
if (businessDomainId) params.set('businessDomainId', businessDomainId);

let apiId;
let apiLabel;
let pathPart;
if (kind === 'domains') {
  apiId = 'M01';
  apiLabel = 'business-domains';
  pathPart = '/api/open/metadata/business-domains';
} else {
  apiId = 'M03';
  apiLabel = 'app-services';
  pathPart = '/api/open/metadata/app-services';
}

const url = `${baseUrl}${pathPart}?${params}`;
const res = await fetchWithRetry(
  () => fetch(url, { headers: { 'X-Open-Api-Token': token } }),
  { method: 'GET', urlPath: pathPart },
);
const body = await res.text();
const httpCode = res.status;

if (httpCode !== 200) {
  console.error(`[agent] api=${apiId} http=${httpCode} env=${environment}`);
  console.log(formatMetadataFail(`HTTP ${httpCode}`));
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  console.error('[agent] invalid JSON');
  console.log(formatMetadataFail('响应不是有效 JSON'));
  process.exit(1);
}

if (parsed.success !== true) {
  console.error(`[agent] api=${apiId} success=false`);
  console.log(formatMetadataFail(parsed.message || '接口返回失败'));
  process.exit(1);
}

const records = parsed.data?.records || [];
const total = parsed.data?.total ?? records.length;
const output = String(args.output || 'list');
const pickIndex = Number(args['pick-index'] || 0);
const matchKeyword = args.match != null && args.match !== false ? String(args.match).trim() : '';
const kindLabel = kind === 'domains' ? '业务领域' : '所属服务';

if (records.length === 0) {
  console.error(`[agent] api=${apiId} total=0`);
  console.log(formatMetadataFail('没有可选记录，请勿手填编号'));
  process.exit(1);
}

if (matchKeyword) {
  const matches = fuzzyMatchMetadata(records, matchKeyword);
  const matchPayload = {
    api: apiId,
    kind,
    kindLabel,
    environment,
    userKeyword: matchKeyword,
    mode: matches.length ? 'confirm' : 'pick',
    matches,
    total,
  };
  if (output === 'json') {
    console.log(JSON.stringify(matchPayload));
    process.exit(0);
  }
  console.error(
    `[agent] api=${apiId} match=${JSON.stringify(matchKeyword)} hits=${matches.length} mode=${matchPayload.mode} env=${environment}`,
  );
  console.error(`[agent] match_json=${JSON.stringify({ mode: matchPayload.mode, matches })}`);
  if (matches.length) {
    console.log(formatMetaMatchConfirm({ kindLabel, userKeyword: matchKeyword, matches }));
  } else {
    console.log(
      formatMetaMatchMiss({
        kindLabel,
        userKeyword: matchKeyword,
        pickListText: formatMetadataPickList(records),
      }),
    );
  }
  process.exit(0);
}

if (pickIndex > 0) {
  if (pickIndex > records.length) {
    console.error(`PickIndex ${pickIndex} out of range (1..${records.length})`);
    process.exit(1);
  }
  const picked = records[pickIndex - 1];
  if (output === 'json') {
    console.log(JSON.stringify(picked));
  } else {
    console.error(`[agent] picked index=${pickIndex} id=${picked.id}`);
    console.log(`已选择：${picked.name}`);
  }
  process.exit(0);
}

if (output === 'json') {
  console.log(JSON.stringify({ api: apiId, kind, environment, total, records }));
  process.exit(0);
}

console.error(`[agent] api=${apiId} total=${total} env=${environment}`);
console.log(formatMetadataPickList(records));
