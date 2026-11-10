#!/usr/bin/env node
/**
 * skill-sync CLI: parse-skill-ref / scan / check-all / update / install / status
 */
import { fetchSyncMeta, parseCli } from './lib/open-api-client.mjs';
import { scanManifests } from './lib/scan-manifests.mjs';
import {
  listSkills,
  readRegistry,
  reconcileRegistryFromScan,
  removeLegacyInstallDirs,
  resolveInstallTarget,
  upsertSkill,
} from './lib/registry.mjs';
import {
  atomicReplace,
  atomicReplaceInPlace,
  cleanupStaging,
  createInstallStaging,
  createUpdateStaging,
  verifyStaging,
} from './lib/atomic-write.mjs';
import {
  prepareSelfUpdatePending,
  readSelfUpdatePending,
  refreshSelfUpdateApplyCmd,
  applySelfUpdatePendingInProcess,
} from './lib/self-update-pending.mjs';
import { downloadSkillZipToStaging } from './lib/download.mjs';
import { parseSkillRef, resolveSkillIdFromArgs } from './lib/parse-skill-ref.mjs';
import { enrichItemForList, formatCheckAllTable, buildCheckAllSummary, resolveDailyAutoDisplay } from './lib/format-list.mjs';
import {
  resolveSkillsRoot,
  normalizeRelPath,
  readSkillDisplayName,
  readManifestFromSkillDir,
  assertDiskPackageMd5,
  PACK_ROOT,
} from './lib/paths.mjs';
import path from 'node:path';
import fs from 'node:fs';
import {
  recordSkillSyncDailyCheck,
  shouldRunDailySkillSyncCheck,
} from '../../../tools/lib/skill-sync-daily.mjs';
import { getEnvConfig } from '../../../tools/lib/open-api-token.mjs';

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');

function parseSkillIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSelfUpdateInstallDir(installDir, displayName) {
  const n = normalizeRelPath(installDir).toLowerCase();
  const d = String(displayName || '').toLowerCase();
  return (
    d === 'yanxiaotong-skills' ||
    n === 'yanxiaotong-skills' ||
    /^yanxiaotong-skills-\d+$/.test(n) ||
    n.endsWith('/yanxiaotong-skills')
  );
}

function apiOpts() {
  return { baseUrl: args.env || args.baseUrl, token: args.token };
}

function isSecurityPendingMessage(message) {
  return /安全检测|SafeSkill|检测中|检测进行中|暂不可下载/i.test(String(message || ''));
}

