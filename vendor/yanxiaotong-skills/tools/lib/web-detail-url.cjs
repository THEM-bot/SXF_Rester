'use strict';

/**
 * 研效通 Web 详情链接（创建成功交付 · 地址 SSOT：tools/lib/env-registry.json）
 * Demo accessUrl 仍走 API 返回；本模块拼装 REQ/OR/TASK/TD/组织待办详情页。
 */

const path = require('node:path');
const fs = require('node:fs');

const ENV_REGISTRY_FILE = path.join(__dirname, 'env-registry.json');
const ENV_FILE = JSON.parse(fs.readFileSync(ENV_REGISTRY_FILE, 'utf8').replace(/^\uFEFF/, ''));
const DEFAULT_ENV_SLUG = ENV_FILE.DEFAULT_ENV_SLUG || 'prod';

/** @type {Readonly<Record<string, string>>} */
const WEB_ORIGIN_BY_SLUG = Object.freeze({
  local: ENV_FILE.envs.local.web_origin,
  uat: ENV_FILE.envs.uat.web_origin,
  prod: ENV_FILE.envs.prod.web_origin,
});

/** @type {Readonly<Record<string, string>>} */
const WEB_ORIGIN_BY_LABEL = Object.freeze({
  本地: WEB_ORIGIN_BY_SLUG.local,
  UAT: WEB_ORIGIN_BY_SLUG.uat,
  生产: WEB_ORIGIN_BY_SLUG.prod,
});

/** @type {Readonly<Record<string, (id: string) => string>>} */
const DETAIL_PATH_BUILDERS = Object.freeze({
  requirement: (id) => `/app/requirements/pool/requirement/${id}`,
  'original-requirement': (id) => `/app/requirements/original/requirement/${id}`,
  task: (id) => `/app/iterations/task/${id}`,
  defect: (id) => `/app/iterations/defect/${id}`,
  'org-todo': (id) => `/app/portfolio/org-todos?id=${encodeURIComponent(id)}`,
  'problem-ticket': (id) => `/app/ops/problem-tickets?id=${encodeURIComponent(id)}`,
});

function resolveEnvSlug(envHint) {
  if (envHint && WEB_ORIGIN_BY_SLUG[envHint]) return envHint;
  if (envHint && WEB_ORIGIN_BY_LABEL[envHint]) {
    const label = envHint;
    if (label === '本地') return 'local';
    if (label === 'UAT') return 'uat';
    if (label === '生产') return 'prod';
  }
  return DEFAULT_ENV_SLUG;
}

function resolveWebOrigin(envHint) {
  const slug = resolveEnvSlug(envHint);
  return WEB_ORIGIN_BY_SLUG[slug];
}

/**
 * @param {{ kind: 'requirement'|'original-requirement'|'task'|'defect'|'org-todo', id: string|number, env?: string }} opts
 * @returns {string} 空串表示无法生成（禁止猜测）
 */
function buildWebDetailUrl(opts) {
  const kind = opts && opts.kind;
  const idRaw = opts && opts.id;
  const builder = DETAIL_PATH_BUILDERS[kind];
  if (!builder) return '';
  if (idRaw == null || idRaw === '') return '';
  const id = String(idRaw).trim();
  if (!id || id === '—' || id === '-') return '';
  const origin = resolveWebOrigin(opts.env).replace(/\/$/, '');
  return `${origin}${builder(encodeURIComponent(id))}`;
}

module.exports = {
  WEB_ORIGIN_BY_SLUG,
  WEB_ORIGIN_BY_LABEL,
  DETAIL_PATH_BUILDERS,
  resolveEnvSlug,
  resolveWebOrigin,
  buildWebDetailUrl,
};
