#!/usr/bin/env node
/**
 * 父包公共 · 开放 API 令牌存储（Q10/Q17）
 * SSOT：router/token-store.md
 */
import {
  deleteTokenFile,
  maskToken,
  parseCli,
  readTokenFile,
  resolveToken,
  tokenStoreInfo,
  writeTokenFile,
} from './lib/open-api-token.mjs';

const args = parseCli(process.argv.slice(2));
const action = String(args._[0] || args.action || 'info');
const environment = args.environment ? String(args.environment) : '';

if (args.help) {
  console.log(`Usage:
  node tools/token-store.mjs info [--environment 生产|UAT|本地]
  node tools/token-store.mjs resolve [--token <t>] [--environment ...]
  node tools/token-store.mjs write --token <t> --environment 生产|UAT|本地
  node tools/token-store.mjs delete [--environment ...]
  node tools/token-store.mjs mask --token <t>`);
  process.exit(0);
}

try {
  if (action === 'info') {
    console.log(JSON.stringify(tokenStoreInfo(environment || undefined), null, 2));
  } else if (action === 'resolve') {
    const t = resolveToken({ cliToken: args.token, environment: environment || undefined });
    if (!t) {
      console.error(
        'No token: pass --token, set YXT_OPEN_API_TOKEN, or save with write --environment'
      );
      process.exit(1);
    }
    console.log(t);
  } else if (action === 'write') {
    if (!environment) {
      console.error('write requires --environment 生产|UAT|本地');
      process.exit(1);
    }
    const p = writeTokenFile(args.token, environment);
    console.log(`OK: ${p}`);
  } else if (action === 'delete') {
    deleteTokenFile(environment || undefined);
    console.log(environment ? `OK: token removed for ${environment}` : 'OK: all saved tokens removed');
  } else if (action === 'mask') {
    console.log(maskToken(String(args.token || readTokenFile(environment || undefined))));
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
