#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PACK_ROOT = path.resolve(__dirname, '..');
const PACK_LABEL = 'yanxiaotong-demo';
const STANDARD_LIMIT = 50;
const INSTRUCTIONS_LIMIT = 85;

const FORBIDDEN_SUBSTRINGS = [
  '.cursor/skills/',
  '.cursor/atomic/',
  '.cursor/scripts/',
  '.cursor/rules/',
  '.claude/skills/',
  'efficiency-hub-doc/',
];

function listFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'regression') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, acc);
    else if (/\.(md|js|mjs|cjs|json|yaml|yml|sh|ps1)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

const errors = [];

function fail(msg) {
  errors.push(msg);
}

const packYaml = path.join(PACK_ROOT, 'pack.yaml');
if (!fs.existsSync(packYaml)) {
  fail('missing pack.yaml');
} else {
  const t = fs.readFileSync(packYaml, 'utf8');
  if (!/^name:\s/m.test(t)) fail('pack.yaml: missing name');
  if (!/requires:\s*\[\]/m.test(t)) fail('pack.yaml: requires must be []');
  if (!/entry:\s*PACK\.md/m.test(t)) fail('pack.yaml: entry must be PACK.md');
}

const packPath = path.join(PACK_ROOT, 'PACK.md');
if (!fs.existsSync(packPath)) {
  fail('missing PACK.md');
} else {
  const raw = fs.readFileSync(packPath, 'utf8').replace(/^\uFEFF/, '');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fmMatch) {
    fail('PACK.md: missing YAML frontmatter');
  } else {
    const fm = fmMatch[1];
    const packBody = raw.slice(fmMatch[0].length);
    if (!/^name:\s/m.test(fm)) fail('PACK.md: frontmatter missing name');
    if (!/^description:/m.test(fm)) fail('PACK.md: frontmatter missing description');
    if (!/disable-model-invocation:\s*true/.test(fm)) {
      fail('PACK.md: frontmatter missing disable-model-invocation: true');
    }
    if (/^when:/m.test(fm)) fail('PACK.md: forbidden frontmatter field when:');

    const lines = packBody.trimEnd() ? packBody.trimEnd().split(/\r?\n/).length : 0;
    if (lines > STANDARD_LIMIT) fail(`PACK.md body has ${lines} lines (max ${STANDARD_LIMIT})`);
  }
}
if (fs.existsSync(path.join(PACK_ROOT, 'SKILL.md'))) {
  fail('SKILL.md: nested SKILL.md forbidden (platform discovers only top-level SKILL.md)');
}

if (!fs.existsSync(path.join(PACK_ROOT, 'reference/instructions.md'))) {
  fail('missing reference/instructions.md');
}

