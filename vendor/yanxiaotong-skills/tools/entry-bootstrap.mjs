#!/usr/bin/env node
/**
 * 父包 @ 入口一次性引导（P-205 · P-411 · P-412）
 * §0a 环境 + §0b token + §0c 平台技能包扫描更新（@ 后无论有无输入均触发）。
 *
 * Usage:
 *   node tools/entry-bootstrap.mjs [--text "用户当轮完整首句"] [--print-plan]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  envSourceSuffix,
  maskToken,
  parseCli,
  resolveEntryEnv,
  resolveToken,
} from './lib/open-api-token.mjs';
import { shouldRunDailySkillSyncCheck } from './lib/skill-sync-daily.mjs';
import { resolveRouteHint } from './lib/route-hint.mjs';
import { readUserTextFromArgs } from './lib/read-user-text.mjs';
import {
  hasBusinessIntent,
  runDailySkillSyncIfNeeded,
} from './lib/run-daily-skill-sync.mjs';
import { buildDailySyncBanner, buildFirstScreen } from './lib/first-screen.mjs';
import {
  readSelfUpdatePending,
  refreshSelfUpdateApplyCmd,
} from '../packages/skill-sync/tools/lib/self-update-pending.mjs';

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SKILLS_ROOT = path.dirname(PACK_ROOT);

const args = parseCli(process.argv.slice(2));
if (args.help) {
  console.log(`Usage:
  node tools/entry-bootstrap.mjs [--text "用户当轮完整首句（含 @ 后全部内容）"] [--text-file utf8.txt] [--print-plan]

Outputs JSON:
  { selected_env, token_ready, route_hint, skill_sync_daily,
    daily_sync_block, self_update, self_update_pending, self_update_apply_cmd,
    mode, user_visible_text }

mode:
  token_ask     — 贴 T-TOKEN-ASK
  first_screen  — 原样贴 user_visible_text（含 §0c + 菜单）
  handoff       — 若 user_visible_text 非空则原样贴，再按 route_hint 进子包
  self_update_apply — 有 pending：先跑 self_update_apply_cmd，再决定是否停轮

--print-plan: dry-run，不调 API`);
  process.exit(0);
}

const userText = readUserTextFromArgs(args, { positional: true });
const route_hint = resolveRouteHint(userText);
const withIntent = hasBusinessIntent(route_hint);

if (args['print-plan'] || args.printPlan) {
  const plan = [
    '1. 必须：node tools/entry-bootstrap.mjs --text "用户完整首句（@ 后无论有无输入）"',
    '2. token 未就绪 → mode=token_ask → T-TOKEN-ASK',
    '3. 若 self_update_pending → 同轮先跑 self_update_apply_cmd（P-412）',
    '4. apply 成功且 self_update → T-SYNC-SELF-UPDATE 并停本轮',
    '5. 无意图 → mode=first_screen → 原样贴 user_visible_text',
    '6. 有意图 → mode=handoff → 原样贴 user_visible_text（若有）→ handoff 子包',
    '7. 禁止因用户带了描述/意图而跳过本命令；§0c 扫描更新在本命令内完成',
  ];
  console.log(JSON.stringify({ print_plan: plan, route_hint, note: 'dry-run · 不调用 API' }, null, 2));
  process.exit(0);
}

const selected_env = resolveEntryEnv(userText);
const token = resolveToken({ environment: selected_env.env_label });
const env_source_suffix = envSourceSuffix(selected_env.env_source);
const skillsRoot = String(args['skills-root'] || args.skillsRoot || DEFAULT_SKILLS_ROOT);

let skill_sync_daily = token
  ? shouldRunDailySkillSyncCheck(selected_env.env_label)
  : { should_check: false, last_check_at: null, last_check_date: null, today: null, skipped: 'no_token' };

let daily_sync_block = null;
let self_update = false;
let self_update_pending = false;
let self_update_apply_cmd = null;

// §0c：与意图无关 —— token 通过且当日未跑则扫描更新一次（含残留 pending 暴露）
if (token) {
  const daily = runDailySkillSyncIfNeeded({
    environment: selected_env.env_label,
    skillsRoot,
    packRoot: PACK_ROOT,
  });
  daily_sync_block = daily.dailyBlock;
  self_update = daily.selfUpdate;
  self_update_pending = Boolean(daily.selfUpdatePending);
  self_update_apply_cmd = daily.selfUpdateApplyCmd || null;
  skill_sync_daily = daily.skill_sync_daily;
}

// 残留 pending（未跑 daily 时）
if (token && !self_update_pending && readSelfUpdatePending(skillsRoot)) {
  const refreshed = refreshSelfUpdateApplyCmd(skillsRoot);
  if (refreshed) {
    self_update_pending = true;
    self_update_apply_cmd = refreshed.self_update_apply_cmd;
  }
}

let mode = 'token_ask';
let user_visible_text = null;

if (!token) {
  mode = 'token_ask';
  user_visible_text = null;
} else if (self_update_pending) {
  // P-412：Agent 须先 apply；此处不贴菜单，避免未落盘继续业务
  mode = 'self_update_apply';
  user_visible_text = null;
} else if (!withIntent) {
  mode = 'first_screen';
  user_visible_text = buildFirstScreen({
    envLabel: selected_env.env_label,
    envSourceSuffix: env_source_suffix,
    dailySyncBlock: daily_sync_block,
    selfUpdate: self_update,
  });
} else {
  mode = 'handoff';
  user_visible_text = buildDailySyncBanner({
    dailySyncBlock: daily_sync_block,
    selfUpdate: self_update,
  }) || null;
}

const payload = {
  selected_env,
  env_source_suffix,
  token_ready: Boolean(token),
  token_hint: token ? maskToken(token) : null,
  skill_sync_daily,
  route_hint,
  daily_sync_block,
  self_update,
  self_update_pending,
  self_update_apply_cmd,
  mode,
  user_visible_text,
};

console.log(JSON.stringify(payload, null, 2));
process.exit(token ? 0 : 2);
