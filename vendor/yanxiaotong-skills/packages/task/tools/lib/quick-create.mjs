/**
 * 创建准备：R02 + M10 校验 + 双轨合并（v0.7）
 */
import { httpJson, readSessionFile } from './task-tools.mjs';
import {
  parseCreateIntent,
  autoTitle,
  isMenuChoiceOnly,
  isCreateModeChoiceOnly,
  MENU_CHOICE_ONLY_ERROR,
  CREATE_MODE_CHOICE_ONLY_ERROR,
  NEED_CREATE_MODE,
  NEED_CREATE_MODE_ERROR,
  TRACK_USER_INPUT,
  TRACK_REQ_ANALYZE,
  TRACK_CONTENT_REFINE,
} from './parse-create-intent.mjs';
import { analyzeRequirementForTasks } from './analyze-requirement-tasks.mjs';
import {
  fetchAllTasksForRequirement,
  buildDedupContext,
} from './dedup-tasks.mjs';

const FORCE_TRACK_ALLOWED = new Set([TRACK_USER_INPUT, TRACK_REQ_ANALYZE, TRACK_CONTENT_REFINE]);

export async function fetchRequirementDetail(idOrNo, { token } = {}) {
  const result = await httpJson('GET', `/api/open/requirements/detail/${encodeURIComponent(idOrNo)}`, {
    token,
  });
  return result.data || {};
}

/**
 * P-410：仅校验所属需求（R02 + M10 默认），不跑需求分析/去重
 */
export async function resolveRequirementOnly(intent, { token } = {}) {
  const base = { ...(intent || {}) };
  const idOrNo = base.requirementId || base.requirementNo;
  if (!idOrNo) throw new Error('未解析到所属需求，请提供需求链接或 REQ 编号');

  const req = await fetchRequirementDetail(idOrNo, { token });
  validateRequirementForCreate(req);
  await validateM10Defaults(
    {
      taskPhase: base.taskPhase || '开发阶段',
      taskCategory: base.taskCategory || '开发编码',
    },
    { token },
  );

  return {
    ...base,
    create_mode: 'quick',
    track: null,
    status: 'pending_create_mode',
    requirementId: String(req.requirementId),
    requirementNo: req.requirementNo || '',
    requirementTitle: req.title || '',
    title: null,
    description: null,
    source_content: null,
    refine_status: null,
    create_count: 0,
    task_items: null,
    existing_tasks: null,
    dedup: null,
    requirementStatus: req.status || '',
    assigneeLabel: base.assigneeLabel || '当前用户（令牌持有人）',
    _parse: {
      ...(base._parse || {}),
      pending_create_mode: true,
      resolve_only: true,
    },
  };
}

export async function validateM10Defaults(intent, { token } = {}) {
  const m10 = await httpJson('GET', '/api/open/metadata/task-dictionaries', { token });
  const data = m10.data || {};
  const phases = data.taskPhase || [];
  const cats = (data.phaseCategoryMap && data.phaseCategoryMap[intent.taskPhase]) || [];
  if (!phases.includes(intent.taskPhase)) {
    throw new Error(`默认任务阶段「${intent.taskPhase}」不在 M10 字典中`);
  }
  if (!cats.includes(intent.taskCategory)) {
    throw new Error(`默认任务类别「${intent.taskCategory}」与阶段不匹配`);
  }
}

export function validateRequirementForCreate(req) {
  if (!req || !req.requirementId) throw new Error('需求不存在');
  if (req.status === '已完成') throw new Error('需求状态为已完成，不能新建任务');
  if (!req.devIterationId) throw new Error('需求尚未关联开发迭代，请先为需求设置开发迭代');
}

/**
 * @param {object} intent 来自 parseCreateIntent 或 JSON
 */
