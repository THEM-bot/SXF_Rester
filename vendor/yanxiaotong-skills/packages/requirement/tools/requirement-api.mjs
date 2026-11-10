#!/usr/bin/env node
/**
 * 需求池开放 API 统一 CLI（R01～R05 · M01/M02/M03/M06/M09 · generate-modes）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  httpJson,
  parseJsonText,
  parseCli,
  publicEnvLabel,
  resolveToken,
  stringifyFields,
  writeSessionFile,
  readSessionFile,
} from './lib/requirement-tools.mjs';
import { resolveDocPath } from './lib/resolve-doc-path.mjs';
import { runBatchCreate, loadManifest } from './lib/batch-create.mjs';
import {
  extractCreateNlRemainder,
  parseCreateIntent,
  parseOriginalRequirementRef,
} from './lib/parse-create-intent.mjs';
import {
  refineFromUserInput,
  refineFromOriginalRequirement,
  resolveCreateTitleDescription,
} from './lib/refine-requirement-content.mjs';
import {
  applyDescriptionHtml,
  mergeDescriptionFile,
  writeJsonBodyFile,
} from './lib/write-json-body.mjs';

const require = createRequire(import.meta.url);
const {
  formatDetailText,
  formatCreateText,
  formatListText,
  formatUpdateFieldSummary,
} = require('../scripts/lib/display-humanize.cjs');
const { parseRequirementDoc, scanIterationDirectory } = require('../scripts/lib/parse-requirement-doc.cjs');
const { buildCreateBodyFromParsed } = require('../scripts/lib/create-body-from-doc.cjs');
const {
  loadRequirementUploadDefaults,
  resolveNamesToIds,
} = require('../scripts/lib/parse-upload-defaults.cjs');

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');
const token = args.token || resolveToken({ environment: publicEnvLabel() });
const LONG_ID_FIELDS = [
  'businessDomainId',
  'projectId',
  'appServiceId',
  'teamId',
  'originalRequirementId',
];
const NO_TOKEN_CMDS = new Set([
  'help',
  'parse-create',
  'refine-create',
  'parse-doc',
  'scan-iter',
  'resolve-upload-defaults',
  'write-json-body',
]);

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  requirement-api.mjs create --json body.json   # use --json - to read stdin
  requirement-api.mjs create-from-doc --path file.md [--reuse-defaults] [--json defaults.json]
  requirement-api.mjs write-json-body --json meta.json --out body.json [--description-file desc.txt] [--allow-non-temp]
  requirement-api.mjs detail --id REQ-xxx [--human] [--out file.json]
  requirement-api.mjs list --json query.json [--human] [--out file.json]
  requirement-api.mjs update --id REQ-xxx --json body.json [--human]
  requirement-api.mjs cancel --id REQ-xxx [--reason text]
  requirement-api.mjs m01 [--with-project-hints] [--query k=v ...]
  requirement-api.mjs m02|m03|m06|m09 [--query k=v ...]
  requirement-api.mjs generate-modes [--human] [--out file.json]   # alias: gm（M09.generateModes，对齐创建下拉）
  requirement-api.mjs parse-doc --path dir-or-file.md
  requirement-api.mjs parse-create --text "在 OR-xxx 下新建需求，…" [--or-json or-detail.json]
  requirement-api.mjs refine-create --text "用户说明" [--or-json or-detail.json]
  requirement-api.mjs scan-iter --path {迭代目录} [--strategy auto-req-md] [--out scan.json]
  requirement-api.mjs batch-create --manifest scan.json --reuse-defaults [--out results.json] [--force-conflicts] [--keep-artifacts]
  requirement-api.mjs resolve-upload-defaults [--yml path] [--doc-root path] [--match]`);
    process.exit(0);
  }
  if (!token && !NO_TOKEN_CMDS.has(cmd)) {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  let result;
  let createBody;
  if (cmd === 'write-json-body') {
    // P-239：CLI 代写无 BOM body；中文描述用 --description-file，禁止 node -e 内联
    const outPath = resolveOutPath(args);
    if (!outPath) {
      throw new Error(
        'write-json-body 须 --out <path>（推荐 %TEMP%/req-create-body.json）。' +
          '禁止 PowerShell Set-Content / node -e 含中文拼 JSON（P-131/P-138/P-239）',
      );
    }
    if (!args.json) throw new Error('write-json-body 须 --json <meta.json|→字段文件>');
    const descFile = args['description-file'] || args.descriptionFile || null;
    const merged = mergeDescriptionFile(readJsonArg(args.json), descFile);
    const body = normalizeCreateBody(merged);
    const requireTemp = !(args['allow-non-temp'] || args.allowNonTemp);
    const written = writeJsonBodyFile(outPath, body, { requireTemp });
    result = {
      code: 200,
      success: true,
      message: 'ok',
      data: { path: written.path, bytes: written.bytes, keys: Object.keys(body) },
    };
    console.error(`OK: wrote body ${written.path} (${written.bytes} bytes, no BOM)`);
    emitResult(result, cmd, { ...args, out: null }, null);
    return;
  } else if (cmd === 'create') {
    createBody = normalizeCreateBody(enforceSkillGenerateMode(readJsonArg(args.json)));
    result = await httpJson('POST', '/api/open/requirements/create', { token, body: createBody });
    const d = result.data || {};
    const defaults = await resolveCreateDefaultNames(token, createBody);
    writeSessionFile({
      last_requirement: {
        requirementId: d.requirementId,
        requirementNo: d.requirementNo,
        mappingKey: d.mappingKey || d.requirementNo,
      },
      last_create_defaults: defaults,
    });
  } else if (cmd === 'create-from-doc') {
    createBody = normalizeCreateBody(await buildBodyFromDocArg(args));
    result = await httpJson('POST', '/api/open/requirements/create', { token, body: createBody });
    const d = result.data || {};
    const defaults = await resolveCreateDefaultNames(token, createBody);
    writeSessionFile({
      last_requirement: {
        requirementId: d.requirementId,
        requirementNo: d.requirementNo,
        mappingKey: d.mappingKey || d.requirementNo,
      },
      last_create_defaults: defaults,
    });
  } else if (cmd === 'detail') {
    const id = args.id || args._[1];
    result = await httpJson('GET', `/api/open/requirements/detail/${encodeURIComponent(id)}`, {
      token,
    });
  } else if (cmd === 'list') {
    const body = args.json
      ? readJsonArg(args.json)
      : { current: 1, size: 5 };
    if (!body.size) body.size = 5;
    result = await httpJson('POST', '/api/open/requirements/findPage', { token, body });
  } else if (cmd === 'update') {
    const id = args.id || args._[1];
    // P-241 / P-240：R04 description 同样转 HTML + 中和，避免补全后再成纯文本或被截断
    const body = applyDescriptionHtml(readJsonArg(args.json));
    result = await httpJson('POST', `/api/open/requirements/update/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    result._updateBody = body;
  } else if (cmd === 'cancel') {
    const id = args.id || args._[1];
    result = await httpJson('POST', `/api/open/requirements/cancel/${encodeURIComponent(id)}`, {
      token,
      body: { cancelReason: args.reason || '需求取消' },
    });
  } else if (cmd === 'parse-doc') {
    const inputPath = args.path || args._[1];
    if (!inputPath) throw new Error('--path is required');
    const { resolved } = resolveDocPath(inputPath);
    result = { code: 200, success: true, data: parseRequirementDoc(resolved) };
  } else if (cmd === 'parse-create') {
    const text = args.text || args._[1];
    if (!text) throw new Error('--text is required');
    const orDetail = readOptionalOrJson(args['or-json'] || args.orJson);
    result = {
      code: 200,
      success: true,
      data: parseCreateIntent(String(text), { orDetail }),
    };
  } else if (cmd === 'refine-create') {
    const text = args.text || args._[1] || '';
    const orDetail = readOptionalOrJson(args['or-json'] || args.orJson);
    if (!text && !orDetail) {
      throw new Error('--text 或 --or-json 至少提供一个');
    }
    // 含 OR/原始需求引用时先剥路由壳，避免「原始需求为」误当用户实质正文
    const userTextForRefine =
      text && parseOriginalRequirementRef(text)
        ? extractCreateNlRemainder(text) || ''
        : text;
    const data = orDetail
      ? resolveCreateTitleDescription({ userText: userTextForRefine, orDetail })
      : refineFromUserInput(userTextForRefine);
    if (orDetail && !data.refine_source) {
      Object.assign(data, refineFromOriginalRequirement(orDetail));
    }
    result = { code: 200, success: true, data };
  } else if (cmd === 'scan-iter') {
    const inputPath = args.path || args._[1];
    if (!inputPath) throw new Error('--path is required');
    const { resolved } = resolveDocPath(inputPath);
    const strategy = args.strategy || 'auto-req-md';
    result = { code: 200, success: true, data: scanIterationDirectory(resolved, { strategy }) };
  } else if (cmd === 'resolve-upload-defaults') {
    result = {
      code: 200,
      success: true,
      data: await resolveUploadDefaultsCommand(token, args),
    };
  } else if (cmd === 'batch-create') {
    const manifestPath = args.manifest || args._[1];
    if (!manifestPath) throw new Error('--manifest is required (scan-iter 输出或 items 数组)');
    const items = loadManifest(manifestPath);
    const defaults = resolveDefaults(args['reuse-defaults'] || args.reuseDefaults);
    const summary = await runBatchCreate({
      items,
      defaults,
      forceConflicts: Boolean(args['force-conflicts'] || args.forceConflicts),
      keepArtifacts: Boolean(args['keep-artifacts'] || args.keepArtifacts),
      createOne: async (body) => {
        const normalized = normalizeCreateBody(body);
        const apiResult = await httpJson('POST', '/api/open/requirements/create', {
          token,
          body: normalized,
        });
        const d = apiResult.data || {};
        const sessionDefaults = await resolveCreateDefaultNames(token, normalized);
        writeSessionFile({
          last_requirement: {
            requirementId: d.requirementId,
            requirementNo: d.requirementNo,
            mappingKey: d.mappingKey || d.requirementNo,
          },
          last_create_defaults: sessionDefaults,
        });
        return apiResult;
      },
    });
    result = { code: 200, success: true, data: summary };
  } else if (cmd === 'm01') {
    result = await httpJson('GET', `/api/open/metadata/business-domains?${toQuery(args)}`, {
      token,
    });
    if (args['with-project-hints'] || args.withProjectHints) {
      result = await attachM01ProjectHints(token, result);
    }
  } else if (cmd === 'm02') {
    result = await httpJson('GET', `/api/open/metadata/projects?${toQuery(args)}`, { token });
  } else if (cmd === 'm03') {
    result = await httpJson('GET', `/api/open/metadata/app-services?${toQuery(args)}`, { token });
  } else if (cmd === 'm06') {
    result = await httpJson('GET', `/api/open/metadata/teams?${toQuery(args)}`, { token });
  } else if (cmd === 'm09') {
    result = await httpJson('GET', '/api/open/metadata/requirement-dictionaries', { token });
  } else if (cmd === 'generate-modes' || cmd === 'gm') {
    // 与 m01 拉业务领域同级：专拉已发布生成模式（M09.generateModes，口径同 Web 创建下拉）
    const dict = await httpJson('GET', '/api/open/metadata/requirement-dictionaries', { token });
    const modes = Array.isArray(dict?.data?.generateModes) ? dict.data.generateModes : [];
    result = {
      code: dict?.code ?? 200,
      success: dict?.success !== false,
      message: dict?.message,
      data: { generateModes: modes, total: modes.length },
    };
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
    else if (cmd === 'create' || cmd === 'create-from-doc') {
      console.log(
        formatCreateText(result.data, {
          title: createBody?.title,
          priority: createBody?.priority,
          requirementType: createBody?.requirementType,
          categoryLabel: createBody?.categoryLabel,
        }),
      );
    }
    else if (cmd === 'update') {
      const id = args.id || args._[1] || '';
      const summary = formatUpdateFieldSummary(updateBody);
      console.log(`需求 ${id} 已更新。\n修改字段：${summary}`);
    } else if (cmd === 'generate-modes' || cmd === 'gm') {
      console.log(formatGenerateModesHuman(result.data));
    } else if (!outPath) console.log(jsonText.trimEnd());
  } else if (!outPath) {
    console.log(jsonText.trimEnd());
  }
}

/** 生成模式人读列表（对齐 m01 序号点选习惯） */
function formatGenerateModesHuman(data) {
  const modes = Array.isArray(data?.generateModes) ? data.generateModes : [];
  if (!modes.length) {
    return '当前环境暂无已发布且启用的生成模式（请到 AI-Coding 配置发布后再拉）。';
  }
  const lines = [`可选生成模式（共 ${modes.length} 项，与创建需求下拉一致）：`];
  modes.forEach((m, i) => {
    const name = m.modeName || '(未命名)';
    const ver = m.latestVersionNo != null ? `v${m.latestVersionNo}` : '未发布';
    const desc = m.description ? ` · ${m.description}` : '';
    lines.push(`${i + 1}. ${name}（${ver}） id=${m.id}${desc}`);
  });
  lines.push('点选后 create/create-from-doc 须传 generateModeName=上表 modeName（精确匹配）。');
  return lines.join('\n');
}

