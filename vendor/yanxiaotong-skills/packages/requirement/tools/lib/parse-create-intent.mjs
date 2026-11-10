/**
 * 需求池创建 · NL 解析（基于原始需求创建快捷轨）
 * SSOT：reference/create-defaults.md
 */

import {
  isSubstantialText,
  refineFromUserInput,
  resolveCreateTitleDescription,
} from './refine-requirement-content.mjs';
import { normalizePlatformTitledLinks } from '../../../../tools/lib/platform-titled-link.mjs';

const CREATE_VERBS =
  /创建需求|新建需求|新增需求|提需求|登记需求|创建池内需求|新建池内需求/;

const SEGMENT_SPLIT = /[，,。；;：:]+/;

/**
 * 解析原始需求引用（用于 R01 originalRequirementId）
 * 优先级：前端详情 URL → 其它 URL → OR 编号 → 「在 OR/原始需求 {id} 下」→ 纯数字上下文
 */
export function parseOriginalRequirementRef(text) {
  const t = normalizePlatformTitledLinks(String(text || ''));

  // Web 详情：/app/requirements/original/requirement/{id}
  const webDetail = t.match(
    /\/(?:app\/)?requirements\/original\/requirement\/(\d+)/i,
  );
  if (webDetail) return { originalIdOrNo: webDetail[1], source: 'url_web' };

  // 兼容：/original/detail/{id}、/original-requirements/{id}、/requirements/original/{id}
  const urlMatch = t.match(
    /\/(?:requirements\/)?original(?:-requirement)?s?\/(?:detail\/)?(\d+)/i,
  );
  if (urlMatch) return { originalIdOrNo: urlMatch[1], source: 'url' };

  const orNo = t.match(/OR-\d{8}-\d+/i);
  if (orNo) return { originalIdOrNo: orNo[0], source: 'or_no' };

  const underOr = t.match(
    /(?:在|于)\s*(?:原始需求\s*)?(?:OR-?)?\s*(\d{3,})\s*(?:下|里面|中)/i,
  );
  if (underOr && /原始需求|OR-|新建需求|创建需求|新增需求/.test(t)) {
    return { originalIdOrNo: underOr[1], source: 'under_or' };
  }

  const underOrNo = t.match(/(?:在|于)\s*(OR-\d{8}-\d+)\s*(?:下|里面|中)/i);
  if (underOrNo) return { originalIdOrNo: underOrNo[1], source: 'under_or_no' };

  const ctx = t.match(/(?:原始需求|original)\s*[^\d]{0,12}(\d{3,})/i);
  if (ctx) return { originalIdOrNo: ctx[1], source: 'context_id' };

  return null;
}

/**
 * 是否命中「基于父单创建需求」快捷口令（含 OR；方案/项目等仅作口令识别，本轮 API 仅 OR 可关联）
 */
export function isUnderParentCreate(text) {
  const t = String(text || '');
  if (!CREATE_VERBS.test(t) && !/新建需求|创建需求/.test(t)) return false;
  if (parseOriginalRequirementRef(t)) return true;
  return /(?:在|于).{0,80}(?:下|里面|中)/.test(t) || /OR-\d{8}-\d+/i.test(t);
}

/**
 * 是否仅为路由壳（无用户实质说明）
 * 例：「原始需求为」「@yanxiaotong-skills」——不得当标题/描述
 */
export function isCreateRoutingShellOnly(text) {
  const t = String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，,、；;：:.\-_/\\|]+/g, '');
  if (!t) return true;
  return /^(?:@?\/?yanxiaotong-skills|原始需求(?:编号)?(?:为|是)?)+$/i.test(t);
}

/**
 * 剥离 OR 引用与创建动词后，得到 NL 余段
 * 路由壳（「原始需求为:」「@yanxiaotong-skills」等）须剥净，避免误当实质正文
 */
export function extractCreateNlRemainder(text) {
  let t = String(text || '');
  // 技能入口前缀
  t = t.replace(/@?\/?yanxiaotong-skills\b/gi, ' ');
  // 仅剥离 URL 本体，勿吞掉中文「下/里面/中」
  t = t.replace(/https?:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%\-]+/gi, ' ');
  // 无协议相对路径残留
  t = t.replace(/\/(?:app\/)?requirements\/original\/requirement\/\d+/gi, ' ');
  t = t.replace(/\/(?:requirements\/)?original(?:-requirement)?s?\/(?:detail\/)?\d+/gi, ' ');
  t = t.replace(/OR-\d{8}-\d+/gi, ' ');
  t = t.replace(
    /(?:在|于)\s*(?:原始需求\s*)?(?:OR-?)?\s*\d{3,}\s*(?:下|里面|中)/gi,
    ' ',
  );
  t = t.replace(/(?:在|于)\s*OR-\d{8}-\d+\s*(?:下|里面|中)/gi, ' ');
  // 「原始需求为: / 原始需求是 / 原始需求：」口令壳；勿匹配正文中的「按原始需求…」
  t = t.replace(/原始需求\s*(?:编号)?\s*(?:为|是)\s*[:：]?\s*/gi, ' ');
  t = t.replace(/原始需求\s*(?:编号)?\s*[:：]\s*/gi, ' ');
  t = t.replace(/(?:我需要在|我要在|需要在|请在)\s*/gi, ' ');
  t = t.replace(
    /创建需求|新建需求|新增需求|提需求|登记需求|创建池内需求|新建池内需求/gi,
    ' ',
  );
  t = t.replace(/(?:标题|名称)\s*[:：]?\s*[^，,；;]+/gi, ' ');
  t = t.replace(/(?:描述|内容)\s*[:：]\s*/gi, ' ');
  t = t.replace(/(?:在|于)\s*下/g, ' ');
  t = t.replace(/^[在于]\s*/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[，,、；;：:]+|[，,、；;：:]+$/g, '').trim();
  if (!t || isCreateRoutingShellOnly(t)) return null;
  return t;
}

