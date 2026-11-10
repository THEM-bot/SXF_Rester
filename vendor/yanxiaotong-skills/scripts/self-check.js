#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PACK_ROOT = path.resolve(__dirname, '..');
const PACK_NAME = path.basename(PACK_ROOT);
const STANDARD_LIMIT = 50;

const FORBIDDEN_SUBSTRINGS = [
  '.cursor/skills/',
  '.cursor/atomic/',
  '.cursor/scripts/',
  '.cursor/rules/',
  '.claude/skills/',
  'efficiency-hub-doc/',
];

const SUB_PACKAGES = [
  { dir: 'packages/demo', contract: 'reference/upload/open-api-upload.md' },
  { dir: 'packages/original-requirement', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/requirement', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/task', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/defect', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/org-todo', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/problem-ticket', contract: 'reference/open-api-contract.md' },
  { dir: 'packages/skill-sync', contract: 'reference/open-api-sync.md' },
];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

function listFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'regression') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, acc);
    else if (/\.(md|js|mjs|cjs|json|yaml|yml)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

const packYaml = path.join(PACK_ROOT, 'pack.yaml');
if (!fs.existsSync(packYaml)) {
  fail('missing pack.yaml');
} else {
  const t = fs.readFileSync(packYaml, 'utf8');
  if (!/^name:\s/m.test(t)) fail('pack.yaml: missing name');
  if (!/requires:\s*\[\]/m.test(t)) fail('pack.yaml: requires must be []');
  if (!/entry:\s*SKILL\.md/m.test(t)) fail('pack.yaml: entry must be SKILL.md');
}

const skillPath = path.join(PACK_ROOT, 'SKILL.md');
if (!fs.existsSync(skillPath)) {
  fail('missing SKILL.md');
} else {
  const raw = fs.readFileSync(skillPath, 'utf8').replace(/^\uFEFF/, '');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fmMatch) {
    fail('SKILL.md: missing YAML frontmatter');
  } else {
    const fm = fmMatch[1];
    const skillBody = raw.slice(fmMatch[0].length);
    if (!/^name:\s/m.test(fm)) fail('SKILL.md: frontmatter missing name');
    if (!/^description:/m.test(fm)) fail('SKILL.md: frontmatter missing description');
    if (!/disable-model-invocation:\s*true/.test(fm)) {
      fail('SKILL.md: frontmatter missing disable-model-invocation: true');
    }
    const lines = skillBody.trimEnd() ? skillBody.trimEnd().split(/\r?\n/).length : 0;
    if (lines > STANDARD_LIMIT) fail(`SKILL.md body has ${lines} lines (max ${STANDARD_LIMIT})`);
  }
}

const SUB_PACK_ENTRY = 'PACK.md';

if (fs.existsSync(path.join(PACK_ROOT, 'reference'))) {
  fail('pack root reference/ must not exist; use router/');
}

for (const rel of [
  'router/boot.md',
  'router/public-env.md',
  'router/token-store.md',
  'router/skill-sync-daily.md',
  'router/intent-menu.md',
  'router/response-templates.md',
  'router/routing-rules.md',
  'router/operation-resolution.md',
  'router/open-api-errors.md',
  'router/step-completion-gate.md',
  'router/open-api-common.md',
  'tools/token-store.mjs',
  'tools/env-session.mjs',
  'tools/skill-sync-daily.mjs',
  'tools/first-screen.mjs',
  'tools/entry-bootstrap.mjs',
  'tools/lib/open-api-token.mjs',
  'tools/lib/skill-sync-daily.mjs',
  'tools/lib/first-screen.mjs',
  'tools/lib/run-daily-skill-sync.mjs',
]) {
  if (!fs.existsSync(path.join(PACK_ROOT, rel))) fail(`missing ${rel}`);
}

for (const pkg of SUB_PACKAGES) {
  const base = path.join(PACK_ROOT, pkg.dir);
  if (!fs.existsSync(base)) {
    fail(`missing sub-package: ${pkg.dir}/`);
    continue;
  }
  for (const rel of [
    SUB_PACK_ENTRY,
    'pack.yaml',
    'README.md',
    '快速入门.md',
    'reference/instructions.md',
    'reference/step-completion-gate.md',
    pkg.contract,
  ]) {
    if (!fs.existsSync(path.join(base, rel))) fail(`missing ${pkg.dir}/${rel}`);
  }
  if (fs.existsSync(path.join(base, 'SKILL.md'))) {
    fail(`${pkg.dir}/SKILL.md: nested SKILL.md forbidden (platform discovers only top-level SKILL.md)`);
  }
  const subPackYaml = path.join(base, 'pack.yaml');
  if (fs.existsSync(subPackYaml)) {
    const t = fs.readFileSync(subPackYaml, 'utf8');
    if (!/entry:\s*PACK\.md/m.test(t)) fail(`${pkg.dir}/pack.yaml: entry must be PACK.md`);
  }
}