/** P-206：拒绝 PowerShell 管道下 --out 无路径（parseCli 得 true） */
function resolveOutPath(args) {
  const out = args.out;
  if (out == null || out === '' || out === true) {
    if (out === true) {
      throw new Error(
        '--out 缺少文件路径（常见于 PowerShell 管道 + --json - + --out 三连）。' +
          '请改用：write-json-body --json meta.json --out body.json 后 create --json body.json --out resp.json（P-239）',
      );
    }
    return null;
  }
  return String(out);
}

function toQuery(args) {
  const q = new URLSearchParams();
  const skip = new Set([
    '_',
    'token',
    'json',
    'id',
    'reason',
    'help',
    'human',
    'out',
    'debug',
    'path',
    'text',
    'manifest',
    'strategy',
    'reuse-defaults',
    'reuseDefaults',
    'force-conflicts',
    'forceConflicts',
    'keep-artifacts',
    'keepArtifacts',
    'with-project-hints',
    'withProjectHints',
    'yml',
    'doc-root',
    'docRoot',
    'match',
    'description-file',
    'descriptionFile',
    'allow-non-temp',
    'allowNonTemp',
  ]);
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

/** 读取原始需求详情 JSON（支持整包响应 {data} 或直接 data 对象） */
function readOptionalOrJson(jsonPath) {
  if (!jsonPath) return null;
  const parsed = readJsonArg(jsonPath);
  if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') {
    return parsed.data;
  }
  return parsed;
}