function extractAfterKeyword(text, keywords) {
  for (const kw of keywords) {
    const re = new RegExp(`${kw}\\s*[:：]?\\s*["'""「]?([^"'""」，,；;\\n]+)`, 'iu');
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * 从 NL 余段推断标题 / 描述（兼容旧分段规则）
 */
export function autoRequirementTitleFromNl(nlRemainder) {
  if (!nlRemainder) return { title: null, description: null };
  const segments = nlRemainder
    .split(SEGMENT_SPLIT)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (!segments.length) return { title: null, description: null };
  const title = segments[0].slice(0, 200);
  const description =
    segments.length > 1 ? segments.slice(1).join('，') : null;
  return { title, description };
}

/**
 * 解析创建意图（机侧；Agent 再调 OR detail 取 snowflake id，并可 refine-create）
 * @param {string} text
 * @param {{ orDetail?: object }} [opts] 若已拉到原始需求详情，可同轮完成提炼
 */
export function parseCreateIntent(text, opts = {}) {
  const raw = String(text || '').trim();
  const orRef = parseOriginalRequirementRef(raw);
  const underParent = isUnderParentCreate(raw);

  const explicitTitle = extractAfterKeyword(raw, ['标题', '名称']);
  // 仅「描述/内容」显式键；勿用「说明」（易误伤「补充说明」等）
  const explicitDesc = extractAfterKeyword(raw, ['描述', '内容']);
  const nlRemainder = extractCreateNlRemainder(raw);
  const auto = autoRequirementTitleFromNl(nlRemainder);

  let title = explicitTitle || auto.title || null;
  let description = explicitDesc || auto.description || null;
  if (!description && nlRemainder && title && nlRemainder !== title) {
    description = nlRemainder.startsWith(title)
      ? nlRemainder.slice(title.length).replace(/^[，,、；;\s]+/, '') || null
      : nlRemainder;
  }

  // 基于 OR：用户有实质余段 → 优先从用户输入提炼；否则若传入 orDetail → 从 OR 提炼
  let refine_source = null;
  const userSourceText = explicitDesc || nlRemainder;
  const orDetail = opts.orDetail || opts.or_detail || null;

  if (orRef || underParent) {
    const refined = resolveCreateTitleDescription({
      userText: userSourceText,
      orDetail,
    });
    if (refined.refine_source === 'user' || refined.refine_source === 'user_partial') {
      title = explicitTitle || refined.title || title;
      description = explicitDesc || refined.description || description;
      refine_source = refined.refine_source;
    } else if (refined.refine_source === 'original') {
      title = explicitTitle || refined.title || title;
      description = explicitDesc || refined.description || description;
      refine_source = 'original';
    } else if (userSourceText && isSubstantialText(userSourceText)) {
      const fromUser = refineFromUserInput(userSourceText);
      title = explicitTitle || fromUser.title || title;
      description = explicitDesc || fromUser.description || description;
      refine_source = fromUser.refine_source;
    }
  } else if (userSourceText && isSubstantialText(userSourceText) && (!title || !description)) {
    // 普通创建：大段输入可机侧预提炼（Agent 仍须确认表）
    const fromUser = refineFromUserInput(userSourceText);
    title = title || fromUser.title;
    description = description || fromUser.description;
    if (fromUser.refine_source) refine_source = fromUser.refine_source;
  }

  const missing = [];
  if (!title) missing.push('title');
  if (!description) missing.push('description');

  return {
    operation: 'create',
    under_parent: underParent,
    original_ref: orRef,
    /** 供 Agent：有 OR 引用时可 detail 取 id 并提炼；亦可直接把 OR 编号/详情 URL 写入 body.originalRequirementId（或 originalNo），由后端解析 */
    needs_original_resolve: Boolean(orRef),
    /** user | original | user_partial | null */
    refine_source,
    /** 用户余段是否有实质正文（无则 OR 快捷轨应从原始需求正文提炼） */
    user_text_substantial: Boolean(userSourceText && isSubstantialText(userSourceText)),
    title,
    description,
    nl_remainder: nlRemainder,
    missing,
  };
}

export default parseCreateIntent;