export async function prepareQuickCreate(intent, { token } = {}) {
  const base = { ...(intent || {}) };
  const idOrNo = base.requirementId || base.requirementNo;
  if (!idOrNo) throw new Error('未解析到所属需求，请提供需求链接或 REQ 编号');

  const req = await fetchRequirementDetail(idOrNo, { token });
  validateRequirementForCreate(req);
  await validateM10Defaults(base, { token });

  const parseMeta = { ...(base._parse || {}) };
  const track = base.track || TRACK_REQ_ANALYZE;
  let title = base.title;
  let description = base.description || '';
  let create_count = base.create_count || 1;
  let task_items = base.task_items || null;
  let dedup = base.dedup || null;
  let existing_tasks = base.existing_tasks || null;

  if (track === TRACK_USER_INPUT) {
    const userDesc = base.description != null && String(base.description).trim() ? base.description : null;
    title = base.title || autoTitle(userDesc) || req.title;
    description = userDesc || '';
    create_count = base.create_count || 1;
    task_items = null;
    parseMeta.track = TRACK_USER_INPUT;
    parseMeta.description_direct = true;
  } else if (track === TRACK_CONTENT_REFINE) {
    title = base.title || '';
    description = base.description || '';
    create_count = 1;
    task_items = null;
    dedup = null;
    existing_tasks = null;
    parseMeta.track = TRACK_CONTENT_REFINE;
    if (base.refine_status) parseMeta.refine_status = base.refine_status;
    if (base._parse?.title_source === 'content_refined') {
      parseMeta.title_source = 'content_refined';
      parseMeta.description_source = 'content_refined';
    }
  } else {
    const analyzed = analyzeRequirementForTasks(req);
    create_count = analyzed.create_count;
    task_items = analyzed.tasks;
    title = analyzed.tasks[0]?.title || req.title;
    description = analyzed.tasks[0]?.description || '';
    parseMeta.track = TRACK_REQ_ANALYZE;
    parseMeta.title_source = 'req_analyzed';
    parseMeta.description_source = 'req_analyzed';
    parseMeta.description_generated = true;
    parseMeta.create_count_source = analyzed.create_count_source;
    parseMeta.create_count_hint = analyzed.create_count_hint;
    parseMeta.task_items = analyzed.tasks;

    existing_tasks = await fetchAllTasksForRequirement(req.requirementId, { token, httpJson });
    dedup = buildDedupContext(task_items, existing_tasks);
  }

  return {
    ...base,
    track,
    create_mode: base.create_mode || 'quick',
    requirementId: String(req.requirementId),
    requirementNo: req.requirementNo || '',
    requirementTitle: req.title || '',
    title: title || '',
    description: description || '',
    source_content: base.source_content || null,
    refine_status: base.refine_status || null,
    title_refine_max: base.title_refine_max || (track === TRACK_CONTENT_REFINE ? 40 : undefined),
    create_count,
    task_items,
    existing_tasks,
    dedup,
    requirementStatus: req.status || '',
    _parse: parseMeta,
  };
}

/**
 * @param {string} text
 * @param {{ token?: string, resolveOnly?: boolean, forceTrack?: string|null }} [opts]
 */
export async function parseAndPrepareFromText(text, opts = {}) {
  const { token, resolveOnly = false, forceTrack = null } = opts;
  if (isMenuChoiceOnly(text)) {
    const err = new Error(MENU_CHOICE_ONLY_ERROR);
    err.code = 'MENU_CHOICE_ONLY';
    throw err;
  }
  if (isCreateModeChoiceOnly(text) && !resolveOnly && !forceTrack) {
    const err = new Error(CREATE_MODE_CHOICE_ONLY_ERROR);
    err.code = 'CREATE_MODE_CHOICE_ONLY';
    throw err;
  }

  const normalizedForce =
    forceTrack && FORCE_TRACK_ALLOWED.has(forceTrack) ? forceTrack : null;

  const session = readSessionFile();
  const partial = parseCreateIntent(text, session?.last_create_defaults || null, {
    forceTrack: normalizedForce,
    allowPendingMode: !!resolveOnly,
  });

  if (partial.create_mode === 'full') {
    const err = new Error('FULL_CREATE_MODE');
    err.code = 'FULL_CREATE_MODE';
    throw err;
  }

  if (resolveOnly || partial.status === 'pending_create_mode') {
    return resolveRequirementOnly(partial, { token });
  }

  if (!partial.track) {
    const err = new Error(NEED_CREATE_MODE_ERROR);
    err.code = NEED_CREATE_MODE;
    throw err;
  }

  return prepareQuickCreate(partial, { token });
}
