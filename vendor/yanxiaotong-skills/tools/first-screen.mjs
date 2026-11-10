#!/usr/bin/env node
/**
 * 无意图首屏（P-273）· 兼容入口
 * 推荐路径：只跑 entry-bootstrap（mode=first_screen 已含菜单 + §0c）。
 * 本 CLI 仍可单独调用：自行 §0c + 输出 T-FIRST-SCREEN。
 *
 * Usage:
 *   node tools/first-screen.mjs --text "@yanxiaotong-skills"
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  envSourceSuffix,
  parseCli,
  resolveEntryEnv,
  resolveToken,
} from './lib/open-api-token.mjs';
import { buildFirstScreen } from './lib/first-screen.mjs';
import { runDailySkillSyncIfNeeded } from './lib/run-daily-skill-sync.mjs';
import { readUserTextFromArgs } from './lib/read-user-text.mjs';

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SKILLS_ROOT = path.dirname(PACK_ROOT);

const args = parseCli(process.argv.slice(2));
if (args.help) {
  console.log(`Usage:
  node tools/first-screen.mjs --text "用户当轮首句或 @yanxiaotong-skills"

Outputs T-FIRST-SCREEN text (stdout). Exit 2 when token missing.
Prefer: node tools/entry-bootstrap.mjs --text "…" （mode=first_screen → user_visible_text）`);
  process.exit(0);
}

const userText = readUserTextFromArgs(args, { positional: true });
const selected_env = resolveEntryEnv(userText);
const token = resolveToken({ environment: selected_env.env_label });
if (!token) {
  console.error(
    JSON.stringify(
      {
        error: 'token_missing',
        selected_env,
        env_source_suffix: envSourceSuffix(selected_env.env_source),
      },
      null,
      2
    )
  );
  process.exit(2);
}

const skillsRoot = String(args['skills-root'] || args.skillsRoot || DEFAULT_SKILLS_ROOT);
const daily = runDailySkillSyncIfNeeded({
  environment: selected_env.env_label,
  skillsRoot,
  packRoot: PACK_ROOT,
});

const text = buildFirstScreen({
  envLabel: selected_env.env_label,
  envSourceSuffix: envSourceSuffix(selected_env.env_source),
  dailySyncBlock: daily.dailyBlock,
  selfUpdate: daily.selfUpdate,
});

if (daily.selfUpdatePending) {
  console.log(
    JSON.stringify(
      {
        mode: 'self_update_apply',
        self_update_pending: true,
        self_update_apply_cmd: daily.selfUpdateApplyCmd,
        note: 'P-412: run self_update_apply_cmd before first-screen',
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(text);
process.exit(0);
