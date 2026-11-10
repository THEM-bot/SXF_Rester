#!/usr/bin/env node
/**
 * 迭代缺陷开放 API 统一 CLI（D01～D06 · M11 · R03/M05/M06/M08/M09）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  httpJson,
  parseCli,
  printPickList,
  publicEnvLabel,
  readJsonArg,
  readSessionFile,
  resolveOutPath,
  resolveToken,
  stringifyFields,
  VERIFY_CJS,
  writeSessionFile,
} from './lib/defect-tools.mjs';
import { parseIntent } from './lib/parse-intent-core.mjs';
import { buildCreateBody } from './lib/build-create-body.mjs';
import { executeIntent, prepareIntent } from './lib/prepare-execute.mjs';
import { applyRefineToIntent } from './lib/content-refine.mjs';
import { descriptionForApiStorage } from './lib/description-format.mjs';
import { readUserTextFromArgs } from '../../../tools/lib/read-user-text.mjs';

const require = createRequire(import.meta.url);
const {
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
  formatStatusText,
  formatCloseText,
} = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');
const token = args.token || resolveToken({ environment: publicEnvLabel() });
const LONG_ID_FIELDS = ['requirementId', 'assigneeId', 'regressionTesterId', 'teamId', 'iterationId'];

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  defect-api.mjs prepare --text "用户句" | --text-file utf8.txt [--out intent.json]
  defect-api.mjs apply-refine --intent intent.json --title "标题" [--description "描述"] [--description-file desc.txt] [--defect-type 5] [--out intent.json]
  defect-api.mjs execute --intent intent.json [--human] [--out file.json]
  defect-api.mjs create --json body.json [--human] [--out file.json]
  defect-api.mjs detail --id TD-xxx [--human] [--out file.json]
  defect-api.mjs list --json query.json [--human] [--out file.json]
  defect-api.mjs update --id TD-xxx --json body.json [--human] [--out file.json]
  defect-api.mjs status --id TD-xxx --json body.json [--human] [--out file.json]
  defect-api.mjs close --id TD-xxx --json body.json [--human] [--out file.json]
  defect-api.mjs m11 [--pick status|severity|closeType|defectType]
  defect-api.mjs requirements [--keyword k] [--pick]
  defect-api.mjs m05 [--keyword k] [--pick]
  defect-api.mjs m06 [--pick] · m08 [--team-id id] [--pick]
  defect-api.mjs m09 [--pick]`);
    process.exit(0);
  }
  if (!token) {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  let result;
  let createBody;
  let updateBody;
  let execMeta = {};

  if (cmd === 'prepare') {
    const text = readUserTextFromArgs(args);
    if (!text) throw new Error('--text or --text-file is required');
    let intent = parseIntent(text, readSessionFile());
    try {
      intent = await prepareIntent(intent, { token });
    } catch (e) {
      if (e.code === 'FULL_CREATE_MODE') throw new Error('FULL_CREATE_MODE');
      throw e;
    }
    const payload = `${JSON.stringify(intent, null, 2)}\n`;
    const outPath = resolveOutPath(args);
    if (outPath) {
      fs.writeFileSync(outPath, payload, 'utf8');
      console.error(`OK: wrote ${outPath}`);
    } else {
      console.log(payload.trimEnd());
    }
    return;
  } else if (cmd === 'apply-refine') {
    const intentIn = readJsonArg(args.intent);
    if (!intentIn) throw new Error('--intent is required');
    const title = args.title;
    if (!title) throw new Error('--title is required');
    let description = args.description ?? '';
    if (args['description-file']) {
      description = fs.readFileSync(args['description-file'], 'utf8').replace(/^\uFEFF/, '').trimEnd();
    }
    const refined = applyRefineToIntent(intentIn, {
      title,
      description,
      defectType: args['defect-type'] ?? args.defectType ?? undefined,
    });
    const payload = `${JSON.stringify(refined, null, 2)}\n`;
    const outPath = resolveOutPath(args);
    if (outPath) {
      fs.writeFileSync(outPath, payload, 'utf8');
      console.error(`OK: wrote ${outPath}`);
    } else {
      console.log(payload.trimEnd());
    }
    return;
  } else if (cmd === 'execute') {
    const intent = await prepareIntent(readJsonArg(args.intent), { token });
    const exec = await executeIntent(intent, { token });
    result = exec.result;
    createBody = exec.body;
    execMeta = exec;
    emitResult(result, intent.operation, args, createBody, updateBody, execMeta);
    return;
  } else if (cmd === 'create') {
    createBody = normalizeBody(readJsonArg(args.json), LONG_ID_FIELDS);
    result = await httpJson('POST', '/api/open/defects/create', { token, body: createBody });
    persistCreateSession(createBody, result.data || {});
  } else if (cmd === 'detail') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    result = await httpJson('GET', `/api/open/defects/detail/${encodeURIComponent(id)}`, { token });
  } else if (cmd === 'list') {
    const body = args.json ? readJsonArg(args.json) : { current: 1, size: 5 };
    if (!body.size) body.size = 5;
    result = await httpJson('POST', '/api/open/defects/findPage', { token, body });
    writeSessionFile({ last_list_filters: { filtersJson: JSON.stringify(body) } });
  } else if (cmd === 'update') {
    const id = args.id || args._[1];
    updateBody = readJsonArg(args.json);
    if (updateBody?.description != null) {
      updateBody = {
        ...updateBody,
        description: descriptionForApiStorage(updateBody.description),
      };
    }
    result = await httpJson('POST', `/api/open/defects/update/${encodeURIComponent(id)}`, {
      token,
      body: updateBody,
    });
    result._updateBody = updateBody;
    result._updateId = id;
  } else if (cmd === 'status') {
    const id = args.id || args._[1];
    const body = readJsonArg(args.json);
    result = await httpJson('POST', `/api/open/defects/status/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    result._statusBody = body;
    result._statusId = id;
  } else if (cmd === 'close') {
    const id = args.id || args._[1];
    const body = readJsonArg(args.json);
    result = await httpJson('POST', `/api/open/defects/close/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    result._closeBody = body;
    result._closeId = id;
  } else if (cmd === 'm11') {
    result = await httpJson('GET', '/api/open/metadata/defect-dictionaries', { token });
    if (args.pick) {
      const data = result.data || {};
      const mode = String(args.pick);
      if (mode === 'status') {
        printPickList(
          (data.status || []).map((name) => ({ name, id: name })),
          { labelKey: 'name', idKey: 'id' },
        );
        return;
      }
      if (mode === 'severity') {
        printPickList(
          (data.severity || []).map((name) => ({ name, id: name })),
          { labelKey: 'name', idKey: 'id' },
        );
        return;
      }
      if (mode === 'closeType') {
        printPickList(data.closeTypes || [], { labelKey: 'label', idKey: 'code' });
        return;
      }
      if (mode === 'defectType') {
        printPickList(data.defectTypes || [], { labelKey: 'label', idKey: 'code' });
        return;
      }
    }
  } else if (cmd === 'requirements') {
    const body = args.json
      ? readJsonArg(args.json)
      : { current: 1, size: 10, ...(args.keyword ? { title: String(args.keyword) } : {}) };
    result = await httpJson('POST', '/api/open/requirements/findPage', { token, body });
    if (args.pick) {
      printPickList(result.data?.records || [], {
        labelKey: 'title',
        idKey: 'requirementId',
        extra: (r) => (r.requirementNo ? `(${r.requirementNo})` : ''),
      });
      return;
    }
  } else if (cmd === 'm05') {
    const q = args.keyword ? `?keyword=${encodeURIComponent(args.keyword)}&current=1&size=20` : '?current=1&size=20';
    result = await httpJson('GET', `/api/open/metadata/users${q}`, { token });
    if (args.pick) {
      // 缺陷 assigneeId = 工号（employeeId），禁止用 SysUser.id
      printPickList(result.data?.records || [], { labelKey: 'name', idKey: 'employeeId' });
      return;
    }
  } else if (cmd === 'm06') {
    result = await httpJson('GET', '/api/open/metadata/teams?current=1&size=50', { token });
    if (args.pick) {
      printPickList(result.data?.records || [], { labelKey: 'name', idKey: 'id' });
      return;
    }
  } else if (cmd === 'm08') {
    const teamId = args['team-id'] || args.teamId;
    const q = teamId
      ? `?teamId=${encodeURIComponent(teamId)}&current=1&size=50`
      : '?current=1&size=50';
    result = await httpJson('GET', `/api/open/metadata/dev-iterations${q}`, { token });
    if (args.pick) {
      printPickList(result.data?.records || [], { labelKey: 'name', idKey: 'id' });
      return;
    }
  } else if (cmd === 'm09') {
    result = await httpJson('GET', '/api/open/metadata/requirement-dictionaries', { token });
    if (args.pick) {
      const statuses = (result.data?.status || []).map((name) => ({ name, id: name }));
      printPickList(statuses, { labelKey: 'name', idKey: 'id' });
      return;
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  emitResult(result, cmd, args, createBody, updateBody, execMeta);
}

function emitResult(result, cmd, args, createBody, updateBody, execMeta) {
  const payload = { ...result };
  delete payload._updateBody;
  delete payload._updateId;
  delete payload._statusBody;
  delete payload._statusId;
  delete payload._closeBody;
  delete payload._closeId;
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, jsonText, 'utf8');
    console.error(`OK: wrote ${outPath}`);
    const op = cmd === 'execute' ? execMeta.operation : cmd;
    if ((op === 'create' || cmd === 'create') && !args['no-verify']) {
      maybeVerifyFile(outPath, args);
    }
  }
  if (args.human) {
    if (cmd === 'detail' || execMeta.operation === 'detail') {
      console.log(formatDetailText(result.data));
    } else if (cmd === 'list' || execMeta.operation === 'list') {
      console.log(formatListText(result.data));
    } else if (cmd === 'create' || execMeta.operation === 'create') {
      console.log(formatCreateText(result.data, createBody || {}));
    } else if (cmd === 'update' || execMeta.operation === 'update') {
      const id = args.id || execMeta.idOrNo || '';
      console.log(`缺陷 ${id} 已更新。\n修改字段：${formatUpdateFieldSummary(updateBody || execMeta.body)}`);
    } else if (cmd === 'status' || execMeta.operation === 'status') {
      console.log(formatStatusText(args.id || execMeta.idOrNo, result._statusBody || execMeta.body));
    } else if (cmd === 'close' || execMeta.operation === 'close') {
      console.log(formatCloseText(args.id || execMeta.idOrNo, result._closeBody || execMeta.body));
    } else if (!outPath) console.log(jsonText.trimEnd());
  } else if (!outPath) {
    console.log(jsonText.trimEnd());
  }
}

function normalizeBody(body, fields) {
  return stringifyFields(body, fields);
}

function maybeVerifyFile(filePath, args = {}) {
  if (args['no-verify']) return;
  if (!filePath || !fs.existsSync(VERIFY_CJS) || !fs.existsSync(filePath)) return;
  try {
    execFileSync(process.execPath, [VERIFY_CJS, filePath], { stdio: 'pipe' });
    console.error(`OK: verify ${filePath}`);
  } catch (e) {
    console.error(`WARN: verify failed for ${filePath}: ${e.message || e}`);
  }
}

function persistCreateSession(createBody, data, prepared = {}) {
  writeSessionFile({
    last_create_defaults: {
      requirementId: createBody.requirementId,
      requirementNo: prepared.requirementNo || '',
      requirementTitle: prepared.requirementTitle || '',
      severity: createBody.severity || '',
    },
    last_defect: {
      defectId: data.defectId,
      defectNo: data.defectNo,
      title: createBody.title,
    },
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
