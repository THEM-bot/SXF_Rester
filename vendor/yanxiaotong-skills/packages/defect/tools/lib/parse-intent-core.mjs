/**
 * 缺陷六操作 NL 解析内核
 * SSOT：reference/intent-routing.md · reference/create-defaults.md
 */

import {
  TRACK_CONTENT_REFINE,
  isContentRefineCandidate,
} from './content-refine.mjs';
import { normalizePlatformTitledLinks } from '../../../../tools/lib/platform-titled-link.mjs';
import {
  DEFECT_TYPE_LABELS,
  DEFECT_TYPE_INFER_RULES,
  defectTypeLabel,
  parseDefectType,
  inferDefectTypeFromContent,
  resolveDefectType,
  formatDefectTypeLabel,
} from './defect-type.mjs';

export { TRACK_CONTENT_REFINE };
export {
  DEFECT_TYPE_LABELS,
  DEFECT_TYPE_INFER_RULES,
  defectTypeLabel,
  parseDefectType,
  inferDefectTypeFromContent,
  resolveDefectType,
  formatDefectTypeLabel,
};

export const DEFAULT_SEVERITY = 'C类（一般）';
export const STATUS_VALUES = [
  '新建',
  '处理中',
  '修复待回归',
  '回归中',
  '解决关闭',
  '非问题关闭',
  '重新打开',
];
export const SEVERITY_VALUES = ['A类（致命）', 'B类（严重）', 'C类（一般）', 'D类（轻微）'];

/** 创建口令：显式修复人/负责人关键词 → 供 prepare 经 M05 解析工号 */
export function parseCreateAssigneeKeyword(text) {
  const t = String(text || '');
  const m = t.match(/(?:修复人|负责人)\s*[:：]?\s*([^\s，,；;]+)/u);
  if (!m) return null;
  const kw = m[1].trim();
  return kw || null;
}

export function isFullCreateMode(text) {
  return /完整创建|自定义严重性|逐步创建/.test(String(text || ''));
}

export function parseDefectRef(text) {
  const t = String(text || '');
  const td = t.match(/TD-\d{8}-\d+/i);
  if (td) return { idOrNo: td[0], source: 'defect_no' };

  if (/刚才创建的缺陷|刚创建的缺陷|上一个缺陷/.test(t)) {
    return { useSession: true, source: 'session_defect' };
  }

  const numId = t.match(/缺陷[^\d]{0,12}(\d{3,})/i);
  if (numId && !/需求/.test(t.slice(Math.max(0, numId.index - 5), numId.index + 5))) {
    return { idOrNo: numId[1], source: 'context_id' };
  }
  return null;
}

export function parseRequirementRef(text) {
  const t = normalizePlatformTitledLinks(String(text || ''));
  const urlMatch = t.match(/\/(?:pool\/)?requirement\/(\d+)/i);
  if (urlMatch) return { requirementId: urlMatch[1], source: 'url' };

  const reqNo = t.match(/REQ-\d{8}-\d+/i);
  if (reqNo) return { requirementNo: reqNo[0], source: 'req_no' };

  if (/沿用需求|当前需求/.test(t)) return { useSession: true, source: 'session_req' };

  const underReq = t.match(/(?:在|于)\s*(?:需求\s*)?(\d{3,})\s*(?:下|里面|中)/);
  if (underReq) return { requirementId: underReq[1], source: 'under_req' };

  const idCtx = t.match(/(?:需求|requirement)[^\d]{0,24}(\d{3,})/i);
  if (idCtx) return { requirementId: idCtx[1], source: 'context_id' };

  return null;
}

