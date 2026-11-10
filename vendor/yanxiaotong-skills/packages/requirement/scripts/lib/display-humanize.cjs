'use strict';

/** 用户可见字段中文名（Q23 · 机检真源：reference/ui/field-labels.md） */
const { buildWebDetailUrl } = require('../../../../tools/lib/web-detail-url.cjs');

const FIELD_LABELS = Object.freeze({
  requirementNo: '需求编号',
  requirementId: '需求 ID',
  title: '需求标题',
  status: '状态',
  priority: '优先级',
  requirementLevel: '需求层级',
  requirementType: '需求分类',
  businessDomainName: '业务领域',
  projectName: '关联项目',
  appServiceName: '应用/服务',
  responsiblePoName: '负责PO',
  storyPoint: '故事点',
  plannedStartDate: '计划开始',
  plannedEndDate: '计划结束',
  createTime: '创建时间',
  mappingKey: '映射编号',
  originalRequirementId: '关联原始需求 ID',
  originalNo: '关联原始需求编号',
  originalTitle: '关联原始需求',
});

/** R04 白名单字段中文名 */
const UPDATE_FIELD_LABELS = Object.freeze({
  title: '需求标题',
  description: '描述',
  priority: '优先级',
  absolutePriority: '绝对优先级',
  requirementType: '需求分类',
  storyPoint: '故事点',
  plannedStartDate: '计划开始',
  plannedEndDate: '计划结束',
  plannedHours: '计划工时',
  clearPlannedHours: '清除计划工时',
});

/** R04 黑名单字段中文名（T-BLACKLIST-FIELD） */
const BLACKLIST_FIELD_LABELS = Object.freeze({
  businessDomainId: '业务领域',
  projectId: '关联项目',
  appServiceId: '应用/服务',
  requirementLevel: '需求层级',
  status: '状态',
  requirementNo: '需求编号',
  teamId: '特性小组',
  devIterationId: '开发迭代',
  planningIterationId: '规划迭代',
  responsiblePoId: '负责PO',
  developerIds: '开发人员',
  moduleId: '模块',
});

/** Web requirementCategory.ts */
const REQUIREMENT_CATEGORY_LABELS = Object.freeze({
  L1: 'L1 - AI 辅助需求',
  L2: 'L2 - 简单改动需求',
  L3: 'L3 - 全新开发需求',
});

/** @deprecated 别名 · 使用 REQUIREMENT_CATEGORY_LABELS */
const REQUIREMENT_TYPE_LABELS = REQUIREMENT_CATEGORY_LABELS;

/** Web requirementLevel.ts */
const REQUIREMENT_LEVEL_LABELS = Object.freeze({
  Epic: '史诗EPIC',
  Feature: '特性Feature',
  Story: '故事Story',
  epic: '史诗EPIC',
  feature: '特性Feature',
  story: '故事Story',
});

/** API 枚举值 → 用户可见中文 */
const ENUM_LABELS = Object.freeze({
  requirementLevel: REQUIREMENT_LEVEL_LABELS,
  status: {
    草稿: '草稿',
    评审中: '评审中',
    待开发: '待开发',
    开发中: '开发中',
    测试中: '测试中',
    UAT验收: 'UAT验收',
    已完成: '已完成',
    作废: '作废',
    DRAFT: '草稿',
    draft: '草稿',
    REVIEW: '评审中',
    PENDING: '待开发',
    IN_PROGRESS: '开发中',
    TESTING: '测试中',
    UAT: 'UAT验收',
    COMPLETED: '已完成',
    DONE: '已完成',
    done: '已完成',
    CANCELLED: '作废',
    cancelled: '作废',
    CANCELED: '作废',
    canceled: '作废',
  },
});

const DETAIL_FIELD_ORDER = [
  'requirementNo',
  'title',
  'status',
  'priority',
  'requirementLevel',
  'requirementType',
  'businessDomainName',
  'projectName',
  'appServiceName',
  'responsiblePoName',
  'storyPoint',
  'plannedStartDate',
  'plannedEndDate',
  'createTime',
];

