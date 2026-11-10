/**
 * 解析用户句 → 创建 intent（v0.7）
 * SSOT：reference/create-defaults.md
 */

export const DEFAULT_PHASE = '开发阶段';
export const DEFAULT_CATEGORY = '开发编码';
export const DEFAULT_ESTIMATED_HOURS = 1;
export const MAX_CREATE_COUNT = 10;

import {
  TRACK_CONTENT_REFINE,
  isContentRefineCandidate,
} from './content-refine.mjs';
import { normalizePlatformTitledLinks } from '../../../../tools/lib/platform-titled-link.mjs';

export const TRACK_USER_INPUT = 'user_input';
export const TRACK_REQ_ANALYZE = 'req_analyze';
export { TRACK_CONTENT_REFINE };

/** P-410：仅需求引用、待选手动/自动 */
export const NEED_CREATE_MODE = 'NEED_CREATE_MODE';
export const NEED_CREATE_MODE_ERROR =
  '已识别所属需求，请先选择创建方式：1 手动创建 · 2 自动创建（见 T-CREATE-MODE-ASK）';

const AUTO_CREATE_CUE_RE =
  /自动创建(?:任务)?|分析创建(?:任务)?|按需求拆分|需求分析创建|智能拆分|按需求分析/;
const FORCE_TRACK_ALLOWED = new Set([TRACK_USER_INPUT, TRACK_REQ_ANALYZE, TRACK_CONTENT_REFINE]);

const SEGMENT_SPLIT = /[，,、；;]+/;
const FILLER_WORDS = [
  '今天',
  '本周',
  '今天的任务是',
  '今天的任务',
  '的任务是',
  '任务是',
  '做',
  '主要完成',
  '主要做',
  '要完成',
  '计划',
  '打算',
];