function normalizeCreateBody(body) {
  // P-241 / P-240：R01 / batch-create / write-json-body / create-from-doc 统一转 HTML
  return applyDescriptionHtml(stringifyFields(body, LONG_ID_FIELDS));
}

/** 技能路径：AI_CODING 无 generateModeName 时拒绝（开放空名可成功的旁路在此堵上） */
function enforceSkillGenerateMode(body) {
  const impl = String(body.implementationType || 'AI_CODING').toUpperCase();
  const isTraditional = impl === 'TRADITIONAL' || /传统/.test(String(body.implementationType || ''));
  if (isTraditional) return body;
  const name = (body.generateModeName || '').trim();
  if (!name) {
    throw new Error(
      'AI-Coding 创建须提供 generateModeName（文档属性「AI-Coding生成模式」）。请用 create-from-doc 或确认表选定后再 create。',
    );
  }
  return body;
}

async function buildBodyFromDocArg(cliArgs) {
  const inputPath = cliArgs.path || cliArgs._[1];
  if (!inputPath) throw new Error('create-from-doc 须 --path 文档');
  const { resolved } = resolveDocPath(String(inputPath));
  const doc = parseRequirementDoc(resolved);
  if (!doc.ok || !doc.parsed) {
    throw new Error(doc.error || '文档解析失败');
  }
  let defaults = {};
  if (cliArgs.json) {
    defaults = readJsonArg(cliArgs.json);
  } else if (cliArgs['reuse-defaults'] || cliArgs.reuseDefaults) {
    defaults = resolveDefaults(true);
  } else {
    throw new Error('create-from-doc 须 --reuse-defaults 或 --json defaults.json（含六必填）');
  }
  return buildCreateBodyFromParsed(doc.parsed, defaults);
}

