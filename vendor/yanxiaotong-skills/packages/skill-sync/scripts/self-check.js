#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'PACK.md',
  'reference/boot.md',
  'reference/instructions.md',
  'reference/open-api-sync.md',
  'reference/ui/response-templates.md',
  'tools/sync.mjs',
  'tools/registry.mjs',
  'tools/lib/paths.mjs',
  'tools/lib/scan-manifests.mjs',
  'tools/lib/registry.mjs',
  'tools/lib/atomic-write.mjs',
  'tools/lib/open-api-client.mjs',
  'tools/lib/download.mjs',
  'tools/lib/parse-skill-ref.mjs',
  'tools/lib/format-list.mjs',
];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

for (const rel of required) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`MISSING: ${rel}`);
  }
}

const syncMjs = path.join(ROOT, 'tools/sync.mjs');
if (fs.existsSync(syncMjs)) {
  const t = fs.readFileSync(syncMjs, 'utf8');
  if (!/createUpdateStaging/.test(t)) {
    fail('sync.mjs: must use createUpdateStaging for update (P-258)');
  }
  if (!/cmdDailyAuto|daily-auto/.test(t)) {
    fail('sync.mjs: missing daily-auto command (P-271)');
  }
  if (/from '\.\.\/\.\.\/\.\.\/\.\.\/tools\//.test(t)) {
    fail('sync.mjs: parent tools import must use ../../../tools (P-271)');
  }
  if (/createStaging\(installDirAbs\)/.test(t)) {
    fail('sync.mjs: must not stage inside installDir (P-258)');
  }
  if (!/resolveInstallTarget/.test(t) || !/currentInstallDir/.test(t)) {
    fail('sync.mjs: update must resolve install target on rename (P-266)');
  }
  if (!/reconcileRegistryFromScan/.test(t)) {
    fail('sync.mjs: must reconcile registry from disk on check-all');
  }
  if (!/assertDiskPackageMd5/.test(t)) {
    fail('sync.mjs: must verify disk manifest before registry upsert');
  }
  if (!/prepareSelfUpdatePending|selfUpdatePending|apply-self-pending|P-412/.test(t)) {
    fail('sync.mjs: missing self-update pending / apply-self-pending (P-412)');
  }
  if (!/selfUpdatePending/.test(t) || !/isSelfUpdateInstallDir/.test(t)) {
    fail('sync.mjs: self-update must detect main pack and set pending (P-412)');
  }
}

const registryLib = path.join(ROOT, 'tools/lib/registry.mjs');
if (fs.existsSync(registryLib)) {
  const t = fs.readFileSync(registryLib, 'utf8');
  if (!/P-413|plainMatchesSkill|粘滞/.test(t)) {
    fail('registry.mjs: missing sticky installDir for plain vs name-id (P-413)');
  }
  if (!/assertPathInsideRoot|isPathInsideRoot|safeRelInstallDir/.test(t)) {
    fail('registry.mjs: missing skillsRoot containment guard for install/rm');
  }
}

const pathsLib = path.join(ROOT, 'tools/lib/paths.mjs');
if (fs.existsSync(pathsLib)) {
  const t = fs.readFileSync(pathsLib, 'utf8');
  if (!/assertPathInsideRoot/.test(t)) {
    fail('paths.mjs: missing assertPathInsideRoot');
  }
  if (!/cleaned === '\.' \|\| cleaned === '\.\.'/.test(t) && !/=== '\.\.'/.test(t)) {
    fail('paths.mjs: sanitizeDirSegment must reject . / ..');
  }
  if (!/INVALID_SKILL_ID/.test(t) || !/\^\\d\+\$/.test(t)) {
    fail('paths.mjs: resolveInstallDirName must validate numeric skillId');
  }
}

const selfPending = path.join(ROOT, 'tools/lib/self-update-pending.mjs');
if (!fs.existsSync(selfPending)) {
  fail('MISSING: tools/lib/self-update-pending.mjs (P-412)');
} else {
  const t = fs.readFileSync(selfPending, 'utf8');
  if (!/writeTempSelfApplyScript|prepareSelfUpdatePending|PENDING_MARKER_NAME/.test(t)) {
    fail('self-update-pending.mjs: missing prepare/TEMP apply (P-412)');
  }
  if (!/legacyDirs|legacyRemoved/.test(t)) {
    fail('self-update-pending.mjs: TEMP apply must remove legacyDirs (P-413)');
  }
  if (!/atomicReplaceInPlace|replaceMode.*inplace|P-414/.test(t)) {
    fail('self-update-pending.mjs: TEMP apply must use in-place replace (P-414)');
  }
}

