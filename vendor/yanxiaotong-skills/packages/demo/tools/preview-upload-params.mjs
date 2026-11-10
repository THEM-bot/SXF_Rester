#!/usr/bin/env node
/**
 * 上传前 Demo 信息预览：后台拉 M01/M03 并模糊匹配，stdout 输出确认表（Agent 原样贴）。
 *
 * Usage:
 *   node tools/preview-upload-params.mjs --environment 本地 --project-root <路径> \
 *     [--name ...] [--domain-keyword 平台组] [--service-keyword 平台组] [--zip <path>]
 */
import { fetchWithRetry } from '../../../tools/lib/http-json.mjs';
import {
  BASE_URL_MAP,
  parseCli,
  readSession,
  resolveBaseUrl,
  resolveToken,
} from './lib/demo-tools.mjs';
import { formatDemoUploadPreview, summarizeMatchField } from './lib/format-demo-preview.mjs';
import { fuzzyMatchMetadata } from './lib/fuzzy-match-metadata.mjs';

const args = parseCli(process.argv.slice(2));

function usage() {
  console.error(
    'Usage: node tools/preview-upload-params.mjs --environment 生产|UAT|本地 --project-root <路径> [--name ...] [--domain-keyword ...] [--service-keyword ...] [--zip ...] [--output list|json]',
  );
  process.exit(1);
}

if (args.help) usage();
const environment = String(args.environment || '');
const projectRoot = String(args['project-root'] || '');
if (!environment || !BASE_URL_MAP[environment] || !projectRoot) usage();

const token = resolveToken({ cliToken: args.token, environment });
if (!token) {
  console.error(
    'Token required: --token, YXT_OPEN_API_TOKEN, or ~/.yanxiaotong/tokens/{local|uat|prod}',
  );
  process.exit(1);
}

const session = readSession(environment, projectRoot);
const zipPath = String(args.zip || '');
const output = String(args.output || 'list');

const nameUser = String(args.name || '').trim();
const nameSession = String(session.d03?.name || '').trim();
const name = nameUser || nameSession;
const nameNote = nameUser ? '您本轮指定' : nameSession ? '沿用会话' : '待填写';

const domainKeyword = String(args['domain-keyword'] || args.domain || '').trim();
const serviceKeyword = String(args['service-keyword'] || args.service || args.group || '').trim();

const baseUrl = resolveBaseUrl(environment);

/**
 * @param {string} pathPart
 * @param {Record<string, string>} [query]
 */
async function fetchRecords(pathPart, query = {}) {
  const params = new URLSearchParams({ current: '1', size: '50', fetchAll: 'true', ...query });
  const url = `${baseUrl}${pathPart}?${params}`;
  const res = await fetchWithRetry(
    () => fetch(url, { headers: { 'X-Open-Api-Token': token } }),
    { method: 'GET', urlPath: pathPart },
  );
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status} ${pathPart}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`invalid JSON ${pathPart}`);
  }
  if (parsed.success !== true) {
    throw new Error(parsed.message || `API failed ${pathPart}`);
  }
  return parsed.data?.records || [];
}

/** @type {{ id: string, name: string, score: number }[]} */
let domainMatches = [];
/** @type {{ id: string, name: string, score: number }[]} */
let serviceMatches = [];
let metaError = '';

try {
  const domains = await fetchRecords('/api/open/metadata/business-domains');
  if (domainKeyword) {
    domainMatches = fuzzyMatchMetadata(domains, domainKeyword);
  } else if (session.d03?.businessDomainId && session.d03?.businessDomainName) {
    domainMatches = [
      {
        id: String(session.d03.businessDomainId),
        name: String(session.d03.businessDomainName),
        score: 100,
      },
    ];
  }

  const domainBest = domainMatches[0];
  if (domainBest?.id) {
    const services = await fetchRecords('/api/open/metadata/app-services', {
      businessDomainId: domainBest.id,
    });
    if (serviceKeyword) {
      serviceMatches = fuzzyMatchMetadata(services, serviceKeyword);
    } else if (session.d03?.appServiceId && session.d03?.appServiceName) {
      serviceMatches = [
        {
          id: String(session.d03.appServiceId),
          name: String(session.d03.appServiceName),
          score: 100,
        },
      ];
    }
  } else if (serviceKeyword) {
    // 领域未定，无法拉 M03；服务仅标记待领域确认
    serviceMatches = [];
  }
} catch (e) {
  metaError = e instanceof Error ? e.message : String(e);
}

const domainField = summarizeMatchField({
  kind: 'domain',
  keyword: domainKeyword || (domainMatches[0] && !domainKeyword ? '' : domainKeyword),
  matches: domainMatches,
});
if (!domainKeyword && domainMatches[0] && domainField.status === 'matched') {
  domainField.note = '沿用会话';
  domainField.status = 'session';
  domainField.display = domainMatches[0].name;
}

const serviceField = summarizeMatchField({
  kind: 'service',
  keyword: serviceKeyword,
  matches: serviceMatches,
});
if (!serviceKeyword && serviceMatches[0] && serviceField.status === 'matched') {
  serviceField.note = '沿用会话';
  serviceField.status = 'session';
  serviceField.display = serviceMatches[0].name;
}
if (serviceKeyword && !domainMatches[0]) {
  serviceField.display = '待领域确认后匹配';
  serviceField.note = `口语「${serviceKeyword}」`;
  serviceField.status = 'blocked';
}

const readyForD03 = Boolean(
  name && domainField.id && domainField.name && serviceField.id && serviceField.name,
);

const payload = {
  environment,
  projectRoot,
  zipPath,
  name,
  nameNote,
  domainKeyword,
  serviceKeyword,
  domain: {
    id: domainField.id,
    name: domainField.name,
    display: domainField.display,
    note: domainField.note,
    status: domainField.status,
    matches: domainMatches,
  },
  service: {
    id: serviceField.id,
    name: serviceField.name,
    display: serviceField.display,
    note: serviceField.note,
    status: serviceField.status,
    matches: serviceMatches,
  },
  readyForD03,
  metaError,
};

if (output === 'json') {
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = metaError ? 1 : 0;
} else {
  if (metaError) {
    console.error(`[agent] preview_meta_error=${JSON.stringify(metaError)}`);
  }

  console.error(`[agent] preview_json=${JSON.stringify({
    readyForD03,
    name,
    domain: { id: payload.domain.id, name: payload.domain.name, status: payload.domain.status },
    service: { id: payload.service.id, name: payload.service.name, status: payload.service.status },
  })}`);

  console.log(
    formatDemoUploadPreview({
      zipPath: zipPath || '（见本次出包路径）',
      environment,
      name: name || '（待填写）',
      nameNote: name ? nameNote : '待填写',
      domainDisplay: domainField.display,
      domainNote: domainField.note,
      serviceDisplay: serviceField.display,
      serviceNote: serviceField.note,
      readyForD03,
    }),
  );

  process.exitCode = metaError ? 1 : 0;
}
