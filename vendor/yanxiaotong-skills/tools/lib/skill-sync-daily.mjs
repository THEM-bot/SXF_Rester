import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ENV_TOKEN_SLUG, getEnvConfig, normalizeEnvironment } from './open-api-token.mjs';

/** 每日首用 skill-sync 比对 · SSOT：router/skill-sync-daily.md */
export const SKILL_SYNC_DAILY_DIR = path.join(os.homedir(), '.yanxiaotong', 'sessions', 'skill-sync-daily');

function dailyFileForEnvironment(environment) {
  const env = normalizeEnvironment(environment);
  return path.join(SKILL_SYNC_DAILY_DIR, `${ENV_TOKEN_SLUG[env]}.json`);
}

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function readSkillSyncDailyRecord(environment) {
  const file = dailyFileForEnvironment(environment);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function shouldRunDailySkillSyncCheck(environment, now = new Date()) {
  const cfg = getEnvConfig(environment);
  const today = localDateKey(now);
  const rec = readSkillSyncDailyRecord(cfg.env_label);
  if (!rec) return { should_check: true, last_check_at: null, last_check_date: null, today };
  const lastDate = rec.last_check_date || (rec.last_check_at ? String(rec.last_check_at).slice(0, 10) : null);
  return {
    should_check: lastDate !== today,
    last_check_at: rec.last_check_at || null,
    last_check_date: lastDate,
    today,
  };
}

export function recordSkillSyncDailyCheck(environment, extra = {}, now = new Date()) {
  const cfg = getEnvConfig(environment);
  const file = dailyFileForEnvironment(cfg.env_label);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = readSkillSyncDailyRecord(cfg.env_label) || {};
  const payload = {
    env_slug: cfg.env_slug,
    env_label: cfg.env_label,
    last_check_date: localDateKey(now),
    last_check_at: now.toISOString(),
    last_update_at: extra.last_update_at ?? prev.last_update_at ?? null,
    updatable_found: extra.updatable_found ?? prev.updatable_found ?? 0,
    update_success_count: extra.update_success_count ?? prev.update_success_count ?? 0,
    update_failure_count: extra.update_failure_count ?? prev.update_failure_count ?? 0,
    self_update: extra.self_update ?? prev.self_update ?? false,
    self_update_pending: extra.self_update_pending ?? prev.self_update_pending ?? false,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function skillSyncDailyInfo(environment) {
  const cfg = getEnvConfig(environment);
  const file = dailyFileForEnvironment(cfg.env_label);
  const rec = readSkillSyncDailyRecord(cfg.env_label);
  const gate = shouldRunDailySkillSyncCheck(cfg.env_label);
  return {
    env_slug: cfg.env_slug,
    env_label: cfg.env_label,
    file,
    exists: Boolean(rec),
    last_check_at: rec?.last_check_at || null,
    last_check_date: rec?.last_check_date || null,
    last_update_at: rec?.last_update_at || null,
    updatable_found: rec?.updatable_found ?? null,
    update_success_count: rec?.update_success_count ?? null,
    should_check: gate.should_check,
    today: gate.today,
  };
}