async function applySkillPackage({
  skillId,
  skillsRoot,
  currentInstallDirAbs = null,
  opts,
  dryRun = false,
}) {
  const remote = await fetchSyncMeta(skillId, opts);
  // draft / published 均可下载；安全检测未通过仍由 skill-zip 接口拒绝

  const stagingParent = currentInstallDirAbs
    ? createUpdateStaging(skillsRoot)
    : createInstallStaging(skillsRoot);

  try {
    await downloadSkillZipToStaging(skillId, stagingParent, opts);
    const verify = verifyStaging(stagingParent, remote.packageMd5);
    if (!verify.ok) {
      const err = new Error(verify.reason);
      err.code = 'VERIFY_FAILED';
      throw err;
    }

    const displayName = readSkillDisplayName(verify.skillDir);
    const manifest = readManifestFromSkillDir(verify.skillDir);
    const resolvedSkillId = manifest?.skillId != null ? String(manifest.skillId) : String(skillId);
    const currentInstallDir = currentInstallDirAbs
      ? normalizeRelPath(path.relative(skillsRoot, currentInstallDirAbs))
      : null;

    const target = resolveInstallTarget(skillsRoot, {
      displayName,
      skillId: resolvedSkillId,
      currentInstallDir,
    });
    const { installDir, targetAbs, legacyDirs } = target;
    const relocated =
      !!currentInstallDir && normalizeRelPath(currentInstallDir) !== normalizeRelPath(installDir);

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        skillId: String(skillId),
        installDir,
        previousInstallDir: currentInstallDir,
        relocated,
        displayName,
        installPath: targetAbs,
        currentVersion: remote.currentVersion || null,
        packageMd5: remote.packageMd5,
        selfUpdate: isSelfUpdateInstallDir(installDir, displayName),
        selfUpdatePending: false,
      };
    }

    const selfTarget = isSelfUpdateInstallDir(installDir, displayName);
    if (selfTarget) {
      // P-412：持锁进程不对主包根目录 rename，只 prepare pending
      const prepared = prepareSelfUpdatePending({
        skillsRoot,
        skillId: resolvedSkillId,
        packageMd5: remote.packageMd5,
        currentVersion: remote.currentVersion || null,
        displayName,
        installDir,
        targetAbs,
        stagingSkillDir: verify.skillDir,
        legacyDirs,
      });
      return {
        ok: true,
        skillId: resolvedSkillId,
        installDir,
        previousInstallDir: currentInstallDir,
        relocated,
        displayName,
        installPath: targetAbs,
        currentVersion: remote.currentVersion || null,
        packageMd5: String(remote.packageMd5 || '').toLowerCase(),
        selfUpdate: false,
        selfUpdatePending: true,
        selfUpdateApplyCmd: prepared.applyCmd,
        applyScriptPath: prepared.applyScriptPath,
      };
    }

    atomicReplace(verify.skillDir, targetAbs);
    if (legacyDirs.length) {
      removeLegacyInstallDirs(skillsRoot, legacyDirs);
    }
    const installedManifest = assertDiskPackageMd5(targetAbs, remote.packageMd5);
    upsertSkill(skillsRoot, {
      skillId: resolvedSkillId,
      installDir,
      packageMd5: installedManifest.packageMd5,
      currentVersion: installedManifest.currentVersion || remote.currentVersion,
      source: 'plaza',
    });

    return {
      ok: true,
      skillId: resolvedSkillId,
      installDir,
      previousInstallDir: currentInstallDir,
      relocated,
      displayName,
      installPath: targetAbs,
      currentVersion: installedManifest.currentVersion || remote.currentVersion || null,
      packageMd5: String(installedManifest.packageMd5 || '').toLowerCase(),
      selfUpdate: false,
      selfUpdatePending: false,
    };
  } finally {
    cleanupStaging(stagingParent);
  }
}

