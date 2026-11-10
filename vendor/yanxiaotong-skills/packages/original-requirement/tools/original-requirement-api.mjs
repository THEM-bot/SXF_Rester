#!/usr/bin/env node
/**
 * 原始需求开放 API 统一 CLI（OR01 / OR02 / OR06 / OR07 · M01 / M05）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  httpJson,
  parseJsonText,
  parseCli,
  printPickList,
  publicEnvLabel,
  resolveToken,
  stringifyFields,
  writeSessionFile,
} from './lib/original-requirement-tools.mjs';

const require = createRequire(import.meta.url);
const {
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
} = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');
const token = args.token || resolveToken({ environment: publicEnvLabel() });
const LONG_ID_FIELDS = ['businessDomainId'];

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  original-requirement-api.mjs create --json body.json [--human] [--out file.json]
  original-requirement-api.mjs detail --id OR-xxx [--human] [--out file.json]
  original-requirement-api.mjs list --json query.json [--human] [--out file.json]
  original-requirement-api.mjs update --id OR-xxx --json body.json [--human] [--out file.json]
  original-requirement-api.mjs m01 [--query k=v ...]
  original-requirement-api.mjs m05 [--keyword 张三] [--pick]`);
    process.exit(0);
  }
  if (!token) {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  let result;
  let createBody;
  if (cmd === 'create') {
    createBody = normalizeCreateBody(readJsonArg(args.json));
    result = await httpJson('POST', '/api/open/original-requirements', { token, body: createBody });
    const d = result.data || {};
    const defaults = await resolveCreateDefaultNames(token, createBody);
    writeSessionFile({
      last_original: { id: d.id, originalNo: d.originalNo },
      last_create_defaults: defaults,
    });
  } else if (cmd === 'detail') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    result = await httpJson('GET', `/api/open/original-requirements/detail/${encodeURIComponent(id)}`, {
      token,
    });
  } else if (cmd === 'list') {
    const body = args.json ? readJsonArg(args.json) : { current: 1, size: 5 };
    if (!body.size) body.size = 5;
    result = await httpJson('POST', '/api/open/original-requirements/findPage', { token, body });
  } else if (cmd === 'update') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required (OR-编号)');
    const body = stringifyFields(readJsonArg(args.json), LONG_ID_FIELDS);
    result = await httpJson('PATCH', `/api/open/original-requirements/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    result._updateBody = body;
  } else if (cmd === 'm01') {
    result = await httpJson('GET', `/api/open/metadata/business-domains?${toQuery(args)}`, { token });
  } else if (cmd === 'm05') {
    const q = args.keyword
      ? `keyword=${encodeURIComponent(String(args.keyword))}&current=1&size=20`
      : 'current=1&size=20';
    result = await httpJson('GET', `/api/open/metadata/users?${q}`, { token });
    if (args.pick) {
      printPickList(result.data?.records || [], {
        labelKey: 'name',
        idKey: 'employeeId',
        extra: (r) => (r.employeeId ? `(工号 ${r.employeeId})` : ''),
      });
      return;
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
  emitResult(result, cmd, args, createBody);
}

function emitResult(result, cmd, args, createBody) {
  const payload = { ...result };
  const updateBody = payload._updateBody;
  delete payload._updateBody;
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const outPath = resolveOutPath(args);

  if (outPath) {
    fs.writeFileSync(outPath, jsonText, 'utf8');
    console.error(`OK: wrote ${outPath}`);
  }

  if (args.human) {
    if (cmd === 'detail') console.log(formatDetailText(result.data));
    else if (cmd === 'list') console.log(formatListText(result.data));
    else if (cmd === 'create') {
      console.log(
        formatCreateText(result.data, {
          title: createBody?.title,
          env_label: publicEnvLabel(),
        }),
      );
    } else if (cmd === 'update') {
      const id = args.id || args._[1] || '';
      console.log(`原始需求 ${id} 已更新。\n修改字段：${formatUpdateFieldSummary(updateBody)}`);
    } else if (!outPath) console.log(jsonText.trimEnd());
  } else if (!outPath) {
    console.log(jsonText.trimEnd());
  }
}

function resolveOutPath(args) {
  const out = args.out;
  if (out == null || out === '' || out === true) {
    if (out === true) {
      throw new Error(
        '--out 缺少文件路径。请改用：Node 写 body.json 后 create --json body.json --out resp.json',
      );
    }
    return null;
  }
  return String(out);
}

function toQuery(args) {
  const q = new URLSearchParams();
  const skip = new Set(['_', 'token', 'json', 'id', 'help', 'human', 'out', 'debug']);
  for (const [k, v] of Object.entries(args)) {
    if (skip.has(k)) continue;
    if (v != null && v !== true) q.set(k, String(v));
  }
  return q.toString();
}

function readJsonArg(jsonPath) {
  if (!jsonPath) throw new Error('--json is required');
  const raw = jsonPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(jsonPath, 'utf8');
  return parseJsonText(raw);
}

function normalizeCreateBody(body) {
  return stringifyFields(body, LONG_ID_FIELDS);
}

async function resolveCreateDefaultNames(token, body) {
  const defaults = {
    businessDomainId: body.businessDomainId,
    businessDomainName: body.businessDomainName || '',
  };
  if (!defaults.businessDomainName) {
    defaults.businessDomainName = await lookupName(
      token,
      '/api/open/metadata/business-domains?current=1&size=2000',
      defaults.businessDomainId,
    );
  }
  return defaults;
}

async function lookupName(token, urlPath, id) {
  if (id == null || id === '') return '';
  try {
    const resp = await httpJson('GET', urlPath, { token });
    const records = resp.data?.records || [];
    const match = records.find((r) => String(r.id) === String(id));
    return match?.name || match?.label || '';
  } catch {
    return '';
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