function stripSegmentFiller(segment) {
  let s = String(segment || '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of FILLER_WORDS) {
      if (s.startsWith(w)) {
        s = s.slice(w.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

function beautifySegmentText(segment) {
  let s = stripSegmentFiller(String(segment || '').trim());
  if (!s || s === '在') return '';
  if (/和/.test(s) && !SEGMENT_SPLIT.test(s)) {
    const parts = s.split(/和+/).map((x) => stripSegmentFiller(x.trim())).filter(Boolean);
    if (parts.length >= 2) return parts.join('，');
  }
  return s;
}

/**
 * 用户输入轨：去掉「今天」「主要完成」等口语填充，规范标点（v0.7.1）
 */
export function beautifyUserDescription(text) {
  const normalized = normalizeUserText(text);
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const hasLineNumbered = lines.some((l) => /^\s*\d+\.\s/.test(l));
  if (hasLineNumbered) {
    const out = [];
    for (const line of lines) {
      const m = line.match(/^(\s*\d+\.\s*)(.+)$/);
      if (m) {
        const body = beautifySegmentText(m[2]);
        if (body) out.push(`${m[1].trim()}${body}`);
      } else if (line.trim()) {
        const body = beautifySegmentText(line);
        if (body) out.push(body);
      }
    }
    return out.join('\n');
  }

  if (/\d+\.\s/.test(normalized)) {
    const parts = normalized.split(/(?=\d+\.\s)/).filter((p) => p.trim());
    if (parts.length >= 2) {
      return parts
        .map((p) => {
          const m = p.match(/^(\d+\.\s*)([\s\S]+)$/);
          if (m) return `${m[1].trim()}${beautifySegmentText(m[2])}`;
          return beautifySegmentText(p);
        })
        .filter(Boolean)
        .join('\n');
    }
  }

  const segments = normalized.split(SEGMENT_SPLIT).map((s) => beautifySegmentText(s)).filter(Boolean);
  if (segments.length === 0) return beautifySegmentText(normalized);
  if (segments.length === 1) return segments[0];
  return segments.join('，');
}

/** 用户输入轨：规范化空白（保留换行） */
export function normalizeUserText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML → 纯文本（需求分析轨用） */
export function stripHtmlToPlain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REQ_SUMMARY_MAX = 500;

export function extractRequirementKeyPoints(reqDescription, reqTitle = '') {
  const plain = stripHtmlToPlain(reqDescription);
  if (!plain) return reqTitle || '';

  const sentences = plain
    .split(/[。！？.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);

  let summary = '';
  if (sentences.length >= 2) {
    summary = `${sentences[0]}。${sentences[1]}。`;
  } else if (sentences.length === 1) {
    summary = sentences[0].endsWith('。') ? sentences[0] : `${sentences[0]}。`;
  } else {
    summary = plain.slice(0, REQ_SUMMARY_MAX);
  }

  if (summary.length > REQ_SUMMARY_MAX) {
    summary = `${summary.slice(0, REQ_SUMMARY_MAX)}…`;
  }
  return summary;
}

export function extractBusinessOverviewSummary(reqDescription, reqTitle = '') {
  const plain = stripHtmlToPlain(reqDescription);
  if (!plain) return '';

  const section = plain.match(/业务对象概述\s*(.+?)(?=\s*\d+\.\s|CRUD|元数据|接口功能|后端文档|$)/);
  if (section) {
    let s = section[1].trim();
    if (s.length > REQ_SUMMARY_MAX) s = `${s.slice(0, REQ_SUMMARY_MAX)}…`;
    return s;
  }

  return extractRequirementKeyPoints(reqDescription, reqTitle);
}

/**
 * @deprecated v0.7 用户输入轨不再使用；仅保留供历史测试引用
 */
export function generateTaskDescription(
  reqDescription,
  userDescription,
  parseMeta = {},
  reqTitle = '',
  taskTitle = '',
) {
  const userPart = String(userDescription || '').trim();
  if (userPart && parseMeta.description_source && parseMeta.description_source !== 'inherit') {
    return { text: beautifyUserDescription(userPart), generated: false };
  }
  if (userPart) return { text: userPart, generated: false };
  return { text: reqDescription || '', generated: false };
}

/** @deprecated */
export function mergeTaskDescription(reqDescription, userDescription, parseMeta = {}, reqTitle = '') {
  return generateTaskDescription(reqDescription, userDescription, parseMeta, reqTitle);
}

export function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isFullCreateMode(text) {
  return /完整创建|自定义阶段|逐步创建/.test(String(text || ''));
}

/**
 * handoff / T-OP-TYPE-ASK 菜单纯序号（1 创建 · 2 查询 · 3 修改 · 4 取消）
 * 禁止当作创建内容句进入 prepare-create
 */
export function isMenuChoiceOnly(text) {
  return /^\s*[1-4]\s*$/.test(String(text || ''));
}

export const MENU_CHOICE_ONLY_ERROR =
  '当前输入为菜单序号，不是创建内容；请提供需求链接、REQ 编号或任务说明';

export function hasQuickCreateTrigger(text) {
  const t = normalizePlatformTitledLinks(String(text || ''));
  return /\/(?:pool\/)?requirement\/\d+/i.test(t) && /新建|创建任务|创建/.test(t);
}

export function parseRequirementRef(text) {
  const t = normalizePlatformTitledLinks(String(text || ''));
  const urlMatch = t.match(/\/(?:pool\/)?requirement\/(\d+)/i);
  if (urlMatch) return { requirementId: urlMatch[1], source: 'url' };

  const reqNo = t.match(/REQ-\d{8}-\d+/i);
  if (reqNo) return { requirementNo: reqNo[0], source: 'req_no' };

  if (/沿用需求|当前需求/.test(t)) return { useSession: true, source: 'session' };

  const idCtx = t.match(/(?:需求|requirement)[^\d]{0,24}(\d{3,})/i);
  if (idCtx) return { requirementId: idCtx[1], source: 'context_id' };

  return null;
}

/** 是否已具备可解析的所属需求引用（可进入 prepare-create） */
export function hasCreatableRequirementRef(text, sessionDefaults = null) {
  if (isMenuChoiceOnly(text)) return false;
  const ref = parseRequirementRef(text);
  if (!ref) return false;
  if (ref.useSession) {
    return !!(sessionDefaults?.requirementId || sessionDefaults?.requirementNo);
  }
  return !!(ref.requirementId || ref.requirementNo);
}

/** 口令：跳过双选直进需求分析轨（P-410） */
export function hasAutoCreateCue(text) {
  return AUTO_CREATE_CUE_RE.test(String(text || ''));
}

/**
 * T-CREATE-MODE-ASK 菜单纯序号（1 手动 · 2 自动）
 * 禁止当作创建内容句进入 prepare-create
 */
export function isCreateModeChoiceOnly(text) {
  return /^\s*[12]\s*$/.test(String(text || ''));
}

export const CREATE_MODE_CHOICE_ONLY_ERROR =
  '当前输入为创建方式序号，不是任务内容；请按所选方式提供标题/内容或使用 --force-track';

/**
 * 仅需求引用、无任务 NL、无自动创建口令 → 须先 T-CREATE-MODE-ASK（P-410）
 */
export function isRequirementRefOnly(text, sessionDefaults = null) {
  const raw = String(text || '').trim();
  if (!raw || isMenuChoiceOnly(raw) || isCreateModeChoiceOnly(raw)) return false;
  if (!hasCreatableRequirementRef(raw, sessionDefaults)) return false;
  if (hasAutoCreateCue(raw)) return false;
  if (isFullCreateMode(raw)) return false;

  const { title, description, meta, sourceContent } = parseTitleDescription(raw);
  if (
    isContentRefineCandidate({
      raw,
      sourceContent: sourceContent ?? meta.nl_remainder ?? description,
      parseMeta: meta,
    })
  ) {
    return false;
  }
  return !hasUserTaskInput(meta, title, description);
}

/**
 * 提取「任务内容如下」+ === 块或多行列表
 */
export function extractDescriptionBlock(text) {
  const t = String(text || '');

  const closedBlock = t.match(/任务内容如下\s*[=＝]{2,}\s*([\s\S]*?)\s*[=＝]{2,}/iu);
  if (closedBlock) return normalizeUserText(closedBlock[1]);

  const openBlock = t.match(/任务内容如下\s*[=＝]{2,}\s*([\s\S]+)$/iu);
  if (openBlock) return normalizeUserText(openBlock[1].replace(/\s*[=＝]{2,}\s*$/u, ''));

  const tailList = t.match(/任务内容如下\s*[:：]?\s*([\s\S]+)$/iu);
  if (tailList && /^\s*\d+\./m.test(tailList[1])) {
    return normalizeUserText(tailList[1]);
  }

  return null;
}

function extractAfterKeyword(text, keywords) {
  for (const kw of keywords) {
    const re = new RegExp(`${kw}\\s*[:：]?\\s*["'""「]?([^"'""」，,；;\\n]+)`, 'iu');
    const m = text.match(re);
    if (m) return normalizeUserText(m[1]);
  }
  return null;
}

export function hasUserTaskInput(parseMeta = {}, title = null, description = null) {
  if (description != null && String(description).trim()) return true;
  if (title != null && String(title).trim()) return true;
  const src = parseMeta.description_source || parseMeta.title_source;
  return src && src !== 'inherit';
}

export function resolveCreateTrack(
  parseMeta = {},
  title = null,
  description = null,
  raw = '',
  sourceContent = null,
  forceTrack = null,
) {
  if (forceTrack && FORCE_TRACK_ALLOWED.has(forceTrack)) {
    return forceTrack;
  }
  // P-410：自动创建口令优先于残余 NL（如「自动创建任务」剥口令后可能残留「任务」）
  if (hasAutoCreateCue(raw)) return TRACK_REQ_ANALYZE;
  if (
    isContentRefineCandidate({
      raw,
      sourceContent: sourceContent ?? parseMeta.nl_remainder ?? description,
      parseMeta,
    })
  ) {
    return TRACK_CONTENT_REFINE;
  }
  if (hasUserTaskInput(parseMeta, title, description)) return TRACK_USER_INPUT;
  // P-410：裸需求引用不再默认 req_analyze（由 NEED_CREATE_MODE / --force-track 处理）
  return TRACK_REQ_ANALYZE;
}

/**
 * 剥离 URL/REQ/创建动词等，得 NL 自由文本剩余
 */
export function extractNlRemainder(text) {
  let t = normalizePlatformTitledLinks(String(text || ''));
  t = t.replace(/任务内容如下\s*[=＝]{2,}[\s\S]*?[=＝]{2,}/giu, ' ');
  t = t.replace(/任务内容如下\s*[=＝]{2,}[\s\S]+$/giu, ' ');
  t = t.replace(/https?:\/\/[^\s，,；;]*?\/(?:pool\/)?requirement\/\d+(?:下|喜爱)?/gi, ' ');
  t = t.replace(/REQ-\d{8}-\d+/gi, ' ');
  t = t.replace(/\/(?:pool\/)?requirement\/\d+(?:下|喜爱)?/gi, ' ');
  t = t.replace(/(?:在|于)\s*(?:需求\s*)?\d{3,}\s*(?:下|喜爱)?/gi, ' ');
  t = t.replace(/(?:我需要在|我要在|需要在|请在)\s*/gi, ' ');
  t = t.replace(/喜爱\s*(?:新建|创建)\s*任务/gi, ' ');
  // P-410：须先于「创建任务」剥离整段口令（含「…任务」后缀）
  t = t.replace(AUTO_CREATE_CUE_RE, ' ');
  t = t.replace(/(?:新建|创建)\s*任务/gi, ' ');
  t = t.replace(/(?:新建|创建)(?!\s*\d+\s*个)/gi, ' ');
  t = t.replace(/创建\s*\d+\s*个/gi, ' ');
  t = t.replace(/\d+\s*个任务/gi, ' ');
  t = t.replace(/批量\s*\d+/gi, ' ');
  t = t.replace(/(?:工时|预估)\s*\d+(?:\.\d+)?\s*(?:天|小时)?/gi, ' ');
  t = t.replace(/(?:名称|标题|任务名)\s*[:：]?\s*[^，,；;\n]+/gi, ' ');
  t = t.replace(/(?:内容|描述)\s*[:：]?\s*[^，,；;\n]+/gi, ' ');
  t = t.replace(/任务内容如下\s*[:：]?\s*[\s\S]+$/giu, ' ');
  t = t.replace(/(?:在|于)\s*下/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^在\s*[，,、；;]?\s*/u, '');
  t = t.replace(/^[，,、；;]+|[，,、；;]+$/g, '').trim();
  if (/^(?:任务|下|喜爱)?$/u.test(t)) return null;
  return t || null;
}

function extractNumberedSegments(text) {
  const t = String(text || '');
  const lineSegments = [];
  for (const line of t.split(/\n/)) {
    const m = line.match(/^\s*\d+\.\s*(.+)$/);
    if (m) {
      const cleaned = stripSegmentFiller(m[1].trim());
      if (cleaned) lineSegments.push(cleaned);
    }
  }
  if (lineSegments.length >= 2) return lineSegments;

  if (!/\d+\.\s/.test(t)) return null;
  const inlineParts = t
    .split(/\d+\.\s*/)
    .map((s) => stripSegmentFiller(s.trim()))
    .filter((s) => s && s !== '在');
  return inlineParts.length >= 2 ? inlineParts : null;
}

/**
 * 从 NL 剩余文本自动摘要任务标题（v0.7）
 */
export function autoTitle(nlRemainder) {
  if (!nlRemainder) return null;

  const numbered = extractNumberedSegments(nlRemainder);
  if (numbered) {
    return numbered.join('、').slice(0, 80) || null;
  }

  const rawSegments = nlRemainder.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
  const segments = [];
  for (const seg of rawSegments) {
    const cleaned = stripSegmentFiller(seg);
    if (!cleaned || cleaned === '在') continue;
    if (/和/.test(cleaned) && !SEGMENT_SPLIT.test(cleaned)) {
      segments.push(...cleaned.split(/和+/).map((s) => s.trim()).filter(Boolean));
    } else {
      segments.push(cleaned);
    }
  }
  if (segments.length === 0) return null;
  if (segments.length === 1) {
    return segments[0].slice(0, 80) || null;
  }
  const joined = segments.join('、');
  return joined.slice(0, 80) || null;
}

export function parseCreateCount(text) {
  const t = String(text || '');
  const m = t.match(/创建\s*(\d+)\s*个|(\d+)\s*个任务|批量\s*(\d+)/);
  if (!m) return 1;
  const n = parseInt(m[1] || m[2] || m[3], 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_CREATE_COUNT);
}

export function parseEstimatedHours(text) {
  const m = String(text || '').match(/(?:工时|预估)\s*(\d+(?:\.\d+)?)\s*(?:小时)?/);
  if (!m) return DEFAULT_ESTIMATED_HOURS;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ESTIMATED_HOURS;
}

function parseTitleDescription(raw) {
  const text = normalizePlatformTitledLinks(String(raw || ''));
  const nlEarly = extractNlRemainder(text);
  if (
    nlEarly &&
    isContentRefineCandidate({
      raw: text,
      sourceContent: nlEarly,
      parseMeta: {},
    })
  ) {
    return {
      title: null,
      description: null,
      meta: {
        track: TRACK_CONTENT_REFINE,
        title_source: 'content_refine_pending',
        description_source: 'content_refine_pending',
        source_content_len: nlEarly.length,
        nl_remainder: nlEarly,
      },
      sourceContent: nlEarly,
    };
  }

  const kwTitle = extractAfterKeyword(text, ['名称', '标题', '任务名']);
  const blockDesc = extractDescriptionBlock(text);
  const kwDesc = blockDesc || extractAfterKeyword(text, ['内容', '描述']);
  const meta = {};

  if (kwTitle || kwDesc) {
    if (kwTitle) meta.title_source = 'keyword';
    if (kwDesc) {
      meta.description_source = blockDesc ? 'content_block' : 'keyword';
    }
    const rawDesc = kwDesc ? normalizeUserText(kwDesc) : null;
    const description = rawDesc ? beautifyUserDescription(rawDesc) : null;
    const title = kwTitle || (rawDesc ? autoTitle(rawDesc) : null);
    if (!kwTitle && title) meta.title_source = 'nl_auto';
    if (rawDesc && description && description !== rawDesc) meta.description_beautified = true;
    const sourceContent = rawDesc || null;
    return { title, description, meta, sourceContent };
  }

  const nl = extractNlRemainder(text);
  if (nl) {
    const normalized = normalizeUserText(nl);
    const description = beautifyUserDescription(normalized);
    meta.description_source = 'nl_free_text';
    meta.nl_remainder = normalized;
    if (description !== normalized) meta.description_beautified = true;
    const title = autoTitle(normalized);
    if (title) meta.title_source = 'nl_auto';
    return { title, description, meta, sourceContent: normalized };
  }

  return { title: null, description: null, meta, sourceContent: null };
}

/**
 * @param {string} text 用户句
 * @param {object|null} sessionDefaults last_create_defaults
 * @param {{ forceTrack?: string|null, allowPendingMode?: boolean }} [options]
 */
export function parseCreateIntent(text, sessionDefaults = null, options = {}) {
  const raw = normalizePlatformTitledLinks(String(text || '')).trim();
  const forceTrack = options.forceTrack && FORCE_TRACK_ALLOWED.has(options.forceTrack)
    ? options.forceTrack
    : null;
  const allowPendingMode = !!options.allowPendingMode;

  if (isMenuChoiceOnly(raw)) {
    const err = new Error(MENU_CHOICE_ONLY_ERROR);
    err.code = 'MENU_CHOICE_ONLY';
    throw err;
  }
  if (isCreateModeChoiceOnly(raw) && !forceTrack && !allowPendingMode) {
    const err = new Error(CREATE_MODE_CHOICE_ONLY_ERROR);
    err.code = 'CREATE_MODE_CHOICE_ONLY';
    throw err;
  }

  const create_mode = isFullCreateMode(raw) ? 'full' : 'quick';
  const ref = parseRequirementRef(raw);

  let requirementId = null;
  let requirementNo = null;
  if (ref?.requirementId) requirementId = String(ref.requirementId);
  else if (ref?.requirementNo) requirementNo = String(ref.requirementNo);
  else if (ref?.useSession && sessionDefaults?.requirementId) {
    requirementId = String(sessionDefaults.requirementId);
    requirementNo = sessionDefaults.requirementNo || null;
  }

  const { title, description, meta: titleDescMeta, sourceContent } = parseTitleDescription(raw);

  // P-410：仅需求引用 → 待 MODE；--resolve-only 放行 pending；--force-track 强制轨
  if (
    !forceTrack &&
    isRequirementRefOnly(raw, sessionDefaults)
  ) {
    if (!allowPendingMode) {
      const err = new Error(NEED_CREATE_MODE_ERROR);
      err.code = NEED_CREATE_MODE;
      err.requirementId = requirementId;
      err.requirementNo = requirementNo;
      throw err;
    }
    const today = todayShanghai();
    return {
      create_mode: 'quick',
      track: null,
      status: 'pending_create_mode',
      requirementId,
      requirementNo,
      title: null,
      description: null,
      source_content: null,
      refine_status: null,
      taskPhase: DEFAULT_PHASE,
      taskCategory: DEFAULT_CATEGORY,
      plannedStartDate: today,
      plannedEndDate: today,
      estimatedHours: DEFAULT_ESTIMATED_HOURS,
      create_count: 0,
      assigneeLabel: '当前用户（令牌持有人）',
      _parse: { ref_source: ref?.source || null, pending_create_mode: true },
    };
  }

  const track = resolveCreateTrack(
    titleDescMeta,
    title,
    description,
    raw,
    sourceContent,
    forceTrack,
  );
  const today = todayShanghai();

  let finalTitle = title;
  let finalDescription = description;
  let source_content = null;
  let refine_status = null;

  if (track === TRACK_CONTENT_REFINE) {
    source_content = String(sourceContent || extractNlRemainder(raw) || '').trim();
    finalTitle = null;
    finalDescription = null;
    refine_status = 'pending_agent';
    titleDescMeta.track = TRACK_CONTENT_REFINE;
    titleDescMeta.title_source = 'content_refine_pending';
    titleDescMeta.description_source = 'content_refine_pending';
    titleDescMeta.source_content_len = source_content.length;
  } else if (track === TRACK_REQ_ANALYZE) {
    // 口令/强制自动轨：忽略剥壳残留 NL，标题描述由分析生成
    finalTitle = null;
    finalDescription = null;
    titleDescMeta.track = TRACK_REQ_ANALYZE;
  }

  if (forceTrack === TRACK_USER_INPUT && !hasUserTaskInput(titleDescMeta, finalTitle, finalDescription)) {
    const err = new Error('手动创建须提供任务标题或内容（见 T-CREATE-MANUAL-INPUT-ASK）');
    err.code = 'NEED_MANUAL_TASK_INPUT';
    throw err;
  }

  const create_count =
    track === TRACK_USER_INPUT ? parseCreateCount(raw) : 1;

  return {
    create_mode,
    track,
    requirementId,
    requirementNo,
    title: finalTitle,
    description: finalDescription,
    source_content,
    refine_status,
    title_refine_max: track === TRACK_CONTENT_REFINE ? 40 : undefined,
    taskPhase: DEFAULT_PHASE,
    taskCategory: DEFAULT_CATEGORY,
    plannedStartDate: today,
    plannedEndDate: today,
    estimatedHours: parseEstimatedHours(raw),
    create_count,
    assigneeLabel: '当前用户（令牌持有人）',
    _parse: {
      ref_source: ref?.source || null,
      force_track: forceTrack || null,
      auto_create_cue: hasAutoCreateCue(raw) || null,
      ...titleDescMeta,
    },
  };
}
