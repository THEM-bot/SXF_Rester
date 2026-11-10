#!/usr/bin/env node
/**
 * 会话文件路径解析（供 shell/ps1 与 Agent 脚本调用）
 * Usage:
 *   node tools/lib/resolve-session-path.mjs file <环境> <项目根路径>
 *   node tools/lib/resolve-session-path.mjs slug <项目根路径>
 */
import { projectSlugForRoot, sessionFileForEnvironment } from './demo-tools.mjs';

const [action, ...rest] = process.argv.slice(2);

if (action === 'file') {
  const [environment, projectRoot] = rest;
  if (!environment) {
    console.error('Usage: resolve-session-path.mjs file <环境> [项目根路径]');
    process.exit(1);
  }
  console.log(sessionFileForEnvironment(environment, projectRoot));
} else if (action === 'slug') {
  const [projectRoot] = rest;
  console.log(projectSlugForRoot(projectRoot));
} else {
  console.error('Usage: resolve-session-path.mjs file|slug ...');
  process.exit(1);
}
