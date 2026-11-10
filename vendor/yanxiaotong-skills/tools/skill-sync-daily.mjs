#!/usr/bin/env node
/**
 * 每日首用 skill-sync 比对记录（P-271）
 * SSOT：router/skill-sync-daily.md
 */
import { parseCli } from './lib/open-api-token.mjs';
import {
  recordSkillSyncDailyCheck,
  shouldRunDailySkillSyncCheck,
  skillSyncDailyInfo,
} from './lib/skill-sync-daily.mjs';

const args = parseCli(process.argv.slice(2));
const action = String(args._[0] || args.action || 'info');
const environment = args.environment ? String(args.environment) : '';

if (args.help) {
  console.log(`Usage:
  node tools/skill-sync-daily.mjs info [--environment 生产|UAT|本地]
  node tools/skill-sync-daily.mjs should-check [--environment ...]
  node tools/skill-sync-daily.mjs record-check [--environment ...]`);
  process.exit(0);
}

try {
  if (action === 'info') {
    const env = environment || '生产';
    console.log(JSON.stringify(skillSyncDailyInfo(env), null, 2));
  } else if (action === 'should-check') {
    const env = environment || '生产';
    console.log(JSON.stringify({ ...shouldRunDailySkillSyncCheck(env), environment: env }, null, 2));
  } else if (action === 'record-check') {
    if (!environment) {
      console.error('record-check requires --environment 生产|UAT|本地');
      process.exit(1);
    }
    const extra = {};
    if (args.updatable != null) extra.updatable_found = Number(args.updatable);
    if (args.success != null) extra.update_success_count = Number(args.success);
    if (args.failure != null) extra.update_failure_count = Number(args.failure);
    if (args['self-update'] != null || args.selfUpdate != null) {
      extra.self_update = String(args['self-update'] ?? args.selfUpdate) === 'true';
    }
    if (extra.update_success_count > 0) {
      extra.last_update_at = new Date().toISOString();
    }
    console.log(JSON.stringify(recordSkillSyncDailyCheck(environment, extra), null, 2));
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
