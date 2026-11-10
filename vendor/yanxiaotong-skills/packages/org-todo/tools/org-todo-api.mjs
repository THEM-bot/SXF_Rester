#!/usr/bin/env node
/**
 * 组织待办开放 API 统一 CLI（API-OT01～OT05 · M01/M02/M05 点选 · Token 用户）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  defaultPlannedCloseAt,
  formatOwnerDisplay,
  httpJson,
  parseCli,
  parseEmployeeIdFromDisplay,
  plainTextToDescriptionHtml,
  printPickList,
  progressTextToBodyHtml,
  publicEnvLabel,
  readJsonArg,
  readSessionFile,
  resolveOutPath,
  resolveToken,
  stringifyFields,
  VERIFY_CJS,
  writeSessionFile,
} from './lib/org-todo-tools.mjs';
import {
  mergeDescriptionFile,
  writeJsonBodyFile,
} from './lib/write-json-body.mjs';

const require = createRequire(import.meta.url);
const {
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateText,
  formatProgressText,
} = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');
const token = args.token || resolveToken({ environment: publicEnvLabel() });
const LONG_ID_FIELDS = ['projectIds'];

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  org-todo-api.mjs create --json body.json [--progress-file p.txt|--progress-text "…"] [--human] [--out file.json]
  org-todo-api.mjs detail --id OT-xxx [--human] [--out file.json]
  org-todo-api.mjs list --json query.json [--human] [--out file.json]
  org-todo-api.mjs append-progress --id OT-xxx --json body.json [--human] [--out file.json]
  org-todo-api.mjs append-progress --id OT-xxx --text "进展正文" [--human] [--out file.json]
  org-todo-api.mjs update --id OT-xxx --json body.json [--human] [--out file.json]
  org-todo-api.mjs write-json-body --json meta.json --description-file desc.txt --out body.json
  org-todo-api.mjs m01 [--with-project-hints] [--pick] [--out picks.json]
  org-todo-api.mjs m02 --businessDomainId id [--pick] [--out picks.json]
  org-todo-api.mjs m05 [--keyword 张三] [--pick] [--out picks.json]
  org-todo-api.mjs resolve-token-user [--human] [--out user.json]`);
    process.exit(0);
  }
  if (!token && cmd !== 'write-json-body') {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  let result;
  let createBody;
  let updateBody;
  let progressBody;

  if (cmd === 'write-json-body') {
    const meta = readJsonArg(args.json);
    const body = mergeDescriptionFile(meta, args['description-file'], args['title-file']);
    // 创建禁 status
    if (Object.prototype.hasOwnProperty.call(body, 'status')) delete body.status;
    const out = args.out;
    if (!out) throw new Error('--out is required');
    const { path: written } = writeJsonBodyFile(out, body);
    console.error(`OK: wrote ${written}`);
    return;
  }

  if (cmd === 'resolve-token-user') {
    const user = await resolveTokenUser(token);
    const payload = { success: true, code: 200, data: user };
    const outPath = resolveOutPath(args);
    if (outPath) {
      fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      console.error(`OK: wrote ${outPath}`);
    }
    if (args.human) {
      console.log(`令牌用户：${formatOwnerDisplay(user)}`);
    } else if (!outPath) {
      console.log(JSON.stringify(payload, null, 2));
    }
    return;
  }

  if (cmd === 'create') {
    const rawCreate = readJsonArg(args.json);
    const sessionNames = {
      businessDomainName: rawCreate.businessDomainName || '',
      projectName: rawCreate.projectName || '',
    };
    createBody = normalizeCreateBody(rawCreate, LONG_ID_FIELDS);
    const needOwners = !Array.isArray(createBody.owners) || !createBody.owners.length;
    const needProposed = !createBody.proposedBy;
    let tokenUser;
    if (needOwners || needProposed) {
      tokenUser = await resolveTokenUser(token);
    }
    if (needOwners) {
      createBody.owners = [tokenUser.employeeId];
    }
    if (needProposed) {
      createBody.proposedBy = tokenUser.employeeId;
    }
    if (!createBody.plannedCloseAt) {
      createBody.plannedCloseAt = defaultPlannedCloseAt();
    }
    result = await httpJson('POST', '/api/open/org-todos', { token, body: createBody });
    persistCreateSession(createBody, result.data || {}, sessionNames);
    await maybeCacheTokenUserFromDetail(token, result.data?.orgTodoNo);
    const progressPlain = readCreateProgressPlain(args);
    if (progressPlain) {
      const orgTodoNo = result.data?.orgTodoNo;
      if (!orgTodoNo) {
        throw new Error('创建成功但未返回编号，无法写入首条进展');
      }
      try {
        const progressRes = await httpJson(
          'POST',
          `/api/open/org-todos/${encodeURIComponent(orgTodoNo)}/progress`,
          {
            token,
            body: { bodyHtml: progressTextToBodyHtml(progressPlain) },
          },
        );
        result.data = {
          ...(result.data || {}),
          firstProgress: progressRes.data || null,
          firstProgressWritten: true,
        };
        result._firstProgressPlain = progressPlain;
      } catch (progErr) {
        result.data = {
          ...(result.data || {}),
          firstProgressWritten: false,
          firstProgressError: String(progErr?.message || progErr),
        };
        result._firstProgressPlain = '';
        console.error(
          `WARN: 组织待办已创建（${orgTodoNo}），但首条进展写入失败：${progErr?.message || progErr}`,
        );
      }
    }
  } else if (cmd === 'detail') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    result = await httpJson('GET', `/api/open/org-todos/detail/${encodeURIComponent(id)}`, { token });
    cacheTokenUserFromDetailData(result.data);
  } else if (cmd === 'list') {
    const body = args.json ? readJsonArg(args.json) : { current: 1, size: 5 };
    if (!body.size) body.size = 5;
    if (!body.current) body.current = 1;
    result = await httpJson('POST', '/api/open/org-todos/findPage', { token, body });
    writeSessionFile({
      ...readSessionFile(),
      last_list_filters: { filtersJson: JSON.stringify(body) },
    });
  } else if (cmd === 'append-progress') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    if (args.text) {
      progressBody = { bodyHtml: progressTextToBodyHtml(args.text) };
    } else {
      progressBody = readJsonArg(args.json);
    }
    result = await httpJson('POST', `/api/open/org-todos/${encodeURIComponent(id)}/progress`, {
      token,
      body: progressBody,
    });
    result._progressId = id;
  } else if (cmd === 'update') {
    const id = args.id || args._[1];
    if (!id) throw new Error('--id is required');
    updateBody = normalizeBody(readJsonArg(args.json), LONG_ID_FIELDS);
    result = await httpJson('PATCH', `/api/open/org-todos/${encodeURIComponent(id)}`, {
      token,
      body: updateBody,
    });
    result._updateBody = updateBody;
    result._updateId = id;
  } else if (cmd === 'm01') {
    result = await httpJson('GET', '/api/open/metadata/business-domains?current=1&size=50', { token });
    const records = result.data?.records || result.data || [];
    const list = Array.isArray(records) ? records : [];
    if (args.pick) {
      const picks = printPickList(list, {
        labelKey: 'name',
        idKey: 'id',
        hideId: true,
        extra: args['with-project-hints']
          ? (r) => (r.projectHint ? `(${r.projectHint})` : '')
          : undefined,
      });
      writePicksOut(args.out, picks);
      return;
    }
  } else if (cmd === 'm02') {
    const domainId = args.businessDomainId || args._[1];
    if (!domainId) throw new Error('--businessDomainId is required');
    result = await httpJson(
      'GET',
      `/api/open/metadata/projects?businessDomainId=${encodeURIComponent(domainId)}&current=1&size=50`,
      { token },
    );
    const records = result.data?.records || result.data || [];
    if (args.pick) {
      const picks = printPickList(Array.isArray(records) ? records : [], {
        labelKey: 'name',
        idKey: 'id',
        hideId: true,
      });
      writePicksOut(args.out, picks);
      return;
    }
  } else if (cmd === 'm05') {
    const q = args.keyword
      ? `keyword=${encodeURIComponent(String(args.keyword))}&current=1&size=20`
      : 'current=1&size=20';
    result = await httpJson('GET', `/api/open/metadata/users?${q}`, { token });
    const records = result.data?.records || [];
    if (args.pick) {
      const picks = printPickList(records, {
        labelKey: 'name',
        idKey: 'employeeId',
        hideId: true,
        extra: (r) => (r.employeeId ? `（${r.employeeId}）` : ''),
      });
      writePicksOut(args.out, picks);
      return;
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  emitResult(result, cmd, args, createBody, updateBody, progressBody);
}

function writePicksOut(out, picks) {
  if (!out) return;
  const written = writeJsonBodyFile(out, picks || []);
  console.error(`OK: wrote ${written.path}`);
}

/** 创建可选首条进展（对齐 Web progressHtml；开放 API 无该字段，串 OT04） */
function readCreateProgressPlain(args) {
  const fromFile = args['progress-file'];
  if (fromFile && fromFile !== true) {
    const text = fs
      .readFileSync(fromFile, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    return text || '';
  }
  if (args['progress-text'] != null && args['progress-text'] !== true) {
    return String(args['progress-text']).trim();
  }
  return '';
}

function normalizeBody(body, longIdFields) {
  const out = { ...(body || {}) };
  if (Array.isArray(out.projectIds)) {
    out.projectIds = out.projectIds.map((x) => String(x));
  }
  if (out.businessDomain != null && out.businessDomain !== '') {
    out.businessDomain = String(out.businessDomain);
  }
  return stringifyFields(out, longIdFields);
}

function normalizeCreateBody(body, longIdFields) {
  const out = normalizeBody(body, longIdFields);
  // 创建轨禁止传 status（固定服务端 PENDING）
  if (Object.prototype.hasOwnProperty.call(out, 'status')) delete out.status;
  // 会话展示字段不进开放 API
  delete out.businessDomainName;
  delete out.projectName;
  return out;
}

async function resolveTokenUser(token) {
  const prev = readSessionFile() || {};
  if (prev.token_user?.employeeId) {
    return {
      employeeId: String(prev.token_user.employeeId),
      name: prev.token_user.name || '',
      source: 'session',
    };
  }
  if (prev.last_org_todo?.orgTodoNo) {
    const detail = await httpJson(
      'GET',
      `/api/open/org-todos/detail/${encodeURIComponent(prev.last_org_todo.orgTodoNo)}`,
      { token },
    );
    const user = extractTokenUserFromDetail(detail.data);
    if (user?.employeeId) {
      cacheTokenUser(user);
      return { ...user, source: 'last_org_todo' };
    }
  }
  // 回退：拉最近列表，用提出人（通常为 Token 用户创建）
  const list = await httpJson('POST', '/api/open/org-todos/findPage', {
    token,
    body: { current: 1, size: 5 },
  });
  const records = list.data?.records || [];
  for (const row of records) {
    const emp = parseEmployeeIdFromDisplay(row.proposedBy);
    if (emp) {
      const name = String(row.proposedBy || '')
        .replace(emp, '')
        .replace(/[（）()\s]+$/g, '')
        .trim();
      const user = { employeeId: emp, name: name || emp };
      cacheTokenUser(user);
      return { ...user, source: 'list_proposedBy' };
    }
  }
  throw new Error('无法解析 Token 用户工号，请提供负责人工号或姓名');
}

function extractTokenUserFromDetail(data) {
  if (!data) return null;
  const fromProposed = parseEmployeeIdFromDisplay(data.proposedBy);
  if (fromProposed) {
    const name = String(data.proposedBy || '')
      .replace(fromProposed, '')
      .replace(/[（）()\s]+$/g, '')
      .trim();
    return { employeeId: fromProposed, name: name || fromProposed };
  }
  const owners = data.owners || [];
  if (owners.length === 1) {
    const o = owners[0];
    const id = o.employeeId || o.ownerId || '';
    if (id) {
      return {
        employeeId: String(id),
        name: o.name || o.ownerName || String(id),
      };
    }
  }
  return null;
}

function cacheTokenUser(user) {
  if (!user?.employeeId) return;
  const prev = readSessionFile() || {};
  writeSessionFile({
    ...prev,
    token_user: {
      employeeId: String(user.employeeId),
      name: user.name || '',
    },
  });
}

function cacheTokenUserFromDetailData(data) {
  const user = extractTokenUserFromDetail(data);
  if (user) cacheTokenUser(user);
}

async function maybeCacheTokenUserFromDetail(token, orgTodoNo) {
  if (!orgTodoNo) return;
  try {
    const detail = await httpJson(
      'GET',
      `/api/open/org-todos/detail/${encodeURIComponent(orgTodoNo)}`,
      { token },
    );
    cacheTokenUserFromDetailData(detail.data);
  } catch {
    /* ignore */
  }
}

function persistCreateSession(body, data, sessionNames = {}) {
  const prev = readSessionFile() || {};
  const prevDefs = prev.last_create_defaults || {};
  const hasDomain = body.businessDomain != null && String(body.businessDomain).trim() !== '';
  const hasProject = Array.isArray(body.projectIds) && body.projectIds.length > 0;
  const domainNameFromData = data.businessDomainName || '';
  const projectNameFromData =
    (Array.isArray(data.projectNames) && data.projectNames[0]) || data.projectName || '';
  writeSessionFile({
    ...prev,
    last_create_defaults: {
      businessDomain: hasDomain ? String(body.businessDomain) : prevDefs.businessDomain || '',
      businessDomainName: hasDomain
        ? String(sessionNames.businessDomainName || domainNameFromData || prevDefs.businessDomainName || '')
        : prevDefs.businessDomainName || '',
      projectId: hasProject ? String(body.projectIds[0]) : prevDefs.projectId || '',
      projectName: hasProject
        ? String(sessionNames.projectName || projectNameFromData || prevDefs.projectName || '')
        : prevDefs.projectName || '',
      owners: Array.isArray(body.owners) ? body.owners.join(',') : prevDefs.owners || '',
    },
    last_org_todo: {
      orgTodoNo: data.orgTodoNo || '',
      orgTodoId: data.orgTodoId || '',
      title: data.title || '',
    },
    token_user: prev.token_user || {},
  });
}

function emitResult(result, cmd, args, createBody, updateBody, progressBody) {
  const payload = { ...result };
  delete payload._updateBody;
  delete payload._updateId;
  delete payload._progressId;
  delete payload._firstProgressPlain;
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, jsonText, 'utf8');
    console.error(`OK: wrote ${outPath}`);
    if ((cmd === 'create' || cmd === 'append-progress' || cmd === 'update') && !args['no-verify']) {
      maybeVerifyFile(outPath);
    }
  }
  if (args.human) {
    if (cmd === 'detail') {
      console.log(formatDetailText(result.data, { env: publicEnvLabel() }));
    } else if (cmd === 'list') console.log(formatListText(result.data));
    else if (cmd === 'create') {
      console.log(
        formatCreateText(result.data, {
          ...createBody,
          env: publicEnvLabel(),
          firstProgressPlain: result._firstProgressPlain || '',
        }),
      );
    } else if (cmd === 'append-progress') {
      console.log(formatProgressText(result.data, args.id || args._[1]));
    } else if (cmd === 'update') {
      const id = args.id || args._[1] || '';
      console.log(formatUpdateText(id, updateBody));
    } else if (!outPath) console.log(jsonText.trimEnd());
  } else if (!outPath) {
    console.log(jsonText.trimEnd());
  }
}

function maybeVerifyFile(file) {
  try {
    execFileSync(process.execPath, [VERIFY_CJS, file], { stdio: 'pipe' });
    console.error(`OK: verified ${file}`);
  } catch (e) {
    console.error(`verify failed: ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

export { plainTextToDescriptionHtml, progressTextToBodyHtml };
