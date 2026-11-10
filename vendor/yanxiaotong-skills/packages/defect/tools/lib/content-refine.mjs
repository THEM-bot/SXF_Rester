/**
 * 内容提炼轨 · 机侧启发式（v0.4 · 与 task 包对齐）
 * SSOT：reference/create-defaults.md §3
 */
import { normalizeStructuredDescription, descriptionForConfirmCell } from './description-format.mjs';
import { applyDefectTypeToIntent } from './defect-type.mjs';

export const TRACK_CONTENT_REFINE = 'content_refine';
export const MAX_REFINE_TITLE_LEN = 40;
export const MIN_REFINE_SOURCE_LEN = 200;
export const MIN_REFINE_SOURCE_WITH_SIGNALS = 80;

export function forceUserInputTrack(text) {
  return /原样创建|原样写入|不要提炼/.test(String(text || ''));
}

export function forceContentRefineTrack(text) {
  return /提炼|根据以下内容|根据需求文档|帮我总结|帮我提炼|摘要生成/.test(String(text || ''));
}

export function countDocStructureSignals(text) {
  const t = String(text || '');
  let n = 0;
  if (/需求编号|REQ-\d{8}-\d+|优先级\s*[:：]|状态\s*[:：]/.test(t)) n += 1;
  if (/CRUD|验收标准|用户故事|复现步骤|现象|预期|实际/.test(t)) n += 1;
  if (/^[\s]*\d+\.\s+/m.test(t)) n += 1;
  if (t.split(/\r?\n/).filter((l) => l.trim()).length >= 8) n += 1;
  if (/【[^】]+】/.test(t)) n += 1;
  return n;
}

export function isContentRefineCandidate({ raw = '', sourceContent = null, parseMeta = {} }) {
  if (forceUserInputTrack(raw)) return false;
  const src = String(sourceContent || '').trim();
  if (!src) return false;
  if (parseMeta.title_source === 'keyword' || parseMeta.description_source === 'keyword') {
    return forceContentRefineTrack(raw);
  }
  if (forceContentRefineTrack(raw)) return true;
  if (src.length >= MIN_REFINE_SOURCE_LEN) return true;
  if (src.length >= MIN_REFINE_SOURCE_WITH_SIGNALS && countDocStructureSignals(src) >= 2) return true;
  return false;
}

export function clampRefineTitle(title, maxLen = MAX_REFINE_TITLE_LEN) {
  const s = String(title || '').trim();
  if (!s) return s;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

/**
 * @param {object} intent
 * @param {{ title: string, description?: string, defectType?: string|null }} fields
 */
export function applyRefineToIntent(intent, { title, description, defectType = undefined }) {
  const t = clampRefineTitle(title);
  if (!t) throw new Error(`提炼标题不能为空且须 ≤${MAX_REFINE_TITLE_LEN} 字`);
  if (t.length > MAX_REFINE_TITLE_LEN) {
    throw new Error(`提炼标题须 ≤${MAX_REFINE_TITLE_LEN} 字（当前 ${t.length} 字）`);
  }
  const desc = description != null ? normalizeStructuredDescription(description) : '';
  if (!desc) throw new Error('提炼描述不能为空');

  const next = {
    ...intent,
    track: TRACK_CONTENT_REFINE,
    title: t,
    description: desc,
    description_for_confirm: descriptionForConfirmCell(desc),
    refine_status: 'done',
    _parse: {
      ...(intent._parse || {}),
      track: TRACK_CONTENT_REFINE,
      title_source: 'content_refined',
      description_source: 'content_refined',
    },
  };

  return applyDefectTypeToIntent(next, {
    defectType,
    corpus: [t, desc, intent.source_content].filter(Boolean).join('\n'),
  });
}
