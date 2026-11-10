/**
 * §0c 平台技能包扫描更新（P-271 · P-411 · P-412）
 * 由 entry-bootstrap 统一触发：@ 后无论有无输入，token 通过且当日未跑则执行一次。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { shouldRunDailySkillSyncCheck } from './skill-sync-daily.mjs';
import {
  readSelfUpdatePending,
  refreshSelfUpdateApplyCmd,
} from '../../packages/skill-sync/tools/lib/self-update-pending.mjs';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
/** yanxiaotong-skills 根（tools/lib → ../..） */
const PACK_ROOT_DEFAULT = path.resolve(TOOLS_DIR, '..', '..');
const SYNC_CLI_REL = path.join('packages', 'skill-sync', 'tools', 'sync.mjs');

/**
 * @param {{ environment: string, skillsRoot?: string, packRoot?: string }} opts
 */
export function runDailySkillSyncIfNeeded(opts = {}) {
  const environment = opts.environment;
  const packRoot = opts.packRoot || PACK_ROOT_DEFAULT;
  const skillsRoot = opts.skillsRoot || path.dirname(packRoot);
  const gate = shouldRunDailySkillSyncCheck(environment);

  // 残留 pending：即使今日已跑过 daily，仍须暴露 apply_cmd（P-412）
  const leftover = exposePendingApply(skillsRoot);

  if (!gate.should_check) {
    return {
      ran: false,
      skipped: true,
      reason: 'already_ran_today',
      dailyBlock: null,
      selfUpdate: false,
      selfUpdatePending: Boolean(leftover?.self_update_pending),
      selfUpdateApplyCmd: leftover?.self_update_apply_cmd || null,
      skill_sync_daily: gate,
      error: null,
    };
  }

  const syncCli = path.join(packRoot, SYNC_CLI_REL);
  try {
    const raw = execFileSync(
      process.execPath,
      [syncCli, 'daily-auto', '--environment', environment, '--skills-root', skillsRoot],
      { encoding: 'utf8', cwd: os.tmpdir() }
    );
    return finishDailyResult(raw, environment, skillsRoot);
  } catch (e) {
    const raw = e.stdout?.toString?.() || e.stdout || '';
    if (raw && String(raw).trim().startsWith('{')) {
      try {
        return finishDailyResult(raw, environment, skillsRoot);
      } catch {
        /* fall through */
      }
    }
    const msg = e.stderr?.toString() || raw || e.message || String(e);
    const detail = String(msg).trim().slice(0, 400);
    const dailyBlock = `⚠ 技能包自动同步未完成（可继续选菜单或业务；稍后重试或手动执行 skill-sync）\n${detail}`;
    const pending = exposePendingApply(skillsRoot);
    return {
      ran: true,
      skipped: false,
      dailyBlock,
      selfUpdate: false,
      selfUpdatePending: Boolean(pending?.self_update_pending),
      selfUpdateApplyCmd: pending?.self_update_apply_cmd || null,
      skill_sync_daily: shouldRunDailySkillSyncCheck(environment),
      error: detail,
    };
  }
}

function exposePendingApply(skillsRoot) {
  if (!readSelfUpdatePending(skillsRoot)) return null;
  return refreshSelfUpdateApplyCmd(skillsRoot);
}

function finishDailyResult(raw, environment, skillsRoot) {
  const daily = JSON.parse(String(raw).replace(/^\uFEFF/, ''));
  if (daily.skipped) {
    const leftover = exposePendingApply(skillsRoot);
    return {
      ran: false,
      skipped: true,
      reason: daily.reason || 'skipped',
      dailyBlock: null,
      selfUpdate: false,
      selfUpdatePending: Boolean(leftover?.self_update_pending),
      selfUpdateApplyCmd: leftover?.self_update_apply_cmd || null,
      skill_sync_daily: shouldRunDailySkillSyncCheck(environment),
      error: null,
    };
  }
  let selfUpdatePending = Boolean(daily.selfUpdatePending ?? daily.self_update_pending);
  let selfUpdateApplyCmd = daily.selfUpdateApplyCmd || daily.self_update_apply_cmd || null;
  if (!selfUpdatePending) {
    const leftover = exposePendingApply(skillsRoot);
    if (leftover) {
      selfUpdatePending = true;
      selfUpdateApplyCmd = leftover.self_update_apply_cmd;
    }
  } else if (!selfUpdateApplyCmd) {
    selfUpdateApplyCmd = exposePendingApply(skillsRoot)?.self_update_apply_cmd || null;
  }
  return {
    ran: true,
    skipped: false,
    dailyBlock: daily.dailyBlock || null,
    selfUpdate: Boolean(daily.selfUpdate),
    selfUpdatePending,
    selfUpdateApplyCmd,
    skill_sync_daily: shouldRunDailySkillSyncCheck(environment),
    error: null,
  };
}

/** @ 后是否带业务意图（仅影响展示 mode，不影响是否跑 §0c） */
export function hasBusinessIntent(routeHint) {
  if (!routeHint || typeof routeHint !== 'object') return false;
  return Boolean(routeHint.package || routeHint.clarify);
}
