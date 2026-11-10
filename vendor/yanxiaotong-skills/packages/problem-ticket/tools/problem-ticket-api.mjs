#!/usr/bin/env node
/**
 * 问题单开放 API CLI（P-META · P01）
 * SSOT：reference/open-api-contract.md
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  assertDescriptionIsAgentSummary,
  httpJson,
  newIdempotencyKey,
  normalizeDescriptionHtml,
  parseCli,
  publicEnvLabel,
  readJsonArg,
  resolveOutPath,
  resolveToken,
  validateIdempotencyKey,
  writeSessionPatch,
  VERIFY_CJS,
} from './lib/problem-ticket-tools.mjs';

const require = createRequire(import.meta.url);
const { formatCreateText, formatMetadataText, formatPrepareConfirmText } = require('../scripts/lib/display-humanize.cjs');

const args = parseCli(process.argv.slice(2));
const cmd = String(args._[0] || '');
const token = args.token || resolveToken({ environment: publicEnvLabel() });

async function main() {
  if (args.help || !cmd) {
    console.log(`Usage:
  problem-ticket-api.mjs metadata [--human] [--out file.json]
  problem-ticket-api.mjs prepare --json body.json --out prepared.json [--human]
  problem-ticket-api.mjs create --json body.json [--idempotency-key KEY] [--human] [--out file.json]
  problem-ticket-api.mjs resolve-token-user [--human] [--out user.json]`);
    process.exit(0);
  }
  if (!token) {
    console.error('No token: save with parent tools/token-store.mjs write');
    process.exit(1);
  }

  if (cmd === 'metadata') {
    const result = await httpJson('GET', '/api/open/problem-tickets/metadata', { token });
    writeSessionPatch({ last_metadata: { version: result.data?.version || '', fetched_at: new Date().toISOString() } });
    emit(result, args, formatMetadataText);
    return;
  }

  if (cmd === 'resolve-token-user') {
    const user = await resolveTokenUser(token);
    const payload = { success: true, code: 200, data: user };
    emit(payload, args, (d) => `令牌用户：${d.name || ''}${d.employeeId || ''}`);
    return;
  }

  if (cmd === 'prepare') {
    const body = await normalizeCreateBody(readJsonArg(args.json), token);
    const outPath = resolveOutPath(args);
    if (!outPath) {
      throw new Error('prepare 须指定 --out prepared.json（确认后用同一文件 create）');
    }
    fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    console.error(`OK: wrote ${outPath}`);
    if (args.human) {
      console.log(formatPrepareConfirmText(body, publicEnvLabel()));
    } else {
      console.log(JSON.stringify(body, null, 2));
    }
    return;
  }

  if (cmd === 'create') {
    const body = await normalizeCreateBody(readJsonArg(args.json), token);
    const key = validateIdempotencyKey(args['idempotency-key'] || newIdempotencyKey());
    const result = await httpJson('POST', '/api/open/problem-tickets', {
      token,
      body,
      headers: { 'Idempotency-Key': key },
    });
    writeSessionPatch({
      last_problem: {
        id: result.data?.id || '',
        problemNo: result.data?.problemNo || '',
        shareUrl: result.data?.shareUrl || '',
        idempotencyKey: key,
      },
    });
    emit(result, args, formatCreateText);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

async function normalizeCreateBody(raw, tok) {
  const normalized = await applyCreateDefaults(raw, tok);
  const desc = normalized.description || normalized.businessImpact || '';
  assertDescriptionIsAgentSummary(desc, normalized.title || '');
  normalized.description = normalizeDescriptionHtml(desc);
  if (normalized.businessImpact != null) {
    normalized.businessImpact = normalized.description;
  }
  return normalized;
}

function optionNameById(list, id) {
  if (id == null || id === '') return '';
  const hit = (list || []).find((x) => String(x.id) === String(id));
  return hit?.name ? String(hit.name) : '';
}

function tokenUserDisplay(user) {
  return `${user.name || ''}${user.employeeId || ''}`.trim();
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function envDefaultSecondLineLabels(meta) {
  const defaults = meta?.defaults || {};
  const apps = meta?.appServices || [];
  const app =
    apps.find((a) => String(a.id) === String(defaults.appServiceId)) ||
    apps.find((a) => a.enabled !== false) ||
    apps[0] ||
    {};
  const follower = app.defaultSecondLineFollower || {};
  const emp = String(defaults.secondLineFollowerEmployeeId || follower.employeeId || '').trim();
  const name = String(follower.name || '').trim();
  const userId = follower.userId != null ? String(follower.userId).trim() : '';
  const labels = new Set();
  if (emp) labels.add(emp);
  if (name) labels.add(name);
  if (userId) labels.add(userId);
  if (name && emp) {
    labels.add(`${name}${emp}`);
    labels.add(`${name} ${emp}`);
  }
  return { emp, name, userId, labels };
}

/** 空，或等于环境默认二线（含姓名/工号/userId）→ 视为未指定，改用令牌用户。 */
function needsTokenUserPerson(value, envLabels) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (envLabels.labels.has(v)) return true;
  if (envLabels.emp && (v === envLabels.emp || v.endsWith(envLabels.emp))) return true;
  if (envLabels.userId && v === envLabels.userId) return true;
  if (envLabels.name && (v === envLabels.name || v.startsWith(envLabels.name))) return true;
  return false;
}

