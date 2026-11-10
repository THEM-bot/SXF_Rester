/**
 * P-232 / P-234 / P-237 / P-238：官方批量 R01
 * SC-260827-001：经 buildCreateBodyFromParsed 带 generateModeName；生成模式闸不可 force-conflicts
 * SC-260802-005：storyPoint 由 create-body-from-doc 从 parsed 带入
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  PACK_ROOT,
  VERIFY_CJS,
  readSessionFile,
  stringifyFields,
} from './requirement-tools.mjs';

const require = createRequire(import.meta.url);
const { buildCreateBodyFromParsed } = require('../../scripts/lib/create-body-from-doc.cjs');

const LONG_ID_FIELDS = [
  'businessDomainId',
  'projectId',
  'appServiceId',
  'teamId',
  'originalRequirementId',
];
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));

function emitProgress(event) {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

function verifyResponseFile(respPath) {
  const run = spawnSync(process.execPath, [VERIFY_CJS, respPath], { encoding: 'utf8' });
  return run.status === 0;
}

function cleanupArtifacts(artifactDir, keep) {
  if (keep || !artifactDir || !fs.existsSync(artifactDir)) return;
  try {
    fs.rmSync(artifactDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (data.data?.items) return data.data.items;
  throw new Error('manifest 须为数组或含 items 字段的对象');
}

function resolveDefaults(reuseDefaults, cliDefaults) {
  if (cliDefaults) return cliDefaults;
  if (!reuseDefaults) return null;
  const session = readSessionFile();
  const defs = session?.last_create_defaults || {};
  if (!defs.businessDomainId || !defs.projectId || !defs.appServiceId || !defs.requirementLevel) {
    throw new Error('会话无完整 last_create_defaults，无法 --reuse-defaults');
  }
  return defs;
}

function itemBlocked(item, forceConflicts) {
  const warnings = item.warnings || item.parsed?.warnings || [];
  const priorityBlocked = warnings.some((w) => w.type === 'priority-conflict' && w.blocked);
  const generateModeBlocked = warnings.some(
    (w) =>
      w.blocked &&
      (w.type === 'generate-mode-pending' ||
        w.type === 'generate-mode-missing' ||
        w.type === 'generate-mode-ambiguous'),
  );
  // D1/D4：生成模式闸不得被 --force-conflicts 绕过
  if (generateModeBlocked) return true;
  return priorityBlocked && !forceConflicts;
}

/**
 * @param {object} opts
 * @param {Array} opts.items scan-iter / manifest 条目
 * @param {object} opts.defaults 六必填默认
 * @param {Function} opts.createOne async (body) => api result
 * @param {boolean} opts.forceConflicts
 * @param {boolean} opts.keepArtifacts
 */
export async function runBatchCreate({
  items,
  defaults,
  createOne,
  forceConflicts = false,
  keepArtifacts = false,
}) {
  const artifactDir = path.join(os.tmpdir(), `yanxiaotong-batch-${process.pid}`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const creatable = items.filter((item) => item.parsed && item.ok !== false);
  const total = creatable.length;
  const results = [];
  let index = 0;

  for (const item of items) {
    if (!item.parsed || item.ok === false) {
      results.push({
        ok: false,
        inputPath: item.inputPath,
        docPath: item.docPath,
        title: item.parsed?.title || path.basename(item.inputPath || ''),
        error: item.error || '解析失败或未选主文档',
        mode: item.mode,
      });
      continue;
    }

    if (itemBlocked(item, forceConflicts)) {
      const warnings = item.warnings || item.parsed.warnings || [];
      const modeGate = warnings.find(
        (w) =>
          w.type === 'generate-mode-pending' ||
          w.type === 'generate-mode-missing' ||
          w.type === 'generate-mode-ambiguous',
      );
      results.push({
        ok: false,
        skipped: true,
        blocked: true,
        inputPath: item.inputPath,
        docPath: item.docPath,
        title: item.parsed.title,
        error: modeGate
          ? modeGate.message || 'AI-Coding生成模式须确认（不可 --force-conflicts 绕过）'
          : '优先级冲突须用户确认（加 --force-conflicts 可强制创建）',
        warnings,
      });
      continue;
    }

    index += 1;
    const title = item.parsed.title;
    emitProgress({ event: 'progress', index, total, title, docPath: item.docPath });

    try {
      // buildCreateBodyFromParsed：generateModeName + storyPoint（parsed）
      const body = stringifyFields(buildCreateBodyFromParsed(item.parsed, defaults), LONG_ID_FIELDS);
      const bodyPath = path.join(artifactDir, `body-${index}.json`);
      const respPath = path.join(artifactDir, `resp-${index}.json`);
      fs.writeFileSync(bodyPath, JSON.stringify(body), 'utf8');

      const apiResult = await createOne(body);
      fs.writeFileSync(respPath, `${JSON.stringify(apiResult, null, 2)}\n`, 'utf8');
      if (!verifyResponseFile(respPath)) {
        throw new Error(apiResult.message || apiResult.msg || 'verify 失败');
      }
      const data = apiResult.data || {};
      results.push({
        ok: true,
        index,
        inputPath: item.inputPath,
        docPath: item.docPath,
        title,
        category:
          item.parsed.categoryLabel && item.parsed.categoryLabel !== '未指定'
            ? item.parsed.categoryLabel
            : '—',
        priority: body.priority || '中',
        no: data.requirementNo,
        id: String(data.requirementId),
        warnings: item.warnings || item.parsed.warnings || [],
      });
    } catch (e) {
      results.push({
        ok: false,
        index,
        inputPath: item.inputPath,
        docPath: item.docPath,
        title,
        error: e.message || String(e),
        warnings: item.warnings || item.parsed.warnings || [],
      });
    }
  }

  const summary = {
    ok: true,
    total: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
    artifactDir: keepArtifacts ? artifactDir : undefined,
  };

  cleanupArtifacts(artifactDir, keepArtifacts);
  return summary;
}

export { loadManifest };
