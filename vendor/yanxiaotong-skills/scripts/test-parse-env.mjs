#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_ENV_SLUG,
  ENV_REGISTRY,
  envSourceSuffix,
  parseEnvFromUserText,
  resolveBaseUrl,
} from '../tools/lib/open-api-token.mjs';
import { extractIntentPrefix } from '../tools/lib/intent-prefix.mjs';

const jsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tools/lib/env-registry.json');
const file = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert.equal(DEFAULT_ENV_SLUG, file.DEFAULT_ENV_SLUG);
assert.equal(ENV_REGISTRY.uat.base_url, file.envs.uat.base_url);
assert.equal(ENV_REGISTRY.prod.base_url, file.envs.prod.base_url);
assert.equal(resolveBaseUrl('UAT'), file.envs.uat.base_url);
assert.equal(ENV_REGISTRY.prod.web_origin, file.envs.prod.web_origin);

const skillRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lookup = spawnSync(
  process.execPath,
  [path.join(skillRoot, 'tools/env-session.mjs'), 'lookup', '--environment', 'UAT', '--field', 'base_url'],
  { encoding: 'utf8' }
);
assert.equal(lookup.status, 0, lookup.stderr);
assert.equal(lookup.stdout.trim(), file.envs.uat.base_url);

assert.equal(extractIntentPrefix('uat环境 创建需求\n标题: x\n内容: 本地目录').trim(), 'uat环境 创建需求');

assert.equal(parseEnvFromUserText('本地 demo 上传')?.env_slug, 'local');
assert.equal(parseEnvFromUserText('uat环境 创建需求')?.env_slug, 'uat');
assert.equal(parseEnvFromUserText('生产 查需求')?.env_slug, 'prod');

// 前缀 uat，正文「本地」不得覆盖
const storyPaste = [
  'uat环境 创建需求',
  '标题: IDE 内技能同步更新',
  '内容: 更新到 IDE 本地目录；关联缺陷 无',
].join('\n');
assert.equal(parseEnvFromUserText(storyPaste)?.env_slug, 'uat');

// 前缀无环境词、仅正文含「本地」→ null（交给 default 生产）
const bodyOnlyLocal = ['创建需求', '标题: x', '内容: 本地目录保持一致'].join('\n');
assert.equal(parseEnvFromUserText(bodyOnlyLocal), null);

// 前缀内多环境词：最早出现胜出
assert.equal(parseEnvFromUserText('uat环境 再切本地')?.env_slug, 'uat');
assert.equal(parseEnvFromUserText('本地 再切 uat')?.env_slug, 'local');

assert.equal(envSourceSuffix('user_text'), '（您本次指定）');
assert.equal(envSourceSuffix('default'), '（默认生产）');
assert.equal(envSourceSuffix('session'), '（默认生产）');

console.log('test-parse-env: all passed');