function extractAfterKeyword(text, keywords) {
  for (const kw of keywords) {
    const re = new RegExp(`${kw}\\s*[:：]?\\s*["'""「]?([^"'""」，,；;\\n]+)`, 'iu');
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

const DEFECT_SEGMENT_SPLIT = /[，,。；;：:]+/;
const DEFECT_FILLER_WORDS = ['今天', '发现', '出现'];

function stripDefectSegmentFiller(segment) {
  let s = String(segment || '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of DEFECT_FILLER_WORDS) {
      if (s.startsWith(w)) {
        s = s.slice(w.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

/**
 * 创建缺陷：剥离 URL/REQ/创建动词等，得 NL 自由文本（v0.3）
 */
export function extractCreateNlRemainder(text) {
  let t = normalizePlatformTitledLinks(String(text || ''));
  t = t.replace(/https?:\/\/[^\s，,；;]*?\/(?:pool\/)?requirement\/\d+/gi, ' ');
  t = t.replace(/REQ-\d{8}-\d+/gi, ' ');
  t = t.replace(/\/(?:pool\/)?requirement\/\d+/gi, ' ');
  t = t.replace(/(?:在|于)\s*(?:需求\s*)?\d{3,}\s*下/gi, ' ');
  t = t.replace(/(?:我需要在|我要在|需要在|请在)\s*/gi, ' ');
  t = t.replace(/创建缺陷|新建缺陷|提\s*BUG|提缺陷|创建\s*BUG|登记缺陷/gi, ' ');
  t = t.replace(/(?:提\s*BUG|BUG|缺陷)\s*[:：]\s*/gi, ' ');
  t = t.replace(/严重性\s*[:：]?\s*[ABCD]类[^，,；;]*/gi, ' ');
  t = t.replace(/(?:标题|名称)\s*[:：]?\s*[^，,；;]+/gi, ' ');
  t = t.replace(/(?:描述|复现步骤|内容)\s*[:：]?\s*[^，,；;]+/gi, ' ');
  t = t.replace(/(?:修复人|负责人)\s*[:：]?\s*[^\s，,；;]+/gi, ' ');
  t = t.replace(/(?:缺陷类型)\s*(?:改为|改成|变为|设为|为)?\s*[:：]?\s*[^\s，,；;]+/gi, ' ');
  t = t.replace(/(?:在|于)\s*下/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[，,、；;：:]+|[，,、；;：:]+$/g, '').trim();
  return t || null;
}

/**
 * 从 NL 剩余文本自动识别缺陷标题与描述（v0.3）
 */
export function autoDefectTitleFromNl(nlRemainder) {
  if (!nlRemainder) return { title: null, description: null };
  const segments = nlRemainder
    .split(DEFECT_SEGMENT_SPLIT)
    .map((s) => stripDefectSegmentFiller(s))
    .filter(Boolean);
  if (segments.length === 0) return { title: null, description: null };
  if (segments.length === 1) {
    const s = segments[0];
    if (s.length > 40) {
      return { title: s.slice(0, 40), description: s.slice(40).trim() || null };
    }
    return { title: s.slice(0, 200), description: null };
  }
  return {
    title: segments[0].slice(0, 200),
    description: segments.slice(1).join('，') || null,
  };
}

function parseCreateTitleDescription(raw) {
  const text = normalizePlatformTitledLinks(String(raw || ''));
  const nlEarly = extractCreateNlRemainder(text);
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
      track: TRACK_CONTENT_REFINE,
      refine_status: 'pending_agent',
    };
  }

  const kwTitle = extractAfterKeyword(text, ['标题', '名称', 'BUG：', 'BUG:', '缺陷：', '缺陷:']);
  const kwDesc = extractAfterKeyword(text, ['描述', '复现步骤', '内容']);
  const meta = {};

  if (kwTitle || kwDesc) {
    if (kwTitle) meta.title_source = 'keyword';
    if (kwDesc) meta.description_source = 'keyword';
    const sourceContent = kwDesc || kwTitle || null;
    return { title: kwTitle || null, description: kwDesc || null, meta, sourceContent };
  }

  const nl = extractCreateNlRemainder(text);
  if (nl) {
    meta.nl_remainder = nl;
    if (
      isContentRefineCandidate({
        raw: text,
        sourceContent: nl,
        parseMeta: meta,
      })
    ) {
      meta.track = TRACK_CONTENT_REFINE;
      meta.title_source = 'content_refine_pending';
      meta.description_source = 'content_refine_pending';
      meta.source_content_len = nl.length;
      return {
        title: null,
        description: null,
        meta,
        sourceContent: nl,
        track: TRACK_CONTENT_REFINE,
        refine_status: 'pending_agent',
      };
    }
    const { title, description } = autoDefectTitleFromNl(nl);
    if (title) meta.title_source = 'nl_auto';
    if (description) meta.description_source = 'nl_free_text';
    else if (nl) meta.description_source = 'nl_free_text';
    return { title, description, meta, sourceContent: nl };
  }

  return { title: null, description: null, meta, sourceContent: null };
}

export function parseBlockedUpdateField(text) {
  const t = String(text || '');
  if (/发现阶段/.test(t) && /(?:改|修改|更新|设为|变为|改成|改为)/.test(t)) {
    return 'discoveryPhase';
  }
  if (/创建人/.test(t) && /(?:改|修改|更新|设为|变为|改成|改为)/.test(t)) {
    return 'creator';
  }
  return null;
}

export function detectOperation(text) {
  const t = String(text || '');
  const defectRef = parseDefectRef(t);

  if (/非问题关闭|不是缺陷|不是问题/.test(t) && defectRef) return 'close';
  if (/(?:解决)?关闭|关掉/.test(t) && defectRef) return 'close';
  if (/(?:状态|流转).*(?:改为|改成|变为|进入)|(?:改为|改成|变为|进入).*(?:状态)/.test(t) && defectRef) {
    return 'status';
  }
  if (/(?:严重性|严重度).*(?:改为|改成|变为)/.test(t) && defectRef) return 'update';
  if (/(?:标题|描述|负责人|修复人|回归人|缺陷类型).*(?:改为|改成|变为|补充|清空|清除)/.test(t) && defectRef) {
    return 'update';
  }
  if (/(?:清空|清除)\s*(?:回归人|缺陷类型)/.test(t) && defectRef) return 'update';
  if (/^(?:改|修改|更新)/.test(t.trim()) && defectRef) return 'update';

  if (/创建缺陷|新建缺陷|提\s*BUG|提缺陷|创建\s*BUG|登记缺陷/.test(t)) return 'create';
  if (/\/(?:pool\/)?requirement\/\d+/i.test(t) && /缺陷|BUG|bug/.test(t)) return 'create';

  if (/查.*(?:列表|缺陷|BUG)|有哪些|列出/.test(t) && !defectRef) return 'list';
  if (/查.*详情|查看|查询|查一下/.test(t) && defectRef) return 'detail';
  if (/^查/.test(t.trim()) && defectRef) return 'detail';

  if (defectRef && /查|详情/.test(t)) return 'detail';

  return null;
}

export function parseStatus(text) {
  const t = String(text || '');
  for (const s of STATUS_VALUES) {
    if (t.includes(s)) return s;
  }
  const m = t.match(/(?:状态|改为|改成|变为|进入)\s*[:：]?\s*([^\s，,；;]+)/);
  return m ? m[1].trim() : null;
}

export function parseSeverity(text) {
  const t = String(text || '');
  for (const s of SEVERITY_VALUES) {
    if (t.includes(s)) return s;
  }
  const m = t.match(/(?:严重性|严重度)\s*(?:改为|改成|变为)?\s*[:：]?\s*([ABCD]类[^，,；;\s]*)/i);
  return m ? m[1].trim() : null;
}

export function parseCloseType(text) {
  const t = String(text || '');
  if (/非问题|不是缺陷|不是问题/.test(t)) return 'not_issue';
  if (/解决关闭|已解决|修复完成/.test(t)) return 'resolved';
  if (/关闭/.test(t)) return 'resolved';
  return null;
}

export function parseListQuery(text) {
  const t = String(text || '');
  const query = { current: 1, size: 5 };
  const reqRef = parseRequirementRef(t);
  if (reqRef?.requirementId) query.requirementId = String(reqRef.requirementId);
  if (reqRef?.requirementNo) query.requirementNo = reqRef.requirementNo;

  const status = parseStatus(t);
  if (status) query.statusList = [status];

  const severity = parseSeverity(t);
  if (severity) query.severityList = [severity];

  const titleM = t.match(/(?:标题|相关|关于|包含)\s*[:：]?\s*([^\s，,；;]+)/);
  if (titleM && !/需求/.test(titleM[0])) query.title = titleM[1].trim();

  if (/查全部|所有缺陷/.test(t)) query._allowEmpty = true;

  return query;
}

export function parseUpdateBody(text) {
  const t = String(text || '');
  const body = {};
  const title = extractAfterKeyword(t, ['标题改为', '标题改成', '标题变为', '标题']);
  if (title) body.title = title;
  const desc = extractAfterKeyword(t, ['描述补充', '描述改为', '描述改成', '描述', '复现步骤']);
  if (desc) body.description = desc;
  const severity = parseSeverity(t);
  if (severity) body.severity = severity;

  const dtype = parseDefectType(t);
  if (dtype?.clearDefectType) body.clearDefectType = true;
  else if (dtype?.defectType) body.defectType = dtype.defectType;

  if (/清空回归人|清除回归人|回归人清空/.test(t)) {
    body.clearRegressionTester = true;
  }

  return body;
}

export function computeMissing(intent) {
  const missing = [];
  const op = intent.operation;
  if (!op) {
    missing.push('operation');
    return missing;
  }

  if (op === 'create') {
    if (!intent.requirementId && !intent.requirementNo) missing.push('requirement');
    if (intent.track === TRACK_CONTENT_REFINE && intent.refine_status === 'pending_agent') {
      missing.push('refine');
    } else if (!intent.title) {
      missing.push('title');
    }
  } else if (op === 'detail' || op === 'update' || op === 'status' || op === 'close') {
    if (!intent.idOrNo) missing.push('defectId');
  }

  if (op === 'update') {
    const hasField = intent.updateBody && Object.keys(intent.updateBody).length > 0;
    if (!hasField && !intent.blockedUpdateField) missing.push('field');
  }
  if (op === 'status' && !intent.status) missing.push('status');
  if (op === 'close' && !intent.closeType) missing.push('closeType');

  if (op === 'list') {
    const q = intent.listQuery || {};
    const hasFilter =
      q._allowEmpty ||
      q.requirementId ||
      q.requirementNo ||
      q.title ||
      (q.statusList && q.statusList.length) ||
      (q.severityList && q.severityList.length);
    if (!hasFilter) missing.push('filter');
  }

  return missing;
}

/**
 * @param {string} text
 * @param {object|null} session
 */
export function parseIntent(text, session = null) {
  const raw = normalizePlatformTitledLinks(String(text || '')).trim();
  const blockedUpdateField = parseBlockedUpdateField(raw);
  const operation = blockedUpdateField ? null : detectOperation(raw);
  const defectRef = parseDefectRef(raw);
  const reqRef = parseRequirementRef(raw);
  const sessionDefs = session?.last_create_defaults || {};
  const sessionDefect = session?.last_defect || {};

  const intent = {
    operation,
    confidence: operation ? 'high' : 'low',
    create_mode: isFullCreateMode(raw) ? 'full' : 'quick',
    missing: [],
    _parse: {},
  };

  if (blockedUpdateField) {
    intent.blockedUpdateField = blockedUpdateField;
    intent.confidence = 'high';
    intent._parse.blocked = blockedUpdateField;
    return intent;
  }

  if (defectRef?.idOrNo) {
    intent.idOrNo = defectRef.idOrNo;
    intent._parse.defect_source = defectRef.source;
  } else if (defectRef?.useSession && sessionDefect.defectNo) {
    intent.idOrNo = sessionDefect.defectNo;
    intent._parse.defect_source = 'session';
  }

  if (reqRef?.requirementId) {
    intent.requirementId = String(reqRef.requirementId);
    intent._parse.req_source = reqRef.source;
  } else if (reqRef?.requirementNo) {
    intent.requirementNo = String(reqRef.requirementNo);
    intent._parse.req_source = reqRef.source;
  } else if (reqRef?.useSession && sessionDefs.requirementId) {
    intent.requirementId = String(sessionDefs.requirementId);
    intent.requirementNo = sessionDefs.requirementNo || null;
    intent._parse.req_source = 'session';
  }

  if (operation === 'create') {
    const {
      title,
      description,
      meta: titleDescMeta,
      sourceContent,
      track: parsedTrack,
      refine_status: parsedRefineStatus,
    } = parseCreateTitleDescription(raw);
    intent.title = title;
    intent.description = description;
    Object.assign(intent._parse, titleDescMeta);
    if (parsedTrack === TRACK_CONTENT_REFINE) {
      intent.track = TRACK_CONTENT_REFINE;
      intent.source_content = sourceContent;
      intent.refine_status = parsedRefineStatus || 'pending_agent';
      intent.title_refine_max = 40;
    }
    intent.severity = parseSeverity(raw) || DEFAULT_SEVERITY;
    const assigneeKeyword = parseCreateAssigneeKeyword(raw);
    if (assigneeKeyword) {
      intent.assigneeKeyword = assigneeKeyword;
      intent._parse.assignee_source = 'keyword';
    }
    intent.assigneeLabel = assigneeKeyword
      ? `待解析：${assigneeKeyword}`
      : '当前用户（令牌持有人）';
    intent.regressionTesterLabel = '（未指定）';
    // v0.6：机侧仅认显式「缺陷类型」口令；语义自动判定由 Agent + apply-refine --defect-type
    const createType = resolveDefectType(raw);
    if (createType?.defectType) {
      intent.defectType = createType.defectType;
      intent.defectTypeSource = createType.source || 'explicit';
      intent.defectTypeLabel = formatDefectTypeLabel(
        createType.defectType,
        intent.defectTypeSource,
      );
      intent._parse.defect_type_source = intent.defectTypeSource;
    } else {
      intent.defectTypeLabel = '（未选）';
      intent.defectTypeSource = null;
    }
  }

  if (operation === 'update') {
    intent.updateBody = parseUpdateBody(raw);
  }

  if (operation === 'status') {
    intent.status = parseStatus(raw);
  }

  if (operation === 'close') {
    intent.closeType = parseCloseType(raw);
  }

  if (operation === 'list') {
    intent.listQuery = parseListQuery(raw);
  }

  intent.missing = computeMissing(intent);
  if (intent.missing.length) intent.confidence = intent.confidence === 'high' ? 'medium' : 'low';

  return intent;
}
