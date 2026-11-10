#!/usr/bin/env node
/**
 * 上传会话本地存储（按环境 · ~/.yanxiaotong/sessions/）
 * SSOT：reference/upload/session-store.md
 *
 *   node tools/session-store.mjs info [--environment 生产|UAT|本地] [--project-root <路径>]
 *   node tools/session-store.mjs clear [--environment 生产|UAT|本地] [--project-root <路径>]
 *   node tools/session-store.mjs clear   # 全部环境 + 遗留包内文件
 */
import { clearSession, parseCli, sessionStoreInfo } from './lib/demo-tools.mjs';

const args = parseCli(process.argv.slice(2));
const action = String(args._[0] || args.action || 'info');
const environment = args.environment ? String(args.environment) : '';
const projectRoot = args['project-root'] ? String(args['project-root']) : '';

if (args.help) {
  console.log(`Usage:
  node tools/session-store.mjs info [--environment 生产|UAT|本地] [--project-root <路径>]
  node tools/session-store.mjs clear [--environment 生产|UAT|本地] [--project-root <路径>]
  node tools/session-store.mjs clear`);
  process.exit(0);
}

try {
  if (action === 'info') {
    const info = sessionStoreInfo(
      environment || undefined,
      environment && projectRoot ? projectRoot : undefined
    );
    console.log(JSON.stringify(info, null, 2));
  } else if (action === 'clear') {
    clearSession(
      environment || undefined,
      environment && projectRoot ? projectRoot : undefined
    );
    if (environment && projectRoot) {
      console.log(`OK: session cleared for ${environment} · project ${projectRoot}`);
    } else if (environment) {
      console.log(`OK: all project sessions cleared for ${environment}`);
    } else {
      console.log('OK: all sessions cleared');
    }
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