async function resolveCreateDefaultNames(token, body) {
  const defaults = {
    businessDomainId: body.businessDomainId,
    businessDomainName: body.businessDomainName || '',
    teamId: body.teamId || '',
    teamName: body.teamName || '',
    projectId: body.projectId,
    projectName: body.projectName || '',
    appServiceId: body.appServiceId,
    appServiceName: body.appServiceName || '',
    requirementLevel: body.requirementLevel,
    priority: body.priority || '',
    requirementType: body.requirementType || '',
  };

  if (!defaults.businessDomainName) {
    defaults.businessDomainName = await lookupName(token, '/api/open/metadata/business-domains?current=1&size=2000', defaults.businessDomainId);
  }
  if (!defaults.teamName && defaults.teamId) {
    defaults.teamName = await lookupName(
      token,
      '/api/open/metadata/teams?current=1&size=2000',
      defaults.teamId,
    );
  }
  if (!defaults.projectName && defaults.businessDomainId) {
    defaults.projectName = await lookupName(
      token,
      `/api/open/metadata/projects?businessDomainId=${encodeURIComponent(defaults.businessDomainId)}&current=1&size=2000`,
      defaults.projectId
    );
  }
  if (!defaults.appServiceName) {
    const byDomain = defaults.businessDomainId
      ? await lookupName(
          token,
          `/api/open/metadata/app-services?businessDomainId=${encodeURIComponent(defaults.businessDomainId)}&current=1&size=2000`,
          defaults.appServiceId
        )
      : '';
    defaults.appServiceName =
      byDomain || (await lookupName(token, '/api/open/metadata/app-services?current=1&size=2000', defaults.appServiceId));
  }
  return defaults;
}

