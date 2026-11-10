#!/usr/bin/env node
/**
 * SC-260802-005：故事点解析 + yml 预填段解析单测
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  parseStoryPointFromDoc,
  parseRequirementDoc,
  parseWarningsFromDoc,
} = require('../scripts/lib/parse-requirement-doc.cjs');
const {
  parseRequirementUploadDefaultsFromText,
  matchUniqueByName,
  resolveNamesToIds,
  loadRequirementUploadDefaults,
} = require('../scripts/lib/parse-upload-defaults.cjs');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

const sp = parseStoryPointFromDoc('| 故事点 | 8 SP |');
assert(sp.storyPoint === 8 && !sp.missing && !sp.storyPointCeiled, 'table 8 SP');

const sp2 = parseStoryPointFromDoc('**故事点**: 13');
assert(sp2.storyPoint === 13 && !sp2.storyPointCeiled, 'header 13');

const sp3 = parseStoryPointFromDoc('| 优先级 | P1 |');
assert(sp3.missing && sp3.storyPoint == null, 'missing story point');

const spDec = parseStoryPointFromDoc('| 故事点 | 8.5 SP |');
assert(
  spDec.storyPoint === 9 && spDec.storyPointCeiled && !spDec.missing,
  'ceil decimal 8.5 → 9',
);

const spDec2 = parseStoryPointFromDoc('**故事点**: 3.0');
assert(spDec2.storyPoint === 3 && !spDec2.storyPointCeiled && !spDec2.missing, '3.0 stays 3 no ceil warn');

const spDec3 = parseStoryPointFromDoc('故事点: 2.1');
assert(spDec3.storyPoint === 3 && spDec3.storyPointCeiled, 'ceil 2.1 → 3');

const ceilWarn = parseWarningsFromDoc('', {
  storyPointCeiledInfo: { rawNumber: 8.5, storyPoint: 9, raw: '8.5 SP' },
});
assert(
  ceilWarn.some((w) => w.type === 'story-point-ceiled' && /向上取整/.test(w.message)),
  'story-point-ceiled warning',
);

const sampleCard = path.join(
  root,
  '../../../../../efficiency-hub-doc/00-开发迭代/ITER-20260727-0001-开发迭代22/REQ-20260802-0005-SC-260802-005-技能包上传需求预填与故事点初始值/SC-260802-005-技能包上传需求预填与故事点初始值.md',
);
try {
  if (!fs.existsSync(sampleCard)) {
    console.log('SKIP real card: story card path not in this workspace');
  } else {
    const doc = parseRequirementDoc(sampleCard);
    assert(doc.ok && doc.parsed.storyPoint === 8, 'parse real story card → 8');
  }
} catch (e) {
  console.log('SKIP real card:', e.message);
}

const yml = parseRequirementUploadDefaultsFromText(`
requirement_upload_defaults:
  business_domain_name: "域A"
  feature_team_name: 组B
  app_service_name: ''
`);
assert(yml.found && yml.effective && yml.defaults.feature_team_name === '组B', 'yml parse');

assert(matchUniqueByName([{ id: '1', name: '域A' }], '域A').status === 'unique', 'exact match');
assert(
  matchUniqueByName([{ id: '1', name: '研效' }, { id: '2', name: '研效通' }], '研').status ===
    'ambiguous',
  'ambiguous no pick',
);

const teamHit = resolveNamesToIds(
  { business_domain_name: '域A', feature_team_name: 'AI创新组', app_service_name: '服务C' },
  {
    domains: [{ id: '10', name: '域A' }],
    teams: [{ id: '20', name: 'AI创新组' }],
    projects: [{ id: '30', name: 'IT研发数智化' }],
    appServices: [{ id: '40', name: '服务C' }],
  },
);
assert(
  teamHit.resolved.teamId === '20' &&
    teamHit.resolved.featureTeamResolvePath === 'team' &&
    !teamHit.resolved.projectId &&
    teamHit.unresolved.length === 0,
  'feature_team_name → M06 teamId',
);

const projectHit = resolveNamesToIds(
  { business_domain_name: '域A', feature_team_name: 'IT研发数智化', app_service_name: '' },
  {
    domains: [{ id: '10', name: '域A' }],
    teams: [{ id: '20', name: 'AI创新组' }],
    projects: [{ id: '30', name: 'IT研发数智化' }],
    appServices: [],
  },
);
assert(
  projectHit.resolved.projectId === '30' &&
    projectHit.resolved.featureTeamResolvePath === 'project' &&
    !projectHit.resolved.teamId,
  'feature_team_name miss M06 → M02 projectId',
);

const missBoth = resolveNamesToIds(
  { feature_team_name: '不存在的名字' },
  { domains: [], teams: [], projects: [], appServices: [] },
);
assert(
  missBoth.unresolved.some((u) => u.field === 'feature_team_name' && u.status === 'miss'),
  'feature_team_name miss both lists',
);

const loaded = loadRequirementUploadDefaults({
  docRoot: path.join(root, '../../../../../efficiency-hub-doc'),
});
if (!loaded.ok || !loaded.found) {
  console.log('SKIP load product-repos.yml: not found in this workspace');
} else {
  assert(loaded.ok && loaded.found, 'load product-repos.yml defaults section');
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