const bootPath = path.join(PACK_ROOT, 'router/boot.md');
if (!fs.existsSync(bootPath)) {
  fail('missing router/boot.md');
} else {
  const boot = fs.readFileSync(bootPath, 'utf8');
  const intentMenu = fs.readFileSync(path.join(PACK_ROOT, 'router/intent-menu.md'), 'utf8');
  if (!/顶层独立/.test(boot) || !/内部模块/.test(boot)) {
    fail('router/boot.md: missing top-level independence / internal module constraints');
  }
  if (!/T-FIRST-SCREEN/.test(fs.readFileSync(path.join(PACK_ROOT, 'router/intent-menu.md'), 'utf8'))) {
    fail('router/intent-menu.md: must reference T-FIRST-SCREEN');
  }
  if (!/token 已通过|env \+ token/.test(intentMenu)) {
    fail('router/intent-menu.md: must state env + token gate before T-FIRST-SCREEN');
  }
  if (!/禁止.*(?:向用户展示|作为).*(?:路由|json)|禁止向用户展示路由/i.test(intentMenu)) {
    fail('router/intent-menu.md: must forbid exposing routing JSON to user (P-218)');
  }
  if (!/P-218|禁止向用户展示路由/.test(boot)) {
    fail('router/boot.md: missing forbid routing JSON to user (P-218)');
  }
  if (!/禁止目录导览|目录导览/.test(boot)) {
    fail('router/boot.md: missing anti-tour constraints');
  }
  if (!/token 门禁|pending_token/.test(boot)) {
    fail('router/boot.md: missing token gate');
  }
  if (!/§0a|Q22|环境自动解析/.test(boot)) {
    fail('router/boot.md: missing env auto-resolve (Q22)');
  }
  if (!/entry-bootstrap/.test(boot)) fail('router/boot.md: missing entry-bootstrap (P-205)');
  if (!/§0c|skill-sync-daily|P-271/.test(boot)) {
    fail('router/boot.md: missing daily skill-sync check (P-271)');
  }
  if (!/P-411|无论有无输入|entry-bootstrap.*daily|daily.*entry-bootstrap|user_visible_text/.test(boot)) {
    fail('router/boot.md: §0c must run in entry-bootstrap regardless of trailing input (P-411)');
  }
  if (!/P-412|self_update_pending|self_update_apply_cmd/.test(boot)) {
    fail('router/boot.md: missing main-pack self-update two-phase (P-412)');
  }
  if (!/first-screen\.mjs|user_visible_text|T-FIRST-SCREEN/.test(boot)) {
    fail('router/boot.md: must cover first-screen / user_visible_text (P-273)');
  }
  if (/daily-auto.*--human/.test(boot) && !/first-screen/.test(boot)) {
    fail('router/boot.md: §0c must use first-screen not standalone daily-auto --human (P-273)');
  }
  if (/不.*自动 update|禁止.*自动 update/.test(boot)) {
    fail('router/boot.md: §0c must auto-update on daily run (P-271)');
  }
  if (!/&& 非法|InvalidEndOfLine/.test(boot)) fail('router/boot.md: missing Windows && prohibition (P-205)');
  if (!/Demo 子包 PACK_ROOT|packages\/demo\/tools\/pack-mock-zip/.test(boot)) {
    fail('router/boot.md: missing demo PACK_ROOT tool path guard');
  }
  const rt = path.join(PACK_ROOT, 'router/response-templates.md');
  if (!fs.existsSync(rt)) fail('missing router/response-templates.md');
  else {
    const t = fs.readFileSync(rt, 'utf8');
    if (!/请选择.*环境：/.test(t)) fail('response-templates: T-ENV-SWITCH must include 请选择环境');
    if (!/T-FIRST-SCREEN/.test(t)) fail('response-templates: missing T-FIRST-SCREEN (P-273)');
    if (!/研效通技能助手/.test(t)) fail('response-templates: T-FIRST-SCREEN opener missing');
    if (!/4\. 任务/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 任务 menu');
    if (!/5\. 缺陷/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 缺陷 menu');
    if (!/6\. 技能包/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 技能包 menu');
    if (!/7\. 组织待办/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 组织待办 menu');
    if (!/8\. 问题单/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 问题单 menu');
    if (!/须令牌：/.test(t)) fail('response-templates: T-FIRST-SCREEN must include 须令牌 line');
    if (!/T-ROUTER-DEMO-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-DEMO-HANDOFF');
    if (!/T-ROUTER-REQ-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-REQ-HANDOFF');
    if (!/T-ROUTER-OR-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-OR-HANDOFF');
    if (!/T-ROUTER-TASK-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-TASK-HANDOFF');
    if (!/T-ROUTER-DEFECT-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-DEFECT-HANDOFF');
    if (!/T-ROUTER-OT-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-OT-HANDOFF');
    if (!/T-ROUTER-PT-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-PT-HANDOFF');
    if (!/T-ROUTER-SYNC-HANDOFF/.test(t)) fail('response-templates: missing T-ROUTER-SYNC-HANDOFF');
    if (/原始需求受理（暂未开放）/.test(t)) fail('response-templates: original-requirement menu still planned');
    if (!/T-MULTI-INTENT-SPLIT/.test(t)) fail('response-templates: missing T-MULTI-INTENT-SPLIT');
    if (!/T-MULTI-INTENT-SPLIT[\s\S]*原始需求/.test(t)) {
      fail('response-templates: T-MULTI-INTENT-SPLIT must include 原始需求 (P-379)');
    }
    if (!/T-API-UNREACHABLE/.test(t)) fail('response-templates: missing T-API-UNREACHABLE (P-409)');
    if (!/同轮下一步/.test(t)) fail('response-templates: handoff missing 同轮下一步 (P-407)');
    if (!/T-TOKEN-ASK/.test(t)) fail('response-templates: missing T-TOKEN-ASK');
    if (!/T-ENV-SWITCH/.test(t)) fail('response-templates: missing T-ENV-SWITCH (Q22)');
    if (!/env_source_suffix/.test(t)) fail('response-templates: T-FIRST-SCREEN must use env_source_suffix (Q24)');
    if (!/禁止.*paraphrase|原样贴/.test(t)) fail('response-templates: must forbid paraphrase CLI output (P-297)');
    if (/默认 UAT/.test(t)) {
      fail('response-templates: stale 默认 UAT wording (Q25 default is prod)');
    }
    if (!/禁止.*每轮.*T-ENV-ASK|废止 Q20/.test(t)) {
      fail('response-templates: must forbid per-round T-ENV-ASK (Q22)');
    }
    if (!/当前环境「\{env_label\}」/.test(t)) fail('response-templates: T-TOKEN-ASK must include env_label');
    if (!/T-SUBPKG-REDIRECT/.test(t)) fail('response-templates: missing T-SUBPKG-REDIRECT');
    if (!/\*\*请提供项目路径\*\*/.test(t)) fail('response-templates: T-ROUTER-DEMO-HANDOFF must highlight project path');
    if (!/T-ROUTER-DEMO-HANDOFF[\s\S]*当前环境：\{env_label\}/.test(t)) {
      fail('response-templates: T-ROUTER-DEMO-HANDOFF must include env_label (P-148)');
    }
    if (!/T-DAILY-SYNC-COMPACT/.test(t)) fail('response-templates: missing T-DAILY-SYNC-COMPACT (P-273)');
    if (!/T-DAILY-SYNC-BANNER/.test(t)) fail('response-templates: missing T-DAILY-SYNC-BANNER (P-411)');
    if (!/entry-bootstrap|user_visible_text/.test(t)) {
      fail('response-templates: must use entry-bootstrap user_visible_text (P-411)');
    }
    if (!/—— 今日自动同步 ——/.test(t)) {
      fail('response-templates: §0c menu tip must use —— 今日自动同步 —— single-line style');
    }
    if (!/模板原文优先|P-272/.test(t)) fail('response-templates: missing template fidelity rule (P-272)');
    if (!/重新比对.*序号|确认菜单须完整|P-269/.test(t)) {
      fail('response-templates: missing 重新比对 menu rule (P-269)');
    }
    if (!/token 已通过|§0|first-screen/.test(t)) {
      fail('response-templates: must defer to token gate before T-FIRST-SCREEN');
    }
  }
  const q22Required = [
    ['router/boot.md', /Q24|resolveEntryEnv|入口不读|不读.*陈旧/],
    ['router/public-env.md', /DEFAULT_ENV_SLUG|Q24|resolveEntryEnv/],
    ['router/response-templates.md', /env_source_suffix|默认生产/],
  ];
  for (const [rel, re] of q22Required) {
    const p = path.join(PACK_ROOT, rel);
    if (fs.existsSync(p) && !re.test(fs.readFileSync(p, 'utf8'))) {
      fail(`${rel}: missing Q22 env-default rule`);
    }
  }
  const envRegPath = path.join(PACK_ROOT, 'tools/lib/env-registry.json');
  let envReg = null;
  if (!fs.existsSync(envRegPath)) fail('missing tools/lib/env-registry.json (env URL SSOT)');
  else {
    try {
      envReg = JSON.parse(fs.readFileSync(envRegPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      fail(`env-registry.json: invalid JSON (${e.message})`);
    }
    if (envReg) {
      if (envReg.DEFAULT_ENV_SLUG !== 'prod') {
        fail('env-registry.json: DEFAULT_ENV_SLUG must be prod (Q25)');
      }
      for (const slug of ['local', 'uat', 'prod']) {
        const e = envReg.envs && envReg.envs[slug];
        if (!e || !e.base_url || !e.web_origin) {
          fail(`env-registry.json: ${slug} missing base_url/web_origin`);
        }
        if (e && e.defect_api !== 'ready') {
          fail(`env-registry.json: ${slug} defect_api must be ready (P-274)`);
        }
        if (e && e.org_todo_api !== 'ready') {
          fail(`env-registry.json: ${slug} org_todo_api must be ready`);
        }
      }
    }
  }
  const tokenLib = path.join(PACK_ROOT, 'tools/lib/open-api-token.mjs');
  if (fs.existsSync(tokenLib)) {
    const tl = fs.readFileSync(tokenLib, 'utf8');
    if (!/env-registry\.json/.test(tl) || !/DEFAULT_ENV_SLUG/.test(tl)) {
      fail('open-api-token.mjs: must load env-registry.json DEFAULT_ENV_SLUG');
    }
    if (!/parseEnvFromUserText/.test(tl)) {
      fail('open-api-token.mjs: missing parseEnvFromUserText (Q22)');
    }
    if (!/resolveEntryEnv/.test(tl)) {
      fail('open-api-token.mjs: missing resolveEntryEnv (Q24)');
    }
    if (/readSelectedEnvIfFresh|SELECTED_ENV_SESSION_TTL_MS|env_source:\s*'session'/.test(tl)) {
      fail('open-api-token.mjs: must not inherit env from selected-env.json');
    }
    if (!/envSourceSuffix/.test(tl) || !/默认生产/.test(tl)) {
      fail('open-api-token.mjs: envSourceSuffix must default to 默认生产');
    }
    if (!/task_api:\s*cfg\.task_api/.test(tl) || !/defect_api:\s*cfg\.defect_api/.test(tl)) {
      fail('open-api-token.mjs: writeSelectedEnv must persist task_api and defect_api (P-274)');
    }
    if (!/org_todo_api:\s*cfg\.org_todo_api/.test(tl)) {
      fail('open-api-token.mjs: writeSelectedEnv must persist org_todo_api');
    }
  }
  const envSession = path.join(PACK_ROOT, 'tools/env-session.mjs');
  if (fs.existsSync(envSession)) {
    const es = fs.readFileSync(envSession, 'utf8');
    if (!/resolve/.test(es)) fail('env-session.mjs: missing resolve action (Q24)');
    if (!/lookup/.test(es)) fail('env-session.mjs: missing lookup action (env URL SSOT)');
  }
  const entryBootstrap = path.join(PACK_ROOT, 'tools/entry-bootstrap.mjs');
  if (!fs.existsSync(entryBootstrap)) fail('missing tools/entry-bootstrap.mjs (P-205)');
  else if (!/skill_sync_daily|skill-sync-daily/.test(fs.readFileSync(entryBootstrap, 'utf8'))) {
    fail('entry-bootstrap.mjs: missing skill_sync_daily (P-271)');
  } else {
    const eb = fs.readFileSync(entryBootstrap, 'utf8');
    if (!/route_hint|route-hint/.test(eb)) fail('entry-bootstrap.mjs: missing route_hint (P-359)');
    if (!/print-plan|printPlan/.test(eb)) fail('entry-bootstrap.mjs: missing --print-plan (P-349)');
    if (!/daily_sync_block|runDailySkillSyncIfNeeded/.test(eb)) {
      fail('entry-bootstrap.mjs: must run daily skill-sync and expose daily_sync_block (P-411)');
    }
    if (!/user_visible_text/.test(eb) || !/mode/.test(eb)) {
      fail('entry-bootstrap.mjs: must expose mode + user_visible_text (P-411)');
    }
    if (!/self_update_pending|self_update_apply_cmd|self_update_apply/.test(eb)) {
      fail('entry-bootstrap.mjs: must expose self_update_pending / apply_cmd (P-412)');
    }
    if (!/无论有无输入|完整首句/.test(eb) && !/无论有无输入/.test(fs.readFileSync(path.join(PACK_ROOT, 'SKILL.md'), 'utf8'))) {
      fail('SKILL.md or entry-bootstrap: must state §0c runs regardless of trailing input (P-411)');
    }
  }
  const runDailyLib = path.join(PACK_ROOT, 'tools/lib/run-daily-skill-sync.mjs');
  if (!fs.existsSync(runDailyLib)) fail('missing tools/lib/run-daily-skill-sync.mjs (P-411)');
  else {
    const rd = fs.readFileSync(runDailyLib, 'utf8');
    if (!/runDailySkillSyncIfNeeded|hasBusinessIntent/.test(rd)) {
      fail('run-daily-skill-sync.mjs: missing P-411 helpers');
    }
    if (/writePending|pending-display|consumePending/.test(rd)) {
      fail('run-daily-skill-sync.mjs: pending-display path removed (P-411 simplify)');
    }
    if (!/os\.tmpdir|tmpdir\(\)/.test(rd)) {
      fail('run-daily-skill-sync.mjs: daily-auto cwd must not be packRoot (P-412)');
    }
    if (!/selfUpdatePending|self_update_pending|refreshSelfUpdateApplyCmd/.test(rd)) {
      fail('run-daily-skill-sync.mjs: missing self-update pending wiring (P-412)');
    }
  }
  const dailySsot = path.join(PACK_ROOT, 'router/skill-sync-daily.md');
  if (fs.existsSync(dailySsot)) {
    const ds = fs.readFileSync(dailySsot, 'utf8');
    if (!/entry-bootstrap|P-411|无论有无输入/.test(ds)) {
      fail('skill-sync-daily.md: must document entry-bootstrap regardless of trailing input (P-411)');
    }
    if (!/P-412|self_update_apply_cmd|两阶段/.test(ds)) {
      fail('skill-sync-daily.md: missing self-update two-phase (P-412)');
    }
  }
  const skillMd = path.join(PACK_ROOT, 'SKILL.md');
  if (fs.existsSync(skillMd)) {
    const sk = fs.readFileSync(skillMd, 'utf8');
    if (!/无论有无输入/.test(sk) || !/entry-bootstrap/.test(sk)) {
      fail('SKILL.md: must mandate entry-bootstrap §0c regardless of trailing input (P-411)');
    }
  }
  if (fs.existsSync(skillPath)) {
    const skillBody = fs.readFileSync(skillPath, 'utf8');
    if (!/pending_token/.test(skillBody)) fail('SKILL.md: missing pending_token');
    if (!/§0a|环境自动解析|默认.*生产/.test(skillBody)) fail('SKILL.md: missing env auto-resolve (Q22/Q25)');
    if (!/禁止读 `doc\/`/.test(skillBody)) fail('SKILL.md: missing doc/ forbidden for Agent');
    if (!/first-screen\.mjs|user_visible_text/.test(skillBody)) {
      fail('SKILL.md: must reference first-screen.mjs or user_visible_text (P-329/P-411)');
    }
    if (/1\.\s*Demo 打包上传/.test(skillBody) && !/first-screen|user_visible_text/.test(skillBody)) {
      fail('SKILL.md: must not embed manual intent menu without first-screen/user_visible_text (P-329)');
    }
    if (/同轮或下一条/.test(skillBody)) {
      fail('SKILL.md: stale handoff wording 同轮或下一条 (use 同轮必须加载子包)');
    }
  }
  const routingRules = path.join(PACK_ROOT, 'router/routing-rules.md');
  if (fs.existsSync(routingRules)) {
    const rr = fs.readFileSync(routingRules, 'utf8');
    if (/五操作之一/.test(rr)) {
      fail('routing-rules: stale 五操作之一 wording (use 四选一 + T-QUERY-TYPE-ASK)');
    }
    if (!/operation-resolution\.md/.test(rr)) {
      fail('routing-rules.md: must link operation-resolution.md (P-333)');
    }
    if (!/original-requirement（选 2）[\s\S]*§2/.test(rr)) {
      fail('routing-rules.md: original-requirement must be §2 (P-376)');
    }
    if (!/requirement（选 3）[\s\S]*§3/.test(rr)) {
      fail('routing-rules.md: requirement cross-ref must be §3 (P-376)');
    }
    if (!/task（选 4）[\s\S]*§4/.test(rr)) fail('routing-rules.md: task must be §4 (P-376)');
    if (!/defect（选 5）[\s\S]*§5/.test(rr)) fail('routing-rules.md: defect must be §5 (P-376)');
    if (!/org-todo（选 7）[\s\S]*§8/.test(rr)) fail('routing-rules.md: org-todo must be §8 (P-376)');
    if (!/problem-ticket（选 8）[\s\S]*§9/.test(rr)) {
      fail('routing-rules.md: problem-ticket must be §9 (P-376)');
    }
    if (/### task · operation/.test(rr)) {
      fail('routing-rules.md: stale full operation table (use pointer to operation-resolution P-353)');
    }
  }
  const stepGate = path.join(PACK_ROOT, 'router/step-completion-gate.md');
  if (fs.existsSync(stepGate) && !/boot\.md.*instructions\.md|P-356/.test(fs.readFileSync(stepGate, 'utf8'))) {
    fail('step-completion-gate.md: missing handoff boot+instructions probe (P-356)');
  }
  const syncClient = path.join(PACK_ROOT, 'packages/skill-sync/tools/lib/open-api-client.mjs');
  if (fs.existsSync(syncClient) && !/fetchWithRetry/.test(fs.readFileSync(syncClient, 'utf8'))) {
    fail('skill-sync open-api-client.mjs: must use fetchWithRetry (P-350)');
  }
  const syncProgress = path.join(PACK_ROOT, 'packages/skill-sync/reference/ui/progress-display.md');
  if (!fs.existsSync(syncProgress)) fail('missing skill-sync progress-display.md (P-368)');
  const opRes = path.join(PACK_ROOT, 'router/operation-resolution.md');
  if (!fs.existsSync(opRes)) fail('missing router/operation-resolution.md (P-333)');
  const openApiErr = path.join(PACK_ROOT, 'router/open-api-errors.md');
  if (!fs.existsSync(openApiErr)) fail('missing router/open-api-errors.md (P-338)');
  else {
    const oe = fs.readFileSync(openApiErr, 'utf8');
    if (!/original-requirement/.test(oe) || !/skill-sync/.test(oe)) {
      fail('open-api-errors.md: index must include original-requirement and skill-sync (P-383)');
    }
    if (!/T-API-UNREACHABLE/.test(oe)) fail('open-api-errors.md: must reference T-API-UNREACHABLE (P-409)');
  }
  const reqTools = path.join(PACK_ROOT, 'packages/requirement/tools/lib/requirement-tools.mjs');
  if (fs.existsSync(reqTools) && !/fetchWithRetry/.test(fs.readFileSync(reqTools, 'utf8'))) {
    fail('requirement-tools.mjs: must use fetchWithRetry (P-326)');
  }
  const taskDefaults = path.join(PACK_ROOT, 'packages/task/reference/create-defaults.md');
  if (fs.existsSync(taskDefaults)) {
    const lines = fs.readFileSync(taskDefaults, 'utf8').split(/\r?\n/).length;
    if (lines > 95) fail(`task create-defaults.md: ${lines} lines (max 95 cheat sheet P-319)`);
    if (!/create-defaults-detail\.md/.test(fs.readFileSync(taskDefaults, 'utf8'))) {
      fail('task create-defaults.md: must link create-defaults-detail.md');
    }
  }
  const taskDetail = path.join(PACK_ROOT, 'packages/task/reference/create-defaults-detail.md');
  if (!fs.existsSync(taskDetail)) fail('missing packages/task/reference/create-defaults-detail.md (P-319)');
  for (const rel of [
    'packages/task/reference/create-defaults.md',
    'packages/defect/reference/create-defaults.md',
  ]) {
    const p = path.join(PACK_ROOT, rel);
    if (fs.existsSync(p) && /\r?\n\r?\n\r?\n/.test(fs.readFileSync(p, 'utf8'))) {
      fail(`${rel}: consecutive blank lines > 1 (P-320)`);
    }
  }
  const openApiCommon = path.join(PACK_ROOT, 'router/open-api-common.md');
  if (fs.existsSync(openApiCommon)) {
    const oc = fs.readFileSync(openApiCommon, 'utf8');
    if (!/跨子包约束/.test(oc)) fail('open-api-common: missing M01 cross-package constraints');
    if (!/original-requirement/.test(oc)) {
      fail('open-api-common.md: M01 table must include original-requirement (P-408)');
    }
  }
  const reqProgress = path.join(PACK_ROOT, 'packages/requirement/reference/ui/progress-display.md');
  if (!fs.existsSync(reqProgress)) fail('missing packages/requirement/reference/ui/progress-display.md');
}

const scanRoots = [skillPath, path.join(PACK_ROOT, 'router')].filter((p) => fs.existsSync(p));
const files = [];
for (const root of scanRoots) {
  if (fs.statSync(root).isFile()) files.push(root);
  else listFiles(root, files);
}

for (const file of files) {
  const rel = path.relative(PACK_ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  for (const sub of FORBIDDEN_SUBSTRINGS) {
    if (text.includes(sub)) {
      fail(`${rel}: forbidden substring "${sub}"`);
      break;
    }
  }
  if (/[`'"]\.cursor\//.test(text) || /(?:^|[\s(])\.cursor\//m.test(text)) {
    fail(`${rel}: hardcoded .cursor/ path`);
  }
}

if (!fs.existsSync(path.join(PACK_ROOT, '快速入门.md'))) {
  fail('missing 快速入门.md');
}

// 人读文档不得链向已移除的 doc/、archive/
for (const rel of ['快速入门.md', 'README.md']) {
  const p = path.join(PACK_ROOT, rel);
  if (fs.existsSync(p) && /\]\([^)]*(?:doc|archive)\//.test(fs.readFileSync(p, 'utf8'))) {
    fail(`${rel}: must not link to removed doc/ or archive/`);
  }
}

const readme = path.join(PACK_ROOT, 'README.md');
if (fs.existsSync(readme)) {
  const r = fs.readFileSync(readme, 'utf8');
  if (!/AGENT.*禁止|Agent.*禁止|DO NOT READ/i.test(r)) {
    fail('README.md: missing Agent-forbidden notice');
  }
}

function walkAllFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'regression') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkAllFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

const junkExact = new Set(['intent.json', '设计方案.md', '待办清单.md', '产品方案.md']);
for (const f of walkAllFiles(PACK_ROOT)) {
  const base = path.basename(f);
  const rel = path.relative(PACK_ROOT, f).replace(/\\/g, '/');
  if (/^(?:\.tmp-|_tmp-|out-)/i.test(base) || junkExact.has(base) || /^优化方案/.test(base)) {
    fail(`${rel}: junk file not allowed in skill pack`);
  }
}

// 父包/子包话术交叉探针
const routerTpl = path.join(PACK_ROOT, 'router/response-templates.md');
const demoTpl = path.join(PACK_ROOT, 'packages/demo/reference/ui/response-templates.md');
if (fs.existsSync(routerTpl) && fs.existsSync(demoTpl)) {
  const r = fs.readFileSync(routerTpl, 'utf8');
  const d = fs.readFileSync(demoTpl, 'utf8');
  for (const tpl of ['T-ROUTER-DEMO-HANDOFF', 'T-FIRST-SCREEN', '需用户提供的信息须突出']) {
    if (!r.includes(tpl)) fail(`router/response-templates.md: missing ${tpl}`);
  }
  for (const tpl of ['T-FIX-ASK', 'T-PATH-ASK', 'T-DEMO-TOKEN-ASK', '需用户提供的信息须突出']) {
    if (!d.includes(tpl)) fail(`demo response-templates.md: missing ${tpl}`);
  }
  if (/^### T-TOKEN-ASK\b/m.test(d) && !/T-DEMO-TOKEN-ASK/.test(d)) {
    fail('demo response-templates: stale T-TOKEN-ASK (use T-DEMO-TOKEN-ASK · P-393)');
  }
  if (d.includes('T-ROUTER-DEMO-HANDOFF')) {
    fail('demo response-templates: must not duplicate parent T-ROUTER-DEMO-HANDOFF');
  }
}

// P-375 / P-399 / P-400 / P-391 · 包内侧机检（本批未改 router）
const demoHumanizeMd = path.join(PACK_ROOT, 'packages/demo/reference/error-humanize.md');
if (!fs.existsSync(demoHumanizeMd)) fail('missing packages/demo/reference/error-humanize.md (P-375)');
const syncHumanizeMd = path.join(PACK_ROOT, 'packages/skill-sync/reference/error-humanize.md');
if (!fs.existsSync(syncHumanizeMd)) fail('missing packages/skill-sync/reference/error-humanize.md (P-399)');
const platformNotes = path.join(PACK_ROOT, 'PLATFORM.md');
if (!fs.existsSync(platformNotes)) fail('missing PLATFORM.md (P-391)');
else if (!/text-file/.test(fs.readFileSync(platformNotes, 'utf8'))) {
  fail('PLATFORM.md: missing --text-file for Windows non-UTF-8');
}
const webDetailUrl = path.join(PACK_ROOT, 'tools/lib/web-detail-url.cjs');
if (!fs.existsSync(webDetailUrl)) fail('missing tools/lib/web-detail-url.cjs (create detail links)');
else {
  const wdu = fs.readFileSync(webDetailUrl, 'utf8');
  if (!/buildWebDetailUrl/.test(wdu) || !/env-registry\.json/.test(wdu)) {
    fail('web-detail-url.cjs: missing buildWebDetailUrl or env-registry.json load');
  }
}
if (fs.existsSync(path.join(PACK_ROOT, 'router/public-env.md'))) {
  const pe = fs.readFileSync(path.join(PACK_ROOT, 'router/public-env.md'), 'utf8');
  if (!/web_origin/.test(pe) || !/详情链接/.test(pe)) {
    fail('public-env.md: missing web_origin / 详情链接 SSOT');
  }
  if (!/env-registry\.json/.test(pe)) {
    fail('public-env.md: must point addresses to tools/lib/env-registry.json');
  }
}
const orDefaults = path.join(PACK_ROOT, 'packages/original-requirement/reference/create-defaults.md');
if (fs.existsSync(orDefaults)) {
  const od = fs.readFileSync(orDefaults, 'utf8');
  if (!/content_refine_agent/.test(od)) fail('OR create-defaults: missing content_refine_agent (P-381)');
  if (!/原始需求描述（强制）/.test(od) || !/禁止.*T-CREATE-NEED-ASK/.test(od)) {
    fail('OR create-defaults: missing forced userNeedDesc refine (禁止默认 T-CREATE-NEED-ASK)');
  }
}
const orUpdateTpl = path.join(PACK_ROOT, 'packages/original-requirement/reference/ui/response-templates.md');
if (fs.existsSync(orUpdateTpl)) {
  const ot = fs.readFileSync(orUpdateTpl, 'utf8');
  if (!/T-UPDATE-FIELD-ASK/.test(ot)) fail('OR response-templates: missing T-UPDATE-FIELD-ASK (P-392)');
  if (!/T-CREATE-NEED-ASK[\s\S]*?仅兜底/.test(ot)) {
    fail('OR response-templates: T-CREATE-NEED-ASK must be fallback-only');
  }
  if (!/## T-CREATE-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(ot)) {
    fail('OR response-templates: T-CREATE-CONFIRM must use table (align task)');
  }
}
const defectTplAlign = path.join(PACK_ROOT, 'packages/defect/reference/ui/response-templates.md');
if (fs.existsSync(defectTplAlign) && !/T-DEFECT-CREATE-QUICK-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(fs.readFileSync(defectTplAlign, 'utf8'))) {
  fail('defect response-templates: create confirm must use table (align task)');
}
const reqTplAlign = path.join(PACK_ROOT, 'packages/requirement/reference/ui/response-templates.md');
if (fs.existsSync(reqTplAlign)) {
  const rt = fs.readFileSync(reqTplAlign, 'utf8');
  if (!/## T-CREATE-CONFIRM[\s\S]*\| 项目 \| 内容 \|/.test(rt)) {
    fail('requirement response-templates: missing T-CREATE-CONFIRM table (align task)');
  }
}
const taskTplP380 = path.join(PACK_ROOT, 'packages/task/reference/ui/response-templates.md');
if (fs.existsSync(taskTplP380) && !/T-TASK-DEDUP-CLARIFY/.test(fs.readFileSync(taskTplP380, 'utf8'))) {
  fail('task response-templates: missing T-TASK-DEDUP-CLARIFY (P-380)');
}
const reqBoot = path.join(PACK_ROOT, 'packages/requirement/reference/boot.md');
if (fs.existsSync(reqBoot)) {
  const rb = fs.readFileSync(reqBoot, 'utf8');
  if (/routing-rules\.md.*§operation/.test(rb)) fail('requirement boot: stale routing-rules §operation (P-384)');
  if (!/operation-resolution\.md/.test(rb)) fail('requirement boot: must point operation-resolution (P-384)');
}

// 串联子包 self-check
const SUB_SELF_CHECKS = [
  'packages/demo/scripts/self-check.js',
  'packages/original-requirement/scripts/self-check.js',
  'packages/requirement/scripts/self-check.js',
  'packages/task/scripts/self-check.js',
  'packages/defect/scripts/self-check.js',
  'packages/org-todo/scripts/self-check.js',
  'packages/problem-ticket/scripts/self-check.js',
  'packages/skill-sync/scripts/self-check.js',
];
for (const rel of SUB_SELF_CHECKS) {
  const script = path.join(PACK_ROOT, rel);
  if (!fs.existsSync(script)) {
    fail(`missing ${rel}`);
    continue;
  }
  try {
    execFileSync(process.execPath, [script], { stdio: 'inherit', cwd: PACK_ROOT });
  } catch {
    fail(`sub-package self-check failed: ${rel}`);
  }
}

// demo SSOT content checks (YXT-P2-02)
const demoInstr = path.join(PACK_ROOT, 'packages/demo/reference/instructions.md');
const demoPackPhase = path.join(PACK_ROOT, 'packages/demo/reference/phases/pack-phase.md');
if (fs.existsSync(demoInstr)) {
  const t = fs.readFileSync(demoInstr, 'utf8');
  if (!/pack-phase\.md/.test(t)) fail('demo instructions: missing pack-phase.md reference');
  if (/见 `notes` 纯静态快径`/.test(t)) fail('demo instructions: stale 纯静态快径 anchor');
}
if (fs.existsSync(demoPackPhase)) {
  const pp = fs.readFileSync(demoPackPhase, 'utf8');
  if (!/## 1\.0 项目形态分流/.test(pp)) fail('demo pack-phase: missing §1.0');
}
const demoNotes = path.join(PACK_ROOT, 'packages/demo/reference/pack/notes.md');
if (fs.existsSync(demoNotes)) {
  if (!/### 纯静态 HTML 快径/.test(fs.readFileSync(demoNotes, 'utf8'))) {
    fail('demo notes: missing 纯静态 HTML 快径');
  }
}
const openApi = path.join(PACK_ROOT, 'packages/demo/reference/upload/open-api-upload.md');
if (fs.existsSync(openApi)) {
  const o = fs.readFileSync(openApi, 'utf8');
  if (!/## 执行方式[\s\S]*upload-demo\.mjs/.test(o)) {
    fail('open-api-upload: missing mjs as primary in 执行方式');
  }
  if (/instructions\.md[^`\n]*§8|instructions` §8/i.test(o)) {
    fail('open-api-upload: stale instructions.md §8 ref');
  }
  if (/\| 手写 \|[\s\S]*?verify-upload-response\.js`/.test(o) && !/勿/.test(o.match(/\| 手写 \|[^\n]*/)?.[0] || '')) {
    fail('open-api-upload: verify .js recommended in 执行方式');
  }
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-route-hint.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-route-hint failed: ${e.message}`);
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-platform-titled-link.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-platform-titled-link failed: ${e.message}`);
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-read-user-text.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-read-user-text failed: ${e.message}`);
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-parse-env.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-parse-env failed: ${e.message}`);
}

try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-first-screen.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-first-screen failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-daily-sync-p411.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-daily-sync-p411 failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-self-update-pending-p412.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-self-update-pending-p412 failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-sticky-install-dir-p413.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-sticky-install-dir-p413 failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-path-escape-guard.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-path-escape-guard failed: ${e.message}`);
}
try {
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts/test-inplace-replace-p414.mjs')], {
    stdio: 'pipe',
    cwd: PACK_ROOT,
  });
} catch (e) {
  fail(`test-inplace-replace-p414 failed: ${e.message}`);
}

try {
  execFileSync(
    process.execPath,
    [path.join(PACK_ROOT, 'packages/task/scripts/test-content-refine-golden.mjs')],
    { stdio: 'pipe', cwd: PACK_ROOT },
  );
} catch (e) {
  fail(`test-content-refine-golden failed: ${e.message}`);
}

const envRegDupPath = path.join(PACK_ROOT, 'tools/lib/env-registry.json');
if (fs.existsSync(envRegDupPath)) {
  try {
    const reg = JSON.parse(fs.readFileSync(envRegDupPath, 'utf8').replace(/^\uFEFF/, ''));
    const banned = [reg.envs?.uat?.base_url, reg.envs?.prod?.base_url].filter(Boolean);
    const ssotRel = path.normalize('tools/lib/env-registry.json');
    function walkDup(dir, acc = []) {
      if (!fs.existsSync(dir)) return acc;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === 'regression') continue;
        if (ent.name.startsWith('out-')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walkDup(full, acc);
        else if (/\.(md|js|mjs|cjs|json|sh|ps1)$/.test(ent.name)) acc.push(full);
      }
      return acc;
    }
    for (const f of walkDup(PACK_ROOT)) {
      const rel = path.relative(PACK_ROOT, f);
      if (path.normalize(rel) === ssotRel) continue;
      if (rel.includes(`${path.sep}fixtures${path.sep}`)) continue;
      const t = fs.readFileSync(f, 'utf8');
      for (const b of banned) {
        if (t.includes(b)) fail(`${rel}: duplicate env base_url (SSOT is tools/lib/env-registry.json)`);
      }
    }
  } catch (e) {
    if (!String(e.message || e).includes('duplicate env')) {
      fail(`env-registry duplicate scan failed: ${e.message}`);
    }
  }
}

if (errors.length) {
  console.error(`self-check FAILED (${PACK_NAME}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`self-check OK: ${PACK_NAME}`);
