'use strict';

const fs = require('fs');
const path = require('path');
const { REQUIREMENT_CATEGORY_LABELS } = require('./display-humanize.cjs');

const EXCLUDE_MD = new Set(['readme.md', '待办清单.md']);

/** P1/P2/中文档位 → API 中文 priority */
function mapPriority(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^P1$|^最高$/i.test(s)) return '最高';
  if (/^P2$|^高$/i.test(s)) return '高';
  if (/^P3$|^中$/i.test(s)) return '中';
  if (/^P4$|^低$/i.test(s)) return '低';
  if (['最高', '高', '中', '低'].includes(s)) return s;
  return null;
}

function mapRequirementType(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (['L1', 'L2', 'L3'].includes(s)) return s;
  return null;
}

/** P-225：header > 属性表 > 正文；冲突时标记 priorityConflict */
function parsePriorityFromDoc(text) {
  const candidates = [];
  const header = text.match(/\*\*优先级\*\*:\s*(.+)/)?.[1]?.trim();
  if (header) candidates.push({ source: 'header', raw: header, mapped: mapPriority(header) });

  const table = text.match(/\|\s*优先级\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  if (table) candidates.push({ source: 'table', raw: table, mapped: mapPriority(table) });

  const body = text.match(/(?:^|\s)优先级[:：]\s*(P[1-4]|最高|高|中|低)/m)?.[1]?.trim();
  if (body) candidates.push({ source: 'body', raw: body, mapped: mapPriority(body) });

  const order = ['header', 'table', 'body'];
  const primary =
    order.map((src) => candidates.find((c) => c.source === src && c.mapped)).find(Boolean) ||
    order.map((src) => candidates.find((c) => c.source === src)).find(Boolean);

  const mappedValues = [...new Set(candidates.map((c) => c.mapped).filter(Boolean))];
  const priorityConflict = mappedValues.length > 1;
  const priority = primary?.mapped || '中';

  return { priority, priorityConflict, candidates };
}

function parseRequirementTypeFromDoc(text) {
  const table = text.match(/\|\s*需求分类\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  const inline = text.match(/\*\*需求分类\*\*:\s*(L[1-3])/i)?.[1]?.trim();
  return mapRequirementType(inline || table);
}

/** 实现方式：AI-Coding / 传统开发 → API 枚举 */
function mapImplementationType(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^AI[-_]?Coding$/i.test(s) || s === 'AI_CODING' || /AI\s*编码/i.test(s)) return 'AI_CODING';
  if (/传统/.test(s) || /^TRADITIONAL$/i.test(s)) return 'TRADITIONAL';
  return null;
}

function parseImplementationTypeFromDoc(text) {
  const table = text.match(/\|\s*实现方式\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  const inline = text.match(/\*\*实现方式\*\*:\s*(.+)/)?.[1]?.trim();
  // 故事卡属性列表：- 实现方式：AI-Coding
  const list = text.match(/(?:^|\n)\s*[-*]\s*实现方式\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
  const body = text.match(/(?:^|\n)\s*实现方式\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
  return mapImplementationType(table || inline || list || body);
}

/**
 * AI-Coding生成模式（文档属性真源 · SC-260827-001）
 * status: hit | pending | missing
 * （与已发布 list 的 ambiguous 在确认表阶段判定）
 * 兼容：属性表 / **加粗** / 故事卡列表「生成模式」或「AI-Coding生成模式」
 */
function parseGenerateModeFromDoc(text) {
  const tableAi = text.match(/\|\s*AI-Coding\s*生成模式\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  const tableShort = text.match(/\|\s*生成模式\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  const inlineAi = text.match(/\*\*AI-Coding\s*生成模式\*\*:\s*(.+)/i)?.[1]?.trim();
  const inlineShort = text.match(/\*\*生成模式\*\*:\s*(.+)/i)?.[1]?.trim();
  // 故事卡属性列表：- 生成模式：S2：改动/小需求
  const listAi = text.match(/(?:^|\n)\s*[-*]\s*AI-Coding\s*生成模式\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const listShort = text.match(/(?:^|\n)\s*[-*]\s*生成模式\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
  const bodyAi = text.match(/(?:^|\n)\s*AI-Coding\s*生成模式\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const bodyShort = text.match(/(?:^|\n)\s*生成模式\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
  const raw = (
    tableAi ||
    tableShort ||
    inlineAi ||
    inlineShort ||
    listAi ||
    listShort ||
    bodyAi ||
    bodyShort ||
    ''
  ).trim();
  if (!raw) {
    return { generateModeName: null, generateModeStatus: 'missing', generateModeRaw: null };
  }
  if (/^\[待确认\]$|^待确认$/i.test(raw)) {
    return { generateModeName: null, generateModeStatus: 'pending', generateModeRaw: raw };
  }
  return { generateModeName: raw, generateModeStatus: 'hit', generateModeRaw: raw };
}

/**
 * SC-260802-005：故事点初始值
 * 属性表「故事点 | N SP」或等价写法 → 非负整数（1 SP = 1 天）
 * 含小数时向上取整并标记 ceiled；失败不阻断
 * @returns {{ storyPoint: number, rawNumber: number, ceiled: boolean } | null}
 */
function extractStoryPointNumber(raw) {
  if (raw == null || raw === '') return null;
  const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(?:SP|sp)?$/i);
  if (!m) return null;
  const rawNumber = Number(m[1]);
  if (!Number.isFinite(rawNumber) || rawNumber < 0) return null;
  const storyPoint = Math.ceil(rawNumber);
  if (!Number.isInteger(storyPoint)) return null;
  const ceiled = !Number.isInteger(rawNumber);
  return { storyPoint, rawNumber, ceiled };
}

function parseStoryPointFromDoc(text) {
  const candidates = [];
  const table = text.match(/\|\s*故事点\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  if (table) candidates.push({ source: 'table', raw: table });
  const header = text.match(/\*\*故事点\*\*:\s*(.+)/)?.[1]?.trim();
  if (header) candidates.push({ source: 'header', raw: header });
  const body = text.match(/(?:^|\s)故事点[:：]\s*([^\n|]+)/m)?.[1]?.trim();
  if (body) candidates.push({ source: 'body', raw: body });

  for (const c of candidates) {
    const extracted = extractStoryPointNumber(c.raw);
    if (extracted != null) {
      return {
        storyPoint: extracted.storyPoint,
        storyPointSource: '故事卡',
        storyPointRaw: c.raw,
        storyPointFieldSource: c.source,
        storyPointRawNumber: extracted.rawNumber,
        storyPointCeiled: extracted.ceiled,
        missing: false,
      };
    }
  }
  return {
    storyPoint: null,
    storyPointSource: null,
    storyPointRaw: null,
    storyPointFieldSource: null,
    storyPointRawNumber: null,
    storyPointCeiled: false,
    missing: true,
  };
}

/** P-235 / P-236 / SC-260827-001：文档风险预警 */
function parseWarningsFromDoc(
  text,
  {
    priorityConflict,
    priorityCandidates,
    storyPointMissing,
    storyPointCeiledInfo,
    generateModeStatus,
    implementationType,
  } = {},
) {
  const warnings = [];
  const statusHeader = text.match(/\*\*状态\*\*:\s*(.+)/)?.[1]?.trim();
  if (statusHeader && /作废/.test(statusHeader)) {
    warnings.push({ type: 'status-cancelled', message: '文档状态为作废', raw: statusHeader });
  }
  const statusTable = text.match(/\|\s*状态\s*\|\s*([^|\n]+?)\s*\|/i)?.[1]?.trim();
  if (statusTable && /作废/.test(statusTable)) {
    warnings.push({ type: 'status-cancelled', message: '属性表状态为作废', raw: statusTable });
  }
  if (priorityConflict) {
    warnings.push({
      type: 'priority-conflict',
      message: '优先级多来源冲突，须用户确认后再创建',
      candidates: priorityCandidates || [],
      blocked: true,
    });
  }
  if (storyPointMissing) {
    warnings.push({
      type: 'story-point-missing',
      message: '未解析到故事点',
      blocked: false,
    });
  }
  if (storyPointCeiledInfo) {
    const { rawNumber, storyPoint, raw } = storyPointCeiledInfo;
    warnings.push({
      type: 'story-point-ceiled',
      message: `故事点原文 ${rawNumber} 已向上取整为 ${storyPoint}（1 SP = 1 天，仅接受整数）`,
      raw: raw || String(rawNumber),
      rawNumber,
      storyPoint,
      blocked: false,
    });
  }
  const impl = implementationType || 'AI_CODING';
  if (impl !== 'TRADITIONAL') {
    if (generateModeStatus === 'pending') {
      warnings.push({
        type: 'generate-mode-pending',
        message: 'AI-Coding生成模式为[待确认]，须在确认表选定已发布模式后再创建',
        blocked: true,
      });
    } else if (generateModeStatus === 'missing') {
      warnings.push({
        type: 'generate-mode-missing',
        message: '文档缺少 AI-Coding生成模式，须在确认表选定已发布模式后再创建',
        blocked: true,
      });
    } else if (generateModeStatus === 'ambiguous') {
      warnings.push({
        type: 'generate-mode-ambiguous',
        message: 'AI-Coding生成模式无法唯一匹配已发布列表，须点选后再创建',
        blocked: true,
      });
    }
  }
  return warnings;
}

function listRootMarkdownFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith('.md')) return false;
      const lower = f.toLowerCase();
      if (EXCLUDE_MD.has(lower)) return false;
      if (/^待办/.test(f)) return false;
      if (/^执行步骤/.test(f)) return false;
      return fs.statSync(path.join(dir, f)).isFile();
    })
    .map((f) => path.join(dir, f));
}

function parseTitleFromDoc(text, fallback) {
  return (text.match(/^#\s+(.+)$/m) || ['', fallback || ''])[1].trim();
}

/** P-226：目录 @ → 主文档选取 */
function resolveDocPath(inputPath) {
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: '路径不存在', path: abs };
  }
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    return { ok: true, path: abs, source: 'file' };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: '非文件或目录', path: abs };
  }

  const dirName = path.basename(abs);
  const preferred = path.join(abs, `${dirName}.md`);
  if (fs.existsSync(preferred)) {
    return { ok: true, path: preferred, source: 'dir-name-md' };
  }

  const rootMds = listRootMarkdownFiles(abs);

  if (rootMds.length === 1) {
    return { ok: true, path: rootMds[0], source: 'single-root-md' };
  }
  if (rootMds.length === 0) {
    return { ok: false, error: '目录下未找到可用 .md', path: abs, needPick: true };
  }
  return {
    ok: false,
    error: '目录下有多篇 .md，须用户点选',
    path: abs,
    needPick: true,
    candidates: rootMds.map((p) => ({ path: p, name: path.basename(p) })),
  };
}

function parseRequirementDoc(inputPath) {
  const resolved = resolveDocPath(inputPath);
  if (!resolved.ok) return { ...resolved, parsed: null };

  const text = fs.readFileSync(resolved.path, 'utf8');
  const title = parseTitleFromDoc(text, path.basename(resolved.path, '.md'));
  const { priority, priorityConflict, candidates } = parsePriorityFromDoc(text);
  const requirementType = parseRequirementTypeFromDoc(text);
  const implementationType = parseImplementationTypeFromDoc(text);
  const { generateModeName, generateModeStatus, generateModeRaw } = parseGenerateModeFromDoc(text);
  const categoryLabel = requirementType
    ? REQUIREMENT_CATEGORY_LABELS[requirementType] || requirementType
    : '未指定';
  const storyPointInfo = parseStoryPointFromDoc(text);

  const warnings = parseWarningsFromDoc(text, {
    priorityConflict,
    priorityCandidates: candidates,
    storyPointMissing: storyPointInfo.missing,
    storyPointCeiledInfo: storyPointInfo.storyPointCeiled
      ? {
          rawNumber: storyPointInfo.storyPointRawNumber,
          storyPoint: storyPointInfo.storyPoint,
          raw: storyPointInfo.storyPointRaw,
        }
      : null,
    generateModeStatus,
    implementationType: implementationType || 'AI_CODING',
  });

  return {
    ok: true,
    docPath: resolved.path,
    source: resolved.source,
    parsed: {
      title,
      description: text,
      priority,
      priorityConflict,
      priorityCandidates: candidates,
      requirementType: requirementType || '',
      categoryLabel,
      implementationType: implementationType || null,
      generateModeName,
      generateModeStatus,
      generateModeRaw,
      generateModeSource: generateModeName || generateModeRaw ? 'document' : null,
      storyPoint: storyPointInfo.storyPoint,
      storyPointSource: storyPointInfo.storyPointSource,
      storyPointRaw: storyPointInfo.storyPointRaw,
      storyPointRawNumber: storyPointInfo.storyPointRawNumber,
      storyPointCeiled: storyPointInfo.storyPointCeiled,
      warnings,
    },
    warnings,
  };
}

/** P-231：单 REQ 目录扫描；strategy=auto-req-md 时优先拆 REQ-*.md */
function scanReqFolder(dirPath, strategy = 'auto-req-md') {
  const abs = path.resolve(dirPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return [{ inputPath: abs, mode: 'error', error: '非目录或不存在' }];
  }

  if (strategy === 'auto-req-md') {
    const reqMds = listRootMarkdownFiles(abs).filter((p) => /^REQ-.*\.md$/i.test(path.basename(p)));
    if (reqMds.length > 0) {
      return reqMds.map((docPath) => {
        const doc = parseRequirementDoc(docPath);
        return {
          inputPath: abs,
          docPath,
          mode: reqMds.length > 1 ? 'multi-split' : 'single',
          ok: doc.ok,
          parsed: doc.parsed,
          warnings: doc.warnings || doc.parsed?.warnings || [],
          error: doc.error,
        };
      });
    }
  }

  const doc = parseRequirementDoc(abs);
  if (doc.ok) {
    return [
      {
        inputPath: abs,
        docPath: doc.docPath,
        mode: 'single',
        ok: true,
        parsed: doc.parsed,
        warnings: doc.warnings || doc.parsed?.warnings || [],
      },
    ];
  }
  return [
    {
      inputPath: abs,
      mode: doc.needPick ? 'needs-pick' : 'error',
      ok: false,
      error: doc.error,
      candidates: doc.candidates,
    },
  ];
}

/** P-230 / P-231：迭代目录下所有 REQ-* 扫描 */
function scanIterationDirectory(iterPath, { strategy = 'auto-req-md' } = {}) {
  const abs = path.resolve(iterPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: '路径不存在', path: abs };
  }
  if (!fs.statSync(abs).isDirectory()) {
    return { ok: false, error: '非目录', path: abs };
  }

  const reqDirs = fs
    .readdirSync(abs)
    .filter((name) => name.startsWith('REQ-'))
    .map((name) => path.join(abs, name))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())
    .sort();

  const items = [];
  for (const dir of reqDirs) {
    items.push(...scanReqFolder(dir, strategy));
  }

  const titleMap = new Map();
  for (const item of items) {
    const title = item.parsed?.title;
    if (!title) continue;
    if (!titleMap.has(title)) titleMap.set(title, []);
    titleMap.get(title).push(item.docPath || item.inputPath);
  }

  const batchWarnings = [];
  for (const [title, paths] of titleMap) {
    if (paths.length > 1) {
      batchWarnings.push({ type: 'duplicate-title', title, paths });
    }
  }

  return {
    ok: true,
    iterationPath: abs,
    strategy,
    folders: reqDirs.length,
    items,
    batchWarnings,
    total: items.filter((i) => i.ok !== false && i.mode !== 'needs-pick' && i.mode !== 'error').length,
    creatable: items.filter(
      (i) => i.ok !== false && i.parsed && !(i.warnings || []).some((w) => w.blocked),
    ).length,
  };
}

module.exports = {
  mapPriority,
  mapRequirementType,
  mapImplementationType,
  parsePriorityFromDoc,
  parseRequirementTypeFromDoc,
  parseImplementationTypeFromDoc,
  parseGenerateModeFromDoc,
  extractStoryPointNumber,
  parseStoryPointFromDoc,
  parseTitleFromDoc,
  parseWarningsFromDoc,
  listRootMarkdownFiles,
  resolveDocPath,
  parseRequirementDoc,
  scanReqFolder,
  scanIterationDirectory,
  EXCLUDE_MD,
};