const atomic = path.join(ROOT, 'tools/lib/atomic-write.mjs');
if (fs.existsSync(atomic)) {
  const t = fs.readFileSync(atomic, 'utf8');
  if (!/createUpdateStaging/.test(t)) {
    fail('atomic-write.mjs: missing createUpdateStaging (P-258)');
  }
  if (!/P-258/.test(t)) {
    fail('atomic-write.mjs: missing P-258 staging comment');
  }
  if (!/EPERM|EBUSY|withBusyRetry/.test(t)) {
    fail('atomic-write.mjs: missing busy retry for Windows self-replace (P-412)');
  }
  if (!/atomicReplaceInPlace|P-414|禁止.*rename|inplace/.test(t)) {
    fail('atomic-write.mjs: missing atomicReplaceInPlace (P-414)');
  }
}

const formatList = path.join(ROOT, 'tools/lib/format-list.mjs');
if (fs.existsSync(formatList)) {
  const t = fs.readFileSync(formatList, 'utf8');
  if (/逗号分隔/.test(t)) {
    fail('format-list.mjs: must not ask comma-separated skillIds (P-261)');
  }
  if (!/formatUpdateConfirmFooter/.test(t)) {
    fail('format-list.mjs: missing numbered confirm footer (P-261)');
  }
  if (!/security_pending/.test(t)) {
    fail('format-list.mjs: missing security_pending status (P-260)');
  }
  if (/本地版本/.test(t)) {
    fail('format-list.mjs: must not show 本地版本 column (P-270)');
  }
  if (!/选择部分更新/.test(t)) {
    fail('format-list.mjs: missing partial update menu (P-268)');
  }
  if (!/重新比对/.test(t)) {
    fail('format-list.mjs: missing 重新比对 menu option (P-269)');
  }
  if (!/formatDailyAutoCompact|resolveDailyAutoDisplay/.test(t)) {
    fail('format-list.mjs: missing daily compact display (P-273)');
  }
  if (/远端\s+\$\{/.test(t) || /remoteVersion/.test(t)) {
    fail('format-list.mjs: list detail must not include version numbers (P-270)');
  }
}

const download = path.join(ROOT, 'tools/lib/download.mjs');
if (fs.existsSync(download)) {
  const t = fs.readFileSync(download, 'utf8');
  if (!/extractZipWinDotNet|P-259/.test(t)) {
    fail('download.mjs: missing UTF-8 zip extraction fallback (P-259)');
  }
  if (/Expand-Archive/.test(t) && !/ZipFile/.test(t)) {
    fail('download.mjs: Expand-Archive must not be sole Windows fallback (P-259)');
  }
}
const tpl = path.join(ROOT, 'reference/ui/response-templates.md');
if (fs.existsSync(tpl)) {
  const t = fs.readFileSync(tpl, 'utf8');
  for (const name of [
    'T-SYNC-UPDATE-PARTIAL-ASK',
    'T-SYNC-UPDATE-FAIL',
    'T-SYNC-RETRY-ASK',
    'T-SYNC-SECURITY-PENDING',
    'T-SYNC-SELF-UPDATE',
  ]) {
    if (!t.includes(name)) fail(`response-templates.md: missing ${name}`);
  }
  if (!/P-412|self_update_apply_cmd|两阶段/.test(t)) {
    fail('response-templates.md: missing self-update pending protocol (P-412)');
  }
  if (/本地版本/.test(t)) {
    fail('response-templates.md: must not show 本地版本 column (P-270)');
  }
  if (!/选择部分更新/.test(t)) {
    fail('response-templates.md: missing partial update flow (P-268)');
  }
  if (!/重新比对/.test(t)) {
    fail('response-templates.md: missing 重新比对 in confirm menu (P-269)');
  }
  if (/逗号分隔/.test(t)) {
    fail('response-templates.md: must not ask comma-separated skillIds (P-261)');
  }
}

if (errors.length) {
  console.error(`skill-sync self-check FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('skill-sync self-check OK');