function humanizeEnum(field, value) {
  const v = String(value ?? '').trim();
  if (!v) return v;
  const map = ENUM_LABELS[field];
  return (map && map[v]) || v;
}

function humanizeFieldValue(field, value) {
  if (value == null || value === '') return null;
  if (field === 'plannedStartDate' || field === 'plannedEndDate') {
    return String(value).trim();
  }
  if (field === 'requirementLevel' || field === 'status') {
    return humanizeEnum(field, value);
  }
  if (field === 'requirementType') {
    return REQUIREMENT_CATEGORY_LABELS[value] || String(value).trim();
  }
  return String(value).trim();
}

/** API 字段名 → 用户可见中文标签 */
function labelForField(apiField) {
  const k = String(apiField || '').trim();
  return (
    FIELD_LABELS[k] ||
    UPDATE_FIELD_LABELS[k] ||
    BLACKLIST_FIELD_LABELS[k] ||
    k
  );
}

/** 修改成功摘要：body 白名单字段 → 中文标签列表 */
function formatUpdateFieldSummary(body) {
  const b = body || {};
  const labels = [];
  for (const key of Object.keys(b)) {
    if (b[key] === undefined || b[key] === null || b[key] === '') continue;
    if (key === 'requirementType') {
      const t = REQUIREMENT_CATEGORY_LABELS[b[key]] || b[key];
      labels.push(`${UPDATE_FIELD_LABELS.requirementType}（${t}）`);
      continue;
    }
    if (key === 'clearPlannedHours' && b[key]) {
      labels.push(UPDATE_FIELD_LABELS.clearPlannedHours);
      continue;
    }
    const label = UPDATE_FIELD_LABELS[key] || labelForField(key);
    if (label !== key) labels.push(label);
  }
  return labels.length ? labels.join('、') : '（无）';
}

function formatDetailLines(data) {
  const d = data || {};
  const lines = [];
  for (const key of DETAIL_FIELD_ORDER) {
    const val = humanizeFieldValue(key, d[key]);
    if (val == null || val === '') continue;
    if (key === 'plannedStartDate' && d.plannedEndDate) {
      const end = humanizeFieldValue('plannedEndDate', d.plannedEndDate);
      lines.push(`- 计划时间：${val} ~ ${end || '—'}`);
      continue;
    }
    if (key === 'plannedEndDate' && d.plannedStartDate) continue;
    lines.push(`- ${FIELD_LABELS[key]}：${val}`);
  }
  if (d.originalNo || d.originalTitle) {
    const linked =
      d.originalTitle && d.originalNo
        ? `${d.originalTitle}（${d.originalNo}）`
        : d.originalTitle || d.originalNo;
    lines.push(`- 关联原始需求：${linked}`);
  }
  return lines;
}

function formatDetailText(data) {
  const lines = formatDetailLines(data);
  if (!lines.length) return '未找到可展示的需求信息。';
  return ['需求详情：', ...lines].join('\n');
}

/** P-228：单条交付字段与 T-BATCH-CREATE-DONE 行对齐 */
function formatCreateText(data, meta = {}) {
  const d = data || {};
  const m = meta || {};
  const title = m.title || d.title || '—';
  const category = m.requirementType
    ? REQUIREMENT_CATEGORY_LABELS[m.requirementType] || m.requirementType
    : d.requirementType
      ? REQUIREMENT_CATEGORY_LABELS[d.requirementType] || d.requirementType
      : m.categoryLabel || '—';
  const priority = m.priority || d.priority || '—';
  const no = d.requirementNo || '—';
  const id = d.requirementId != null && d.requirementId !== '' ? d.requirementId : '—';
  const detailUrl =
    m.detailUrl || buildWebDetailUrl({ kind: 'requirement', id: d.requirementId, env: m.env });
  const linkLine = detailUrl || '（响应未返回 ID，无法生成链接）';
  const originalNo = d.originalNo || m.originalNo || '';
  const originalTitle = d.originalTitle || m.originalTitle || '';
  const metaRows = [`| 详情链接 | ${linkLine} |`];
  if (originalNo || originalTitle) {
    const linked =
      originalTitle && originalNo
        ? `${originalTitle}（${originalNo}）`
        : originalTitle || originalNo;
    metaRows.push(`| 关联原始需求 | ${linked} |`);
  }
  return [
    '需求已创建：',
    '',
    '| 需求标题 | 需求分类 | 优先级 | 需求编号 | 需求 ID |',
    '| --- | --- | --- | --- | --- |',
    `| ${title} | ${category} | ${priority} | ${no} | ${id} |`,
    '',
    `| 项目 | 内容 |`,
    `| --- | --- |`,
    ...metaRows,
    '',
    '说明：若您有本地文档/规划编号，可能与系统分配编号不同，以 API 返回为准。',
  ].join('\n');
}