function cmdParseSkillRef() {
  const text = args.text ?? args._[1];
  if (text == null || String(text).trim() === '') {
    console.error('parse-skill-ref requires --text "<url or skillId>"');
    process.exit(1);
  }
  const parsed = parseSkillRef(text);
  if (!parsed) {
    console.error(`Cannot parse skillId from: ${String(text).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(JSON.stringify(parsed, null, 2));
}

async function cmdScan() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const items = scanManifests(skillsRoot);
  console.log(JSON.stringify({ skillsRoot, items }, null, 2));
}

async function classifyItem(item, opts) {
  const base = {
    skillId: item.skillId,
    installDir: item.installDir,
    displayName: item.displayName,
    localMd5: item.localMd5,
    currentVersion: item.currentVersion,
    duplicateSkillId: !!item.duplicateSkillId,
    scanError: item.scanError || null,
    remoteMd5: null,
    remoteVersion: null,
    status: null,
    needUpdate: false,
    selectable: false,
    skipReason: null,
    error: null,
  };

  if (item.scanError) {
    base.skipReason = 'manifest_invalid';
    base.error = item.scanError;
    return base;
  }

  if (base.duplicateSkillId) {
    base.skipReason = 'duplicate_skill_id';
    base.error = 'duplicate skillId in multiple manifest paths';
    return base;
  }

  try {
    const remote = await fetchSyncMeta(item.skillId, opts);
    base.remoteMd5 = String(remote.packageMd5 || '').toLowerCase();
    base.remoteVersion = remote.currentVersion || null;
    base.status = remote.status || null;
    // draft / published 均按 MD5 比对；不因草稿跳过
    if (base.localMd5 === base.remoteMd5) {
      base.skipReason = 'up_to_date';
      base.needUpdate = false;
      return base;
    }
    base.needUpdate = true;
    base.selectable = true;
    return base;
  } catch (e) {
    base.error = e.message || String(e);
    base.skipReason = isSecurityPendingMessage(base.error) ? 'security_pending' : 'sync_meta_error';
    return base;
  }
}

function updateBlockedReason(classified) {
  if (classified.needUpdate && classified.selectable) return null;
  const map = {
    manifest_invalid: 'manifest invalid',
    duplicate_skill_id: 'duplicate skillId',
    local_modified: 'local files modified (removed)',
    draft: 'not published',
    up_to_date: 'already up to date',
    security_pending: 'security check pending',
    sync_meta_error: 'sync-meta failed',
  };
  return map[classified.skipReason] || classified.skipReason || 'not updatable';
}

async function collectCheckAllItems(skillsRoot, opts) {
  const scanned = scanManifests(skillsRoot);
  const items = [];
  for (const row of scanned) {
    reconcileRegistryFromScan(skillsRoot, row);
    items.push(enrichItemForList(await classifyItem(row, opts)));
  }
  const summary = buildCheckAllSummary(items);
  return { skillsRoot, summary, items };
}

async function runUpdateForSkillIds({ skillsRoot, skillIds, opts, dryRun = false }) {
  const scanned = scanManifests(skillsRoot);
  const byId = new Map(scanned.map((s) => [String(s.skillId), s]));
  const results = [];
  let selfUpdate = false;
  let selfUpdatePending = false;
  let selfUpdateApplyCmd = null;

  // P-412：非主包先更新；主包放到最后且只 prepare
  const orderedIds = [...skillIds].sort((a, b) => {
    const ia = byId.get(String(a));
    const ib = byId.get(String(b));
    const sa = ia
      ? isSelfUpdateInstallDir(ia.installDir, readSkillDisplayName(path.join(skillsRoot, ia.installDir)))
      : false;
    const sb = ib
      ? isSelfUpdateInstallDir(ib.installDir, readSkillDisplayName(path.join(skillsRoot, ib.installDir)))
      : false;
    if (sa === sb) return 0;
    return sa ? 1 : -1;
  });

  for (const skillId of orderedIds) {
    const item = byId.get(String(skillId));
    if (!item) {
      results.push({ skillId, ok: false, error: 'manifest not found locally' });
      continue;
    }

    const classified = await classifyItem(item, opts);
    const blocked = updateBlockedReason(classified);
    if (blocked) {
      results.push({ skillId, ok: false, error: `skipped: ${blocked}`, skipReason: classified.skipReason });
      continue;
    }

    if (dryRun) {
      try {
        const preview = await applySkillPackage({
          skillId,
          skillsRoot,
          currentInstallDirAbs: path.join(skillsRoot, item.installDir),
          opts,
          dryRun: true,
        });
        results.push({
          skillId,
          ok: true,
          dryRun: true,
          installDir: preview.installDir,
          previousInstallDir: preview.previousInstallDir,
          relocated: preview.relocated,
          selfUpdatePending: Boolean(preview.selfUpdate),
        });
      } catch (e) {
        results.push({ skillId, ok: false, error: e.message || String(e) });
      }
      continue;
    }

    const currentInstallDirAbs = path.join(skillsRoot, item.installDir);
    try {
      const applied = await applySkillPackage({
        skillId,
        skillsRoot,
        currentInstallDirAbs,
        opts,
        dryRun: false,
      });
      if (applied.selfUpdate) selfUpdate = true;
      if (applied.selfUpdatePending) {
        selfUpdatePending = true;
        selfUpdateApplyCmd = applied.selfUpdateApplyCmd || selfUpdateApplyCmd;
      }
      results.push({
        skillId,
        ok: true,
        installDir: applied.installDir,
        previousInstallDir: applied.previousInstallDir,
        relocated: applied.relocated,
        packageMd5: applied.packageMd5,
        selfUpdatePending: Boolean(applied.selfUpdatePending),
        selfUpdateApplyCmd: applied.selfUpdateApplyCmd || undefined,
      });
    } catch (e) {
      results.push({ skillId, ok: false, error: e.message || String(e) });
    }
  }

  return { results, selfUpdate, selfUpdatePending, selfUpdateApplyCmd };
}

async function cmdCheckAll() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const opts = apiOpts();
  const out = await collectCheckAllItems(skillsRoot, opts);
  if (args.human || args['human']) {
    console.log(formatCheckAllTable(out));
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
  if (out.summary.updatable > 0) process.exit(2);
}

async function cmdDailyAuto() {
  const environment = args.environment || args.env_label;
  if (environment && !shouldRunDailySkillSyncCheck(environment).should_check) {
    console.log(JSON.stringify({ skipped: true, reason: 'already_ran_today', environment }, null, 2));
    return;
  }

  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const opts = apiOpts();
  if (environment && !opts.baseUrl) {
    opts.baseUrl = getEnvConfig(environment).base_url;
  }

  const check = await collectCheckAllItems(skillsRoot, opts);
  const updatableIds = check.items.filter((i) => i.canUpdate).map((i) => String(i.skillId));
  let update = null;
  if (updatableIds.length > 0) {
    update = await runUpdateForSkillIds({ skillsRoot, skillIds: updatableIds, opts, dryRun: false });
  }

  const successCount = update?.results.filter((r) => r.ok).length ?? 0;
  const failureCount = update?.results.filter((r) => !r.ok).length ?? 0;
  const selfUpdatePending = Boolean(update?.selfUpdatePending) || Boolean(readSelfUpdatePending(skillsRoot));
  let selfUpdateApplyCmd = update?.selfUpdateApplyCmd || null;
  if (selfUpdatePending && !selfUpdateApplyCmd) {
    const refreshed = refreshSelfUpdateApplyCmd(skillsRoot);
    selfUpdateApplyCmd = refreshed?.self_update_apply_cmd || null;
  }
  const now = new Date();
  let record = null;
  if (environment) {
    record = recordSkillSyncDailyCheck(
      environment,
      {
        updatable_found: check.summary.updatable,
        update_success_count: successCount,
        update_failure_count: failureCount,
        self_update: false,
        self_update_pending: selfUpdatePending,
        last_update_at: successCount > 0 ? now.toISOString() : undefined,
      },
      now
    );
  }

  const formatted = resolveDailyAutoDisplay({
    skillsRoot,
    summary: check.summary,
    items: check.items,
    updateResults: update?.results ?? [],
  });

  const out = {
    skillsRoot,
    environment: environment || null,
    stats: formatted.stats,
    rows: formatted.rows,
    displayMode: formatted.displayMode,
    dailyBlock: formatted.dailyBlock,
    summary: check.summary,
    updatableIds,
    update: update?.results ?? [],
    selfUpdate: false,
    self_update: false,
    selfUpdatePending,
    self_update_pending: selfUpdatePending,
    selfUpdateApplyCmd,
    self_update_apply_cmd: selfUpdateApplyCmd,
    updateSuccessCount: successCount,
    updateFailureCount: failureCount,
    record,
  };

  if (args.human || args['human']) {
    console.log(formatted.dailyBlock);
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
  if (failureCount > 0) process.exit(3);
}

async function cmdUpdate() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const skillIds = parseSkillIds(args['skill-ids'] || args.skillIds);
  if (!skillIds.length) {
    console.error('update requires --skill-ids <id>[,id2]');
    process.exit(1);
  }
  const dryRun = !!args['dry-run'] || !!args.dryRun;
  const opts = apiOpts();
  const { results, selfUpdate, selfUpdatePending, selfUpdateApplyCmd } = await runUpdateForSkillIds({
    skillsRoot,
    skillIds,
    opts,
    dryRun,
  });

  let pending = selfUpdatePending;
  let applyCmd = selfUpdateApplyCmd;
  if (!pending && readSelfUpdatePending(skillsRoot)) {
    pending = true;
    applyCmd = refreshSelfUpdateApplyCmd(skillsRoot)?.self_update_apply_cmd || applyCmd;
  }

  console.log(
    JSON.stringify(
      {
        skillsRoot,
        results,
        selfUpdate: Boolean(selfUpdate),
        self_update: Boolean(selfUpdate),
        selfUpdatePending: Boolean(pending),
        self_update_pending: Boolean(pending),
        selfUpdateApplyCmd: applyCmd,
        self_update_apply_cmd: applyCmd,
      },
      null,
      2
    )
  );
  if (results.some((r) => !r.ok)) process.exit(3);
}

async function cmdApplySelfPending() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const pending = readSelfUpdatePending(skillsRoot);
  if (!pending) {
    console.log(JSON.stringify({ ok: false, error: 'no self-update pending', skillsRoot }, null, 2));
    process.exit(1);
  }
  // Prefer TEMP script (no pack imports as main). Fallback: in-process for tests.
  if (pending.applyScriptPath && fs.existsSync(pending.applyScriptPath)) {
    const { execFileSync } = await import('node:child_process');
    try {
      const raw = execFileSync(process.execPath, [pending.applyScriptPath], {
        encoding: 'utf8',
        cwd: path.dirname(pending.applyScriptPath),
      });
      console.log(raw.trim());
      return;
    } catch (e) {
      const out = e.stdout?.toString?.() || '';
      if (out.trim()) console.log(out.trim());
      console.error(e.stderr?.toString?.() || e.message || e);
      process.exit(1);
    }
  }
  const refreshed = refreshSelfUpdateApplyCmd(skillsRoot);
  if (refreshed?.self_update_apply_cmd) {
    const { execFileSync } = await import('node:child_process');
    const script = refreshed.pending.applyScriptPath;
    try {
      const raw = execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        cwd: path.dirname(script),
      });
      console.log(raw.trim());
      return;
    } catch (e) {
      console.error(e.stderr?.toString?.() || e.message || e);
      process.exit(1);
    }
  }
  const applied = await applySelfUpdatePendingInProcess(skillsRoot, {
    atomicReplaceInPlace,
    upsertSkill,
    assertDiskPackageMd5,
    removeLegacyInstallDirs,
  });
  console.log(JSON.stringify(applied, null, 2));
  if (!applied.ok) process.exit(1);
}

async function cmdInstall() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  const resolved = resolveSkillIdFromArgs({
    skillId: args['skill-id'] || args.skillId,
    skillRef: args['skill-ref'] || args.skillRef,
    text: args.text,
    positionals: args._.slice(1),
  });
  if (!resolved) {
    console.error('install requires --skill-id <id> or --skill-ref "<plaza url|id>"');
    process.exit(1);
  }

  const { skillId, source } = resolved;
  const dryRun = !!args['dry-run'] || !!args.dryRun;
  const opts = apiOpts();

  if (dryRun) {
    try {
      const preview = await applySkillPackage({
        skillId,
        skillsRoot,
        currentInstallDirAbs: null,
        opts,
        dryRun: true,
      });
      console.log(JSON.stringify({ skillsRoot, source, ...preview }, null, 2));
      return;
    } catch (e) {
      console.error(e.message || e);
      process.exit(e.code === 'DRAFT' ? 3 : e.status === 401 || e.status === 403 ? 4 : 1);
    }
  }

  let stagingParent = null;
  try {
    const remote = await fetchSyncMeta(skillId, opts);
    // draft / published 均可安装；安全检测未通过仍由 skill-zip 接口拒绝

    stagingParent = createInstallStaging(skillsRoot);
    await downloadSkillZipToStaging(skillId, stagingParent, opts);
    const verify = verifyStaging(stagingParent, remote.packageMd5);
    if (!verify.ok) {
      console.error(verify.reason);
      process.exit(3);
    }

    const displayName = readSkillDisplayName(verify.skillDir);
    const manifest = readManifestFromSkillDir(verify.skillDir);
    const resolvedSkillId = manifest?.skillId != null ? String(manifest.skillId) : String(skillId);
    const { installDir, targetAbs, legacyDirs } = resolveInstallTarget(skillsRoot, {
      displayName,
      skillId: resolvedSkillId,
    });

    if (isSelfUpdateInstallDir(installDir, displayName)) {
      const prepared = prepareSelfUpdatePending({
        skillsRoot,
        skillId: resolvedSkillId,
        packageMd5: remote.packageMd5,
        currentVersion: remote.currentVersion || null,
        displayName,
        installDir,
        targetAbs,
        stagingSkillDir: verify.skillDir,
        legacyDirs,
      });
      const out = {
        skillsRoot,
        ok: true,
        skillId: resolvedSkillId,
        installDir,
        displayName,
        installPath: targetAbs,
        currentVersion: remote.currentVersion || null,
        packageMd5: String(remote.packageMd5 || '').toLowerCase(),
        source,
        selfUpdate: false,
        selfUpdatePending: true,
        self_update_pending: true,
        selfUpdateApplyCmd: prepared.applyCmd,
        self_update_apply_cmd: prepared.applyCmd,
      };
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    atomicReplace(verify.skillDir, targetAbs);
    if (legacyDirs.length) {
      removeLegacyInstallDirs(skillsRoot, legacyDirs);
    }
    const installedManifest = assertDiskPackageMd5(targetAbs, remote.packageMd5);
    upsertSkill(skillsRoot, {
      skillId: resolvedSkillId,
      installDir,
      packageMd5: installedManifest.packageMd5,
      currentVersion: installedManifest.currentVersion || remote.currentVersion,
      source: 'plaza',
    });

    const out = {
      skillsRoot,
      ok: true,
      skillId: resolvedSkillId,
      installDir,
      displayName,
      installPath: targetAbs,
      currentVersion: installedManifest.currentVersion || remote.currentVersion || null,
      packageMd5: String(installedManifest.packageMd5 || '').toLowerCase(),
      source,
      overwritten: fs.existsSync(targetAbs),
      selfUpdate: false,
      selfUpdatePending: false,
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    const code = e.status === 401 || e.status === 403 ? 4 : 1;
    console.error(e.message || e);
    process.exit(code);
  } finally {
    if (stagingParent) cleanupStaging(stagingParent);
  }
}

function cmdStatus() {
  const skillsRoot = resolveSkillsRoot({
    skillsRoot: args['skills-root'] || args.skillsRoot,
    projectRoot: args['project-root'] || args.projectRoot,
  });
  console.log(JSON.stringify({ skillsRoot, skills: listSkills(skillsRoot) }, null, 2));
}

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  node tools/sync.mjs parse-skill-ref --text "<plaza url|skillId>"
  node tools/sync.mjs scan [--skills-root path] [--project-root path]
  node tools/sync.mjs check-all [--skills-root path] [--env base_url] [--token t] [--human]
  node tools/sync.mjs daily-auto [--environment 生产|UAT|本地] [--skills-root path] [--env base_url] [--token t] [--human]
  node tools/sync.mjs update --skill-ids 107[,108] [--dry-run] [--skills-root path]
  node tools/sync.mjs apply-self-pending [--skills-root path]
  node tools/sync.mjs install --skill-id 109 [--skills-root path] [--dry-run]
  node tools/sync.mjs install --skill-ref "https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109"
  node tools/sync.mjs status [--skills-root path]

PACK_ROOT=${PACK_ROOT}`);
    process.exit(0);
  }
  if (cmd === 'parse-skill-ref') cmdParseSkillRef();
  else if (cmd === 'scan') await cmdScan();
  else if (cmd === 'check-all') await cmdCheckAll();
  else if (cmd === 'daily-auto') await cmdDailyAuto();
  else if (cmd === 'update') await cmdUpdate();
  else if (cmd === 'apply-self-pending') await cmdApplySelfPending();
  else if (cmd === 'install') await cmdInstall();
  else if (cmd === 'status') cmdStatus();
  else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
}

main().catch((e) => {
  const code = e.status === 401 || e.status === 403 ? 4 : 1;
  console.error(e.message || e);
  process.exit(code);
});