/** 人员 → tokenUser；类型/特性组/领域/应用未传 → metadata.defaults（确认表不再出现 —）。 */
async function applyCreateDefaults(body, token) {
  const next = { ...(body || {}) };
  const { user, meta } = await resolveTokenUserDetailed(token);
  const envLabels = envDefaultSecondLineLabels(meta);
  const defaults = meta.defaults || {};
  const needSubmitter =
    needsTokenUserPerson(next.submitterName, envLabels) &&
    needsTokenUserPerson(next.submitterEmployeeId, envLabels);
  const needHandler =
    needsTokenUserPerson(next.handler, envLabels) && needsTokenUserPerson(next.handlerId, envLabels);
  const label = tokenUserDisplay(user);
  if (!label) {
    throw new Error('令牌用户姓名/工号为空，无法补默认人员');
  }
  if (needSubmitter) {
    next.submitterName = label;
    next.submitterEmployeeId = user.employeeId;
  }
  // 二线：默认始终令牌用户（覆盖环境默认二线及 Agent 误填）；仅当已是令牌用户本人时保留
  const secondLineAlreadyToken =
    String(next.secondLineFollower || '').replace(/\s/g, '') === label.replace(/\s/g, '') ||
    String(next.secondLineFollowerId || '') === String(user.userId || '') ||
    String(next.secondLineFollower || '').endsWith(String(user.employeeId || ''));
  if (!secondLineAlreadyToken) {
    next.secondLineFollower = label;
    delete next.caretaker;
    delete next.secondLineFollowerId;
  }
  if (needHandler) {
    next.handler = label;
    delete next.handlerId;
  }

  if (!hasText(next.problemType) && !hasText(next.problemTypeId)) {
    next.problemTypeId = defaults.problemTypeId || 'online_defect';
    next.problemType =
      optionNameById(meta.problemTypes, next.problemTypeId) || '线上缺陷';
  } else if (hasText(next.problemTypeId) && !hasText(next.problemType)) {
    next.problemType = optionNameById(meta.problemTypes, next.problemTypeId);
  }

  if (!hasText(next.featureTeam) && !hasText(next.featureTeamId)) {
    if (hasText(defaults.featureTeamId)) {
      next.featureTeamId = String(defaults.featureTeamId);
      next.featureTeam = optionNameById(meta.featureTeams, defaults.featureTeamId);
    }
  } else if (hasText(next.featureTeamId) && !hasText(next.featureTeam)) {
    next.featureTeam = optionNameById(meta.featureTeams, next.featureTeamId);
  }

  if (!hasText(next.businessDomain) && !hasText(next.businessDomainId)) {
    if (hasText(defaults.businessDomainId)) {
      next.businessDomainId = String(defaults.businessDomainId);
      next.businessDomain = optionNameById(meta.businessDomains, defaults.businessDomainId);
    }
  } else if (hasText(next.businessDomainId) && !hasText(next.businessDomain)) {
    next.businessDomain = optionNameById(meta.businessDomains, next.businessDomainId);
  }

  if (
    !hasText(next.appOrService) &&
    !hasText(next.appServiceName) &&
    !hasText(next.appServiceId)
  ) {
    if (hasText(defaults.appServiceId)) {
      next.appServiceId = String(defaults.appServiceId);
      next.appOrService = optionNameById(meta.appServices, defaults.appServiceId);
    }
  } else if (hasText(next.appServiceId) && !hasText(next.appOrService) && !hasText(next.appServiceName)) {
    next.appOrService = optionNameById(meta.appServices, next.appServiceId);
  }

  return next;
}

async function resolveTokenUserDetailed(token) {
  const metaRes = await httpJson('GET', '/api/open/problem-tickets/metadata', { token });
  const meta = metaRes.data || {};
  const pick = meta.tokenUser || {};
  if (!pick.employeeId) {
    throw new Error(
      '元数据未返回令牌绑定用户（data.tokenUser）。请确认服务端已支持该字段，或显式提供 submitterName / submitterEmployeeId',
    );
  }
  const user = {
    employeeId: String(pick.employeeId),
    name: pick.name || '',
    userId: pick.userId != null ? String(pick.userId) : '',
    source: 'problem_metadata_token_user',
  };
  writeSessionPatch({ token_user: user });
  return { user, meta };
}

async function resolveTokenUser(token) {
  const { user } = await resolveTokenUserDetailed(token);
  return user;
}

function emit(result, args, humanFn) {
  const outPath = resolveOutPath(args);
  if (outPath) {
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.error(`OK: wrote ${outPath}`);
  }
  if (args.human) {
    console.log(humanFn(result.data || {}));
  } else if (!outPath) {
    console.log(JSON.stringify(result, null, 2));
  }
  if (outPath) {
    try {
      execFileSync(process.execPath, [VERIFY_CJS, outPath], { stdio: 'inherit' });
    } catch {
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e?.payload ? JSON.stringify(e.payload, null, 2) : String(e?.message || e));
  process.exit(1);
});