/** 批量创建交付（T-BATCH-CREATE-DONE · P-215）
 * items: [{ title, requirementType, priority, requirementNo, requirementId, error }]
 */
function formatBatchCreateText(items) {
  const list = Array.isArray(items) ? items : [];
  const rows = list.map((it, i) => {
    const category = it.requirementType
      ? REQUIREMENT_CATEGORY_LABELS[it.requirementType] || it.requirementType
      : '—';
    const priority = it.priority || '—';
    if (it.error) {
      return `| ${i + 1} | ${it.title || '（无标题）'} | ${category} | ${priority} | 创建失败 | ${it.error} | — |`;
    }
    const link =
      it.detailUrl ||
      buildWebDetailUrl({ kind: 'requirement', id: it.requirementId, env: it.env }) ||
      '—';
    return `| ${i + 1} | ${it.title || '（无标题）'} | ${category} | ${priority} | ${it.requirementNo || '—'} | ${it.requirementId ?? '—'} | ${link} |`;
  });
  return [
    `批量创建完成，共 ${list.length} 条：`,
    '',
    '| # | 需求标题 | 需求分类 | 优先级 | 需求编号 | 需求 ID | 详情链接 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '说明：若您有本地文档/规划编号，可能与系统分配编号不同，以 API 返回为准。',
  ].join('\n');
}

function formatListItem(record, index) {
  const r = record || {};
  const no = r.requirementNo || '—';
  const title = r.title || '（无标题）';
  const status = humanizeFieldValue('status', r.status) || '—';
  const priority = r.priority || '—';
  const level = r.requirementLevel ? humanizeEnum('requirementLevel', r.requirementLevel) : '';
  const suffix = level ? `（${status} · ${priority} · ${level}）` : `（${status} · ${priority}）`;
  return `${index}. ${no} — ${title}${suffix}`;
}

function formatListText(data) {
  const records = data?.records || [];
  const total = data?.total ?? records.length;
  if (!records.length) {
    return '未找到匹配的需求。';
  }
  const lines = records.map((r, i) => formatListItem(r, i + 1));
  return [
    `共找到 ${total} 条（本页展示 ${records.length} 条）：`,
    '',
    ...lines,
    '',
    '需要改/废某条请回复序号。',
  ].join('\n');
}

/** M09 选项展示名（对齐 Web requirementLevel.ts） */
function formatM09OptionLabel(apiValue) {
  return humanizeEnum('requirementLevel', apiValue) || String(apiValue || '');
}

/** 序号 1/2/3 → L1/L2/L3 */
function requirementCategoryCodeFromPick(pick) {
  const map = { 1: 'L1', 2: 'L2', 3: 'L3' };
  return map[Number(pick)] || null;
}

module.exports = {
  FIELD_LABELS,
  UPDATE_FIELD_LABELS,
  BLACKLIST_FIELD_LABELS,
  REQUIREMENT_CATEGORY_LABELS,
  REQUIREMENT_TYPE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  ENUM_LABELS,
  DETAIL_FIELD_ORDER,
  humanizeEnum,
  humanizeFieldValue,
  labelForField,
  formatUpdateFieldSummary,
  formatDetailText,
  formatCreateText,
  formatBatchCreateText,
  formatListText,
  formatListItem,
  formatM09OptionLabel,
  requirementCategoryCodeFromPick,
};