/** P-223：M01 列表附带 M02 项目脚注，禁止 Agent 用复杂 node -e 批量探测 */
async function attachM01ProjectHints(token, m01Result) {
  const records = m01Result.data?.records || [];
  const enriched = [];
  for (const rec of records) {
    const item = { ...rec, projectHint: '' };
    try {
      const m02 = await httpJson(
        'GET',
        `/api/open/metadata/projects?businessDomainId=${encodeURIComponent(rec.id)}&current=1&size=1`,
        { token },
      );
      const total = Number(m02.data?.total ?? m02.data?.records?.length ?? 0);
      item.projectHint = total > 0 ? '' : '（暂无关联项目）';
    } catch {
      item.projectHint = '（未能探测关联项目，请慎选）';
    }
    enriched.push(item);
  }
  return { ...m01Result, data: { ...m01Result.data, records: enriched } };
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

function resolveDefaults(reuseFlag) {
  if (!reuseFlag) {
    throw new Error('batch-create 须 --reuse-defaults 或 manifest 内带 defaults');
  }
  const session = readSessionFile();
  const defs = session?.last_create_defaults || {};
  if (!defs.businessDomainId || !defs.projectId || !defs.appServiceId || !defs.requirementLevel) {
    throw new Error('会话无完整 last_create_defaults');
  }
  return defs;
}

/** SC-260802-005：读 product-repos.yml 预填；可选 --match 调 M01/M06|M02/M03 名称匹配 */
async function resolveUploadDefaultsCommand(token, args) {
  const loaded = loadRequirementUploadDefaults({
    ymlPath: args.yml,
    docRoot: args['doc-root'] || args.docRoot,
  });
  const out = {
    ...loaded,
    matchAttempted: false,
    resolved: null,
    unresolved: [],
    fallbackHint:
      'yml 无效或匹配失败时回退会话 last_create_defaults / M01·M06·M02·M03 点选；禁止静默猜 ID',
  };
  if (!loaded.effective) {
    return out;
  }
  if (!(args.match || args.Match) || !token) {
    out.hint = token
      ? '已读到预填名；加 --match 可尝试名称→ID'
      : '已读到预填名；无 token 时仅返回中文名，Agent 拉元数据后匹配';
    return out;
  }

  out.matchAttempted = true;
  const domainsResp = await httpJson(
    'GET',
    '/api/open/metadata/business-domains?current=1&size=2000',
    { token },
  );
  const domains = domainsResp.data?.records || [];
  const domainOnly = resolveNamesToIds(
    {
      business_domain_name: loaded.defaults.business_domain_name,
      feature_team_name: '',
      app_service_name: '',
    },
    { domains, teams: [], projects: [], appServices: [] },
  );
  const domainIdForChild = domainOnly.resolved.businessDomainId;

  const teamsResp = await httpJson(
    'GET',
    '/api/open/metadata/teams?current=1&size=2000',
    { token },
  );
  const teams = teamsResp.data?.records || [];

  let projects = [];
  let appServices = [];
  if (domainIdForChild) {
    const m02 = await httpJson(
      'GET',
      `/api/open/metadata/projects?businessDomainId=${encodeURIComponent(domainIdForChild)}&current=1&size=2000`,
      { token },
    );
    projects = m02.data?.records || [];
    const m03 = await httpJson(
      'GET',
      `/api/open/metadata/app-services?businessDomainId=${encodeURIComponent(domainIdForChild)}&current=1&size=2000`,
      { token },
    );
    appServices = m03.data?.records || [];
  } else {
    const m03 = await httpJson('GET', '/api/open/metadata/app-services?current=1&size=2000', {
      token,
    });
    appServices = m03.data?.records || [];
  }

  const matched = resolveNamesToIds(loaded.defaults, { domains, teams, projects, appServices });
  out.resolved = matched.resolved;
  out.unresolved = matched.unresolved;
  return out;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
