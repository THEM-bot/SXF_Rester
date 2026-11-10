#!/usr/bin/env node
/**
 * 迭代任务开放 API 统一 CLI（T01～T06 · M10 · R03/M05/M06/M08）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  httpJson,
  parseCli,
  parseJsonText,
  printPickList,
  publicEnvLabel,
  readJsonArg,
  readSessionFile,
  resolveOutPath,
  resolveToken,
  stringifyFields,
  VERIFY_CJS,
  writeSessionFile,
} from './lib/task-tools.mjs';
import { buildCreateBodies } from './lib/build-create-body.mjs';
import { parseAndPrepareFromText, prepareQuickCreate } from './lib/quick-create.mjs';
import { applyDedupSkips } from './lib/dedup-tasks.mjs';
import { applyRefineToIntent } from './lib/content-refine.mjs';

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
const LONG_ID_FIELDS = ['requirementId', 'assigneeId', 'teamId', 'iterationId'];

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  task-api.mjs create --json body.json [--human] [--out file.json]
  task-api.mjs create --intent intent.json [--human] [--out-dir dir]
  task-api.mjs create-quick --text "用户句" [--force-track user_input|req_analyze] [--human] [--out-dir dir]
  task-api.mjs prepare-create --text "用户句" [--resolve-only] [--force-track user_input|req_analyze] [--out intent.json]
  task-api.mjs apply-dedup --intent intent.json --skip "0,2" [--skipped-json skips.json] [--out intent.json]
  task-api.mjs apply-refine --intent intent.json --title "标题" [--description "描述"] [--description-file desc.txt] [--out intent.json]
  task-api.mjs detail --id TASK-xxx [--human] [--out file.json]
  task-api.mjs list --json query.json [--human] [--out file.json]
  task-api.mjs update --id TASK-xxx --json body.json [--human] [--out file.json]
  task-api.mjs cancel --id TASK-xxx [--out file.json]
  task-api.mjs m10 [--pick phase|category] [--phase 开发阶段]
  task-api.mjs requirements [--keyword k] [--pick] [--json query.json]
  task-api.mjs m05 [--keyword k] [--pick]
  task-api.mjs m06 [--pick]
  task-api.mjs m08 [--team-id id] [--pick]`);
    process.exit(0);
  }
  if (!token) {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  let result;
  let createBody;
  let updateBody;

  if (cmd === 'create') {
    if (args.intent) {
      const results = await runCreateFromIntent(readJsonArg(args.intent), args);
      if (results.length === 1) {
        result = results[0].result;
        createBody = results[0].body;
      } else {
        result = { success: true, data: { batch: results.map((r) => r.result.data) } };
        createBody = results[results.length - 1].body;
      }
    } else {
      createBody = normalizeBody(readJsonArg(args.json), LONG_ID_FIELDS);
      result = await httpJson('POST', '/api/open/tasks/create', { token, body: createBody });
      persistCreateSession(createBody, result.data || {});
    }
  } else if (cmd === 'create-quick') {
    const text = args.text;
    if (!text) throw new Error('--text is required');
    const forceTrack = args['force-track'] ? String(args['force-track']) : null;
    let prepared;
    try {
      prepared = await parseAndPrepareFromText(text, { token, forceTrack });
    } catch (e) {
      if (e.code === 'FULL_CREATE_MODE') throw new Error('请使用完整创建流程（逐步点选）');
      if (e.code === 'NEED_CREATE_MODE') throw e;
      throw e;
    }
    if (prepared.status === 'pending_create_mode' || !prepared.track) {
      throw new Error('请先选择创建方式（手动/自动）后再创建');
    }
    const results = await runCreateFromIntent(prepared, args);
    if (results.length === 1) {
      result = results[0].result;
      createBody = results[0].body;
    } else {
      result = { success: true, data: { batch: results.map((r) => r.result.data) } };
      createBody = results[results.length - 1].body;
    }
  } else if (cmd === 'prepare-create') {
    const text = args.text;
    if (!text) throw new Error('--text is required');
    const resolveOnly = !!args['resolve-only'];
    const forceTrack = args['force-track'] ? String(args['force-track']) : null;
    let prepared;
    try {
      prepared = await parseAndPrepareFromText(text, { token, resolveOnly, forceTrack });
    } catch (e) {
      if (e.code === 'FULL_CREATE_MODE') throw new Error('FULL_CREATE_MODE');
      throw e;
    }
    const payload = `${JSON.stringify(prepared, null, 2)}\n`;
    const outPath = resolveOutPath(args);
    if (outPath) {
      fs.writeFileSync(outPath, payload, 'utf8');
      console.error(`OK: wrote ${outPath}`);
    } else {
      console.log(payload.trimEnd());
    }
    return;
  } else if (cmd === 'apply-dedup') {
    const intentIn = readJsonArg(args.intent);
    if (!intentIn) throw new Error('--intent is required');
    let skipped = [];
    if (args['skipped-json']) {
      skipped = readJsonArg(args['skipped-json']);
      if (!Array.isArray(skipped)) throw new Error('--skipped-json must be an array');
    } else if (args.skip != null && String(args.skip).trim() !== '') {
      skipped = String(args.skip)
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ proposed_index: parseInt(s, 10), reason: 'Agent 判定重合' }));
    }
    const filtered = applyDedupSkips(intentIn, skipped);
    const payload = `${JSON.stringify(filtered, null, 2)}\n`;
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
  } else if (cmd === 'detail') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    result = await httpJson('GET', `/api/open/tasks/detail/${encodeURIComponent(id)}`, { token });
  } else if (cmd === 'list') {
    const body = args.json ? readJsonArg(args.json) : { current: 1, size: 5 };
    if (!body.size) body.size = 5;
    result = await httpJson('POST', '/api/open/tasks/findPage', { token, body });
    writeSessionFile({
      last_list_filters: { filtersJson: JSON.stringify(body) },
    });
  } else if (cmd === 'update') {
    const id = args.id || args._[1];
    updateBody = readJsonArg(args.json);
    result = await httpJson('POST', `/api/open/tasks/update/${encodeURIComponent(id)}`, {
      token,
      body: updateBody,
    });
    result._updateBody = updateBody;
    result._updateId = id;
  } else if (cmd === 'cancel') {
    const id = args.id || args._[1];
    result = await httpJson('POST', `/api/open/tasks/cancel/${encodeURIComponent(id)}`, {
      token,
      body: {},
    });
    result._cancelId = id;
  } else if (cmd === 'm10') {
    result = await httpJson('GET', '/api/open/metadata/task-dictionaries', { token });
    if (args.pick) {
      const data = result.data || {};
      const mode = String(args.pick);
      if (mode === 'phase') {
        printPickList(
          (data.taskPhase || []).map((name) => ({ name, id: name })),
          { labelKey: 'name', idKey: 'id' },
        );
        return;
      }
      if (mode === 'category') {
        const phase = args.phase || args._[1];
        const cats = (data.phaseCategoryMap && phase && data.phaseCategoryMap[phase]) || [];
        printPickList(
          cats.map((name) => ({ name, id: name })),
          { labelKey: 'name', idKey: 'id' },
        );
        return;
      }
    }
  } else if (cmd === 'requirements') {
    const body = args.json
      ? readJsonArg(args.json)
      : {
          current: 1,
          size: 10,
          ...(args.keyword ? { title: String(args.keyword) } : {}),
        };
    result = await httpJson('POST', '/api/open/requirements/findPage', { token, body });
    if (args.pick) {
      const records = result.data?.records || [];
      printPickList(records, {
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
      printPickList(result.data?.records || [], { labelKey: 'name', idKey: 'id' });
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
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  emitResult(result, cmd, args, createBody, updateBody);
}

function emitResult(result, cmd, args, createBody, updateBody) {
  const payload = { ...result };
  delete payload._updateBody;
  delete payload._updateId;
  delete payload._cancelId;
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, jsonText, 'utf8');
    console.error(`OK: wrote ${outPath}`);
    if ((cmd === 'create' || cmd === 'create-quick') && !args['no-verify']) {
      maybeVerifyFile(outPath);
    }
  }
  if (args.human) {
    if (cmd === 'detail') console.log(formatDetailText(result.data));
    else if (cmd === 'list') console.log(formatListText(result.data));
    else if (cmd === 'create') console.log(formatCreateText(result.data, createBody || {}));
    else if (cmd === 'update') {
      const id = args.id || args._[1] || '';
      console.log(`任务 ${id} 已更新。\n修改字段：${formatUpdateFieldSummary(updateBody)}`);
    } else if (cmd === 'cancel') {
      console.log(`任务 ${args.id || args._[1]} 已取消。`);
    } else if (!outPath) console.log(jsonText.trimEnd());
  } else if (!outPath) {
    console.log(jsonText.trimEnd());
  }
}

function normalizeBody(body, fields) {
  return stringifyFields(body, fields);
}

function persistCreateSession(createBody, data, prepared = {}) {
  writeSessionFile({
    last_create_defaults: {
      requirementId: createBody.requirementId,
      requirementNo: prepared.requirementNo || createBody.requirementNo || '',
      requirementTitle: prepared.requirementTitle || createBody.requirementTitle || '',
      taskPhase: createBody.taskPhase,
      taskCategory: createBody.taskCategory,
    },
    last_task: {
      taskId: data.taskId,
      taskNo: data.taskNo,
      title: createBody.title,
    },
  });
}

async function runCreateFromIntent(intentInput, args) {
  const prepared =
    intentInput.requirementTitle != null
      ? intentInput
      : await prepareQuickCreate(intentInput, { token });
  const bodies = buildCreateBodies(prepared);
  const outDir = args['out-dir'] || args.outDir;
  const results = [];

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const apiResult = await httpJson('POST', '/api/open/tasks/create', { token, body });
    results.push({ body, result: apiResult });
    persistCreateSession(body, apiResult.data || {}, prepared);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const suffix = bodies.length > 1 ? `-${i + 1}` : '';
      const outFile = `${outDir.replace(/\/$/, '')}/create${suffix}.json`;
      fs.writeFileSync(
        outFile,
        `${JSON.stringify(apiResult, null, 2)}\n`,
        'utf8',
      );
      maybeVerifyFile(outFile, args);
    }
  }
  return results;
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

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