const scanRoots = [packPath, path.join(PACK_ROOT, 'reference')].filter((p) => fs.existsSync(p));

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
  if (/[`'"]\.claude\//.test(text) || /(?:^|[\s(])\.claude\//m.test(text)) {
    fail(`${rel}: hardcoded .claude/ path`);
  }
}

if (!fs.existsSync(path.join(PACK_ROOT, '快速入门.md'))) {
  fail('missing 快速入门.md');
}

const readme = path.join(PACK_ROOT, 'README.md');
if (fs.existsSync(readme)) {
  const r = fs.readFileSync(readme, 'utf8');
  if (!/AGENT.*禁止|Agent.*禁止|DO NOT READ/i.test(r)) {
    fail('README.md: missing Agent-forbidden notice');
  }
}

function readPackName() {
  if (!fs.existsSync(packYaml)) return PACK_LABEL;
  const m = fs.readFileSync(packYaml, 'utf8').match(/^name:\s*(\S+)/m);
  return m ? m[1] : PACK_LABEL;
}

const packName = readPackName();

if (packName === 'yanxiaotong-demo') {
  const fixturePkg = path.join(PACK_ROOT, 'scripts', 'fixtures', 'minimal-vite', 'package.json');
  if (!fs.existsSync(fixturePkg)) {
    fail('missing scripts/fixtures/minimal-vite/package.json');
  } else {
    const pkg = JSON.parse(fs.readFileSync(fixturePkg, 'utf8'));
    if (!pkg.scripts || !pkg.scripts['build:mock']) {
      fail('fixture must define scripts.build:mock');
    }
  }
  if (!fs.existsSync(path.join(PACK_ROOT, 'reference', 'upload', 'open-api-upload.md'))) {
    fail('missing reference/upload/open-api-upload.md');
  }
  const verifyCjs = path.join(PACK_ROOT, 'scripts', 'verify-upload-response.cjs');
  const verifyJs = path.join(PACK_ROOT, 'scripts', 'verify-upload-response.js');
  const uploadPs1 = path.join(PACK_ROOT, 'tools', 'upload-demo.ps1');
  const uploadSh = path.join(PACK_ROOT, 'tools', 'upload-demo.sh');
  const uploadMjs = path.join(PACK_ROOT, 'tools', 'upload-demo.mjs');
  const packMjs = path.join(PACK_ROOT, 'tools', 'pack-mock-zip.mjs');
  const fetchMjs = path.join(PACK_ROOT, 'tools', 'fetch-metadata.mjs');
  if (!fs.existsSync(verifyCjs)) fail('missing scripts/verify-upload-response.cjs');
  if (!fs.existsSync(verifyJs)) fail('missing scripts/verify-upload-response.js');
  if (!fs.existsSync(uploadPs1)) fail('missing tools/upload-demo.ps1');
  if (!fs.existsSync(uploadSh)) fail('missing tools/upload-demo.sh');
  if (!fs.existsSync(uploadMjs)) fail('missing tools/upload-demo.mjs');
  if (!fs.existsSync(packMjs)) fail('missing tools/pack-mock-zip.mjs');
  if (!fs.existsSync(fetchMjs)) fail('missing tools/fetch-metadata.mjs');
  const fetchPs1 = path.join(PACK_ROOT, 'tools', 'fetch-metadata.ps1');
  const fetchSh = path.join(PACK_ROOT, 'tools', 'fetch-metadata.sh');
  if (!fs.existsSync(fetchPs1)) fail('missing tools/fetch-metadata.ps1');
  if (!fs.existsSync(fetchSh)) fail('missing tools/fetch-metadata.sh');
  for (const fixture of [
    'upload-response-d03-success.json',
    'upload-response-fail.json',
  ]) {
    const fp = path.join(PACK_ROOT, 'scripts', 'fixtures', fixture);
    if (!fs.existsSync(fp)) fail(`missing scripts/fixtures/${fixture}`);
  }
  const { execFileSync } = require('child_process');
  for (const fixture of ['upload-response-d03-success.json', 'upload-response-fail.json']) {
    const fp = path.join(PACK_ROOT, 'scripts', 'fixtures', fixture);
    try {
      execFileSync(process.execPath, [verifyCjs, fp], { stdio: 'pipe' });
    } catch (e) {
      fail(`verify-upload-response.cjs failed on fixtures/${fixture}`);
    }
  }
}

// SSOT content (YXT batch)
const instrPath = path.join(PACK_ROOT, 'reference/instructions.md');
if (fs.existsSync(instrPath)) {
  const t = fs.readFileSync(instrPath, 'utf8');
  if (!/## Agent 工具选择表/.test(t)) fail('instructions: missing tool selection table');
  if (!/进度可见/.test(t)) fail('instructions: missing mandatory progress rule §11');
  if (!/改代码须先确认/.test(t)) fail('instructions: missing mandatory confirm-before-edit §12');
  if (!/固定话术/.test(t)) fail('instructions: missing response-templates rule §13');
  if (!/token-store/.test(t)) fail('instructions: missing token-store reference');
  if (!/session-store/.test(t)) fail('instructions: missing session-store reference');
  if (!/boot\.md/.test(t)) fail('instructions: missing boot.md reference');
  if (!/pack-phase\.md/.test(t)) fail('instructions: missing pack-phase.md reference');
  if (!/upload-phase\.md/.test(t)) fail('instructions: missing upload-phase.md reference');
  const instrLines = t.trimEnd() ? t.trimEnd().split(/\r?\n/).length : 0;
  if (instrLines > INSTRUCTIONS_LIMIT) {
    fail(`instructions.md has ${instrLines} lines (max ${INSTRUCTIONS_LIMIT})`);
  }
}
for (const phase of ['reference/phases/pack-phase.md', 'reference/phases/upload-phase.md']) {
  if (!fs.existsSync(path.join(PACK_ROOT, phase))) fail(`missing ${phase}`);
}
const packPhasePath = path.join(PACK_ROOT, 'reference/phases/pack-phase.md');
if (fs.existsSync(packPhasePath)) {
  const pp = fs.readFileSync(packPhasePath, 'utf8');
  if (!/## 1\.0 项目形态分流/.test(pp)) fail('pack-phase: missing §1.0');
}
const bootPath = path.join(PACK_ROOT, 'reference/boot.md');
if (!fs.existsSync(bootPath)) fail('missing reference/boot.md');
else {
  const boot = fs.readFileSync(bootPath, 'utf8');
  if (/boot\.md` 的父目录即为 \*\*PACK_ROOT\*\*/.test(boot)) {
    fail('boot.md: stale PACK_ROOT one-level-up wording');
  }
  if (!/packages\/demo/.test(boot) || !/pack-mock-zip\.mjs/.test(boot)) {
    fail('boot.md: missing aggregation-route PACK_ROOT / pack-mock-zip guard');
  }
  if (!/heredoc|<</.test(boot)) fail('boot.md: missing PowerShell anti-heredoc rule');
}
const progressPath = path.join(PACK_ROOT, 'reference/ui/progress-display.md');
if (!fs.existsSync(progressPath)) fail('missing reference/ui/progress-display.md');
else {
  const p = fs.readFileSync(progressPath, 'utf8');
  if (!/当前正在…?\s*不是回合结束|不是回合结束/.test(p)) {
    fail('progress-display.md: missing anti-interrupt rule (铁律 5)');
  }
}
const tokenStore = path.join(PACK_ROOT, 'reference/upload/token-store.md');
if (!fs.existsSync(tokenStore)) fail('missing reference/upload/token-store.md');
else {
  const ts = fs.readFileSync(tokenStore, 'utf8');
  if (!/tokens\/\{local\|uat\|prod\}/.test(ts)) {
    fail('token-store.md: missing per-environment token paths');
  }
  if (!/last_environment/.test(ts)) fail('token-store.md: missing env mismatch / last_environment rule');
}
if (!fs.existsSync(path.join(PACK_ROOT, 'tools/token-store.mjs'))) {
  fail('missing tools/token-store.mjs');
}
if (!fs.existsSync(path.join(PACK_ROOT, 'tools/session-store.mjs'))) {
  fail('missing tools/session-store.mjs');
}
for (const rel of [
  'tools/lib/token-path.ps1',
  'tools/lib/token-path.sh',
  'tools/token-store.ps1',
  'tools/token-store.sh',
]) {
  if (!fs.existsSync(path.join(PACK_ROOT, rel))) fail(`missing ${rel}`);
}
const respTpl = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (!fs.existsSync(respTpl)) fail('missing reference/ui/response-templates.md');
else {
  const r = fs.readFileSync(respTpl, 'utf8');
  if (!/T-FIX-ASK/.test(r) || !/请回复序号/.test(r)) {
    fail('response-templates.md: missing T-FIX-ASK or 序号 footer');
  }
  for (const tpl of [
    'T-TOKEN-SAVED',
    'T-TOKEN-FAIL-ASK',
    'T-UPLOAD-MULTI-REJECT',
    'T-D04-ID-TYPE-ASK',
    'T-D04-ID-NUMBER-ASK',
    'T-META-UNREACHABLE',
    'T-DEMO-NO-DEPLOY-ROOT',
    'T-DEMO-DOMAIN-SERVICE-MISMATCH',
    'T-SESSION-CLEAR-ASK',
    'T-PACK-EMPTY-INDEX',
    'T-DEMO-PREVIEW',
    'T-DEMO-PREVIEW-EDIT',
    'T-DEMO-NAME-ASK',
    'T-M01-CONFIRM',
    'T-M03-CONFIRM',
    '[AGENT-GATE]',
  ]) {
    if (!r.includes(tpl)) fail(`response-templates.md: missing ${tpl}`);
  }
  if (!/preview-upload-params/.test(r) || !/T-DEMO-PREVIEW[\s\S]*原样/.test(r)) {
    fail('response-templates.md: T-DEMO-PREVIEW must document preview-upload-params + 原样贴');
  }
  if (!/T-UPLOAD-TYPE[\s\S]*选上传之后[\s\S]*收参之前/.test(r)) {
    fail('response-templates.md: T-UPLOAD-TYPE must be after upload confirm / before params');
  }
  if (!/T-DEMO-PREVIEW[\s\S]*仅 D03[\s\S]*选类型之后/.test(r)) {
    fail('response-templates.md: T-DEMO-PREVIEW must be after type / D03-only');
  }
  if (!/确认，继续上传/.test(r)) {
    fail('response-templates.md: T-DEMO-PREVIEW confirm option must say 继续上传');
  }
  if (!/T-ZIP-DONE[\s\S]*1\. 上传到研效通/.test(r)) {
    fail('response-templates.md: T-ZIP-DONE must include numbered 1. 上传到 (P-193)');
  }
  if (!/T-D04-ID-TYPE-ASK[\s\S]*请回复序号/.test(r)) {
    fail('response-templates.md: T-D04-ID-TYPE-ASK must include 请回复序号 (P-188)');
  }
  if (!/原样粘贴/.test(r)) fail('response-templates.md: T-ZIP-DONE must state 原样粘贴 (P-193)');
  if (/token_last4|ehub_live_…\{token/.test(r)) {
    fail('response-templates.md: T-SESSION-REUSE must not display token');
  }
  if (!/project_root|project_label/.test(r)) {
    fail('response-templates.md: T-SESSION-REUSE must show project scope');
  }
  if (!/需用户提供的信息须突出/.test(r)) {
    fail('response-templates.md: missing highlight rule for user input');
  }
  if (!/\*\*请提供项目路径\*\*/.test(r)) {
    fail('response-templates.md: T-PATH-ASK must highlight project path');
  }
  if (/\| demoId \|/.test(r)) fail('response-templates: T-DELIVER-OK must use Chinese headers (P-179)');
  if (!/Demo 编号/.test(r)) fail('response-templates: T-DELIVER-OK must include Demo 编号 (P-179)');
  if (!/详情页链接/.test(r)) fail('response-templates: T-DELIVER-OK must include 详情页链接');
  if (!/去掉.*f=1|normalizeAccessUrlForDelivery/.test(r)) {
    fail('response-templates: T-DELIVER-OK must document strip fullscreen f=1');
  }
}
const demoDisplayHumanize = path.join(PACK_ROOT, 'scripts/lib/display-humanize.cjs');
if (!fs.existsSync(demoDisplayHumanize)) fail('missing scripts/lib/display-humanize.cjs (Q23)');
else {
  const { formatUploadSuccess } = require(demoDisplayHumanize);
  const s = formatUploadSuccess({
    demoId: '1',
    demoCode: 'DEMO-1',
    accessUrl: 'https://x?d=1&exp=1&pv=2',
    detailUrl: 'https://x/app/requirements/demos?d=1',
  });
  if (/demoId:|demoCode:/.test(s)) fail('demo display-humanize: must not use English field labels');
  if (!/\| 访问链接 \|/.test(s)) fail('demo display-humanize: must use table 访问链接');
  if (!/详情页链接/.test(s)) fail('demo display-humanize: must include 详情页链接');
}
const uploadMjs = path.join(PACK_ROOT, 'tools/upload-demo.mjs');
if (fs.existsSync(uploadMjs) && !/formatUploadSuccess/.test(fs.readFileSync(uploadMjs, 'utf8'))) {
  fail('upload-demo.mjs: must use formatUploadSuccess (P-181)');
}
const sessionStore = path.join(PACK_ROOT, 'reference/upload/session-store.md');
if (!fs.existsSync(sessionStore)) fail('missing reference/upload/session-store.md');
else {
  const ss = fs.readFileSync(sessionStore, 'utf8');
  if (!/sessions\/\{.*local.*uat.*prod/.test(ss) && !/sessions\/\{env\}/.test(ss)) {
    fail('session-store.md: missing per-environment session paths');
  }
  if (!/project_slug|按项目/.test(ss)) {
    fail('session-store.md: missing per-project session scope');
  }
  if (!/demo_code/.test(ss)) fail('session-store.md: missing d04.demo_code');
}
const notesPath = path.join(PACK_ROOT, 'reference/pack/notes.md');
if (fs.existsSync(notesPath) && !/### 纯静态 HTML 快径/.test(fs.readFileSync(notesPath, 'utf8'))) {
  fail('notes: missing 纯静态 HTML 快径');
}
const openApiPath = path.join(PACK_ROOT, 'reference/upload/open-api-upload.md');
if (fs.existsSync(openApiPath)) {
  const o = fs.readFileSync(openApiPath, 'utf8');
  if (!/upload-demo\.mjs/.test(o)) fail('open-api-upload: missing mjs primary');
  if (!/env-registry\.json/.test(o)) {
    fail('open-api-upload: must point env URLs to env-registry.json');
  }
  if (!/web_origin/.test(o)) fail('open-api-upload: missing web_origin preview origin');
  if (!/normalizeAccessUrlForDelivery|去掉.*f=1/.test(o)) {
    fail('open-api-upload: must document strip fullscreen / normalizeAccessUrlForDelivery');
  }
  if (!/UAT.*已部署/.test(o)) fail('open-api-upload: missing UAT deployed status');
  if (!/生产.*已部署/.test(o)) fail('open-api-upload: missing 生产 deployed status (Q25)');
}
const demoTools = path.join(PACK_ROOT, 'tools/lib/demo-tools.mjs');
if (fs.existsSync(demoTools)) {
  const dt = fs.readFileSync(demoTools, 'utf8');
  if (!/PREVIEW_ORIGIN_MAP/.test(dt)) fail('demo-tools: missing PREVIEW_ORIGIN_MAP');
  if (!/normalizeAccessUrlForDelivery/.test(dt)) fail('demo-tools: missing normalizeAccessUrlForDelivery');
  if (!/stripExperienceFullscreenFlags/.test(dt)) fail('demo-tools: missing stripExperienceFullscreenFlags');
  if (!/buildDemoDetailShareUrl/.test(dt)) fail('demo-tools: missing buildDemoDetailShareUrl');
  if (!/ENV_REGISTRY/.test(dt)) fail('demo-tools: PREVIEW_ORIGIN_MAP must use ENV_REGISTRY');
  if (!/ENV_TOKEN_SLUG/.test(dt)) fail('demo-tools: missing per-environment token slugs');
  if (!/SESSION_SUBDIR/.test(dt)) fail('demo-tools: missing per-environment session dir');
  if (!/projectSlugForRoot/.test(dt)) fail('demo-tools: missing per-project session slug');
}
const demoHumanize = path.join(PACK_ROOT, 'scripts/lib/error-humanize-rules.cjs');
if (!fs.existsSync(demoHumanize)) fail('missing scripts/lib/error-humanize-rules.cjs');
else {
  const { HUMANIZE, pickTemplate } = require(demoHumanize);
  if (!HUMANIZE?.length) fail('demo error-humanize-rules: empty HUMANIZE');
  if (pickTemplate('不匹配') !== 'T-DEMO-DOMAIN-SERVICE-MISMATCH') {
    fail('demo error-humanize-rules: pickTemplate mismatch');
  }
}
const demoHumanizeMd = path.join(PACK_ROOT, 'reference/error-humanize.md');
if (!fs.existsSync(demoHumanizeMd)) fail('missing reference/error-humanize.md (P-375)');

// § 交叉引用：禁止 instructions §8 断链；upload-phase 锚点须存在（G10-16）
const packMjs = path.join(PACK_ROOT, 'tools', 'pack-mock-zip.mjs');
if (fs.existsSync(packMjs)) {
  const pm = fs.readFileSync(packMjs, 'utf8');
  if (!/defaultMockZipOut/.test(pm)) fail('pack-mock-zip.mjs: missing defaultMockZipOut (P-192)');
  if (!/workspace-root/.test(pm)) fail('pack-mock-zip.mjs: missing --workspace-root (P-192)');
  if (!/assertPackableIndexHtml|createZipFromDir/.test(pm)) {
    fail('pack-mock-zip.mjs: must use createZipFromDir (empty index gate)');
  }
}
const zipStore = path.join(PACK_ROOT, 'tools/lib/zip-store.mjs');
if (!fs.existsSync(zipStore)) fail('missing tools/lib/zip-store.mjs');
else {
  const zs = fs.readFileSync(zipStore, 'utf8');
  if (!/assertPackableIndexHtml/.test(zs)) fail('zip-store: missing assertPackableIndexHtml');
  if (!/打包失败：index\.html 为空/.test(zs)) fail('zip-store: missing empty index.html Chinese error');
}
const tplPackEmpty = path.join(PACK_ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tplPackEmpty) && !/T-PACK-EMPTY-INDEX/.test(fs.readFileSync(tplPackEmpty, 'utf8'))) {
  fail('response-templates: missing T-PACK-EMPTY-INDEX');
}
const zipOutMd = path.join(PACK_ROOT, 'reference/pack/zip-output.md');
if (fs.existsSync(zipOutMd) && !/硬门禁/.test(fs.readFileSync(zipOutMd, 'utf8'))) {
  fail('zip-output.md: missing index.html 硬门禁 section');
}
// 冒烟：空 index.html 必须拒绝打包
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yxt-pack-empty-'));
  const emptyIndex = path.join(tmp, 'index.html');
  fs.writeFileSync(emptyIndex, '', 'utf8');
  const outZip = path.join(tmp, 'out.zip');
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [packMjs, '--source', tmp, '--out', outZip], {
    encoding: 'utf8',
  });
  if (r.status === 0) fail('pack-mock-zip: empty index.html must exit non-zero');
  const errText = `${r.stderr || ''}${r.stdout || ''}`;
  if (!/index\.html 为空|缺少 index\.html/.test(errText)) {
    fail('pack-mock-zip: empty index must print Chinese hint, got: ' + errText.slice(0, 200));
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
const zipOutput = path.join(PACK_ROOT, 'reference/pack/zip-output.md');
if (fs.existsSync(zipOutput) && !/YYYYMMDDHHmmss/.test(fs.readFileSync(zipOutput, 'utf8'))) {
  fail('zip-output.md: must use YYYYMMDDHHmmss naming (P-192)');
}
const uploadPhasePath = path.join(PACK_ROOT, 'reference/phases/upload-phase.md');
if (fs.existsSync(uploadPhasePath) && !/原样粘贴/.test(fs.readFileSync(uploadPhasePath, 'utf8'))) {
  fail('upload-phase.md: must require 原样粘贴 T-ZIP-DONE (P-193)');
}
const uploadPhaseText = fs.existsSync(uploadPhasePath) ? fs.readFileSync(uploadPhasePath, 'utf8') : '';
if (!uploadPhaseText) fail('missing reference/phases/upload-phase.md');
else {
  if (!/8\.15/.test(uploadPhaseText)) fail('upload-phase.md: missing §8.15 preview step');
  if (!/preview-upload-params/.test(uploadPhaseText)) {
    fail('upload-phase.md: missing preview-upload-params.mjs');
  }
  if (!/选类型之后|类型确认为 D03|仅 D03/.test(uploadPhaseText)) {
    fail('upload-phase.md: must place preview after upload type (D03-only)');
  }
  if (!/跳过.*空预览|空预览表/.test(uploadPhaseText)) {
    fail('upload-phase.md: must skip empty preview for D03 with no draft');
  }
  if (!/\*\*1\*\* \| 进入 \*\*§8\.2/.test(uploadPhaseText)) {
    fail('upload-phase.md: upload confirm must enter §8.2 (type) first');
  }
}
const fuzzyLib = path.join(PACK_ROOT, 'tools/lib/fuzzy-match-metadata.mjs');
if (!fs.existsSync(fuzzyLib)) fail('missing tools/lib/fuzzy-match-metadata.mjs');
const previewFmt = path.join(PACK_ROOT, 'tools/lib/format-demo-preview.mjs');
if (!fs.existsSync(previewFmt)) fail('missing tools/lib/format-demo-preview.mjs');
const previewTool = path.join(PACK_ROOT, 'tools/preview-upload-params.mjs');
if (!fs.existsSync(previewTool)) fail('missing tools/preview-upload-params.mjs');
const fetchMeta = path.join(PACK_ROOT, 'tools/fetch-metadata.mjs');
if (!fs.existsSync(fetchMeta)) fail('missing tools/fetch-metadata.mjs');
else if (!/--match|fuzzyMatchMetadata/.test(fs.readFileSync(fetchMeta, 'utf8'))) {
  fail('fetch-metadata.mjs: must support --match / fuzzyMatchMetadata');
}
{
  const { spawnSync } = require('child_process');
  const fuzzyTest = path.join(PACK_ROOT, 'scripts/test-fuzzy-match-metadata.mjs');
  if (!fs.existsSync(fuzzyTest)) fail('missing scripts/test-fuzzy-match-metadata.mjs');
  const fr = spawnSync(process.execPath, [fuzzyTest], { encoding: 'utf8' });
  if (fr.status !== 0) {
    fail(`test-fuzzy-match-metadata failed: ${(fr.stderr || fr.stdout || '').slice(0, 300)}`);
  }
  const previewUnit = path.join(PACK_ROOT, 'scripts/test-format-demo-preview.mjs');
  if (!fs.existsSync(previewUnit)) fail('missing scripts/test-format-demo-preview.mjs');
  const pr = spawnSync(process.execPath, [previewUnit], { encoding: 'utf8' });
  if (pr.status !== 0) {
    fail(`test-format-demo-preview failed: ${(pr.stderr || pr.stdout || '').slice(0, 300)}`);
  }
}

for (const f of listFiles(path.join(PACK_ROOT, 'reference'))) {
  if (!f.endsWith('.md')) continue;
  const rel = path.relative(PACK_ROOT, f).replace(/\\/g, '/');
  const t = fs.readFileSync(f, 'utf8');
  if (/instructions\.md[^`\n]*§8|instructions` §8/i.test(t)) {
    fail(`${rel}: stale instructions.md §8 — use phases/upload-phase.md`);
  }
  for (const m of t.matchAll(/upload-phase\.md[`\s]*§(\d+(?:\.\d+)*)/g)) {
    const sec = m[1];
    const headingRe = new RegExp(`^#{1,4}\\s*${sec.replace(/\./g, '\\.')}\\b`, 'm');
    if (!headingRe.test(uploadPhaseText)) {
      fail(`${rel}: upload-phase.md missing §${sec}`);
    }
  }
}

if (errors.length) {
  console.error(`self-check FAILED (${packName}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`self-check OK: ${packName}`);
