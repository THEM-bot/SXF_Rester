#!/usr/bin/env node
/**
 * 父包 · 用户所选环境会话（Q19）
 * SSOT：tools/lib/env-registry.json · Agent 纪律：router/public-env.md · router/boot.md §0a
 */
import {
  getActiveEnv,
  getEnvByMenuIndex,
  getEnvConfig,
  listEnvConfigs,
  parseCli,
  readSelectedEnv,
  resolveEntryEnv,
  writeSelectedEnv,
} from './lib/open-api-token.mjs';

const args = parseCli(process.argv.slice(2));
const action = String(args._[0] || args.action || 'read');

if (args.help) {
  console.log(`Usage:
  node tools/env-session.mjs read
  node tools/env-session.mjs resolve [--text "用户当轮首句"]
  node tools/env-session.mjs write --environment 本地|UAT|生产
  node tools/env-session.mjs write --index 1|2|3
  node tools/env-session.mjs list
  node tools/env-session.mjs lookup --environment 本地|UAT|生产 [--field base_url]`);
  process.exit(0);
}

try {
  if (action === 'read') {
    console.log(JSON.stringify(readSelectedEnv(), null, 2));
  } else if (action === 'resolve') {
    const cfg = resolveEntryEnv(String(args.text || ''));
    console.log(JSON.stringify(cfg, null, 2));
  } else if (action === 'write') {
    let cfg;
    if (args.index != null) cfg = writeSelectedEnv(getEnvByMenuIndex(args.index).env_label);
    else if (args.environment) cfg = writeSelectedEnv(String(args.environment));
    else throw new Error('write requires --environment or --index');
    console.log(JSON.stringify(cfg, null, 2));
  } else if (action === 'list') {
    console.log(JSON.stringify(listEnvConfigs(), null, 2));
  } else if (action === 'lookup') {
    const env = String(args.environment || '');
    const field = String(args.field || 'base_url');
    const allowed = new Set(['base_url', 'web_origin', 'env_slug', 'env_label']);
    if (!allowed.has(field)) throw new Error(`lookup field must be one of: ${[...allowed].join(', ')}`);
    const cfg = getEnvConfig(env);
    process.stdout.write(`${cfg[field]}\n`);
  } else if (action === 'active') {
    console.log(JSON.stringify(getActiveEnv(), null, 2));
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
