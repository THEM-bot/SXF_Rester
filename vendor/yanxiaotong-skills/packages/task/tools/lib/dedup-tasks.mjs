/**
 * 需求分析轨：拉取已有任务 + 组装 AI 去重上下文（v0.7）
 * SSOT：reference/create-defaults.md §4.2.2
 */
import { stripHtmlToPlain } from './parse-create-intent.mjs';

const PAGE_SIZE = 50;

function slimExistingTask(record) {
  const desc = record.description;
  return {
    taskId: record.taskId != null ? String(record.taskId) : '',
    taskNo: record.taskNo || '',
    title: record.title || '',
    description: typeof desc === 'string' && desc.includes('<')
      ? stripHtmlToPlain(desc)
      : String(desc || ''),
    status: record.status || '',
  };
}

function slimProposedTask(task, index) {
  return {
    proposed_index: index,
    title: task.title || '',
    description: task.description || '',
  };
}

/**
 * 分页拉取需求下全部任务（T03）
 */
export async function fetchAllTasksForRequirement(requirementId, { token, httpJson }) {
  const all = [];
  let current = 1;

  while (true) {
    const result = await httpJson('POST', '/api/open/tasks/findPage', {
      token,
      body: {
        current,
        size: PAGE_SIZE,
        requirementId: String(requirementId),
      },
    });
    const data = result.data || {};
    const records = data.records || [];
    all.push(...records);

    const total = Number(data.total);
    if (!Number.isFinite(total) || all.length >= total || records.length === 0) {
      break;
    }
    current += 1;
  }

  return all.map(slimExistingTask);
}

/**
 * 机侧标题归一化（去重预筛 · P-281）
 */
export function normalizeTitleForDedup(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。．.；;：:、\-—_（）()【】\[\]]/g, '');
}

/**
 * 描述词集合重叠率（去重预筛 · P-316）
 */
export function descriptionOverlapRatio(a, b) {
  const tokenize = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter += 1;
  }
  return inter / Math.min(sa.size, sb.size);
}

/**
 * 机侧预筛：标题归一化后完全相等，或一方包含另一方（长度≥6）；描述高重叠可升档
 */
export function findMachineDedupMatches(proposedTitle, existingTasks, proposedDescription = '') {
  const norm = normalizeTitleForDedup(proposedTitle);
  if (!norm || norm.length < 2) return [];
  const matches = [];
  for (const ex of existingTasks || []) {
    const exNorm = normalizeTitleForDedup(ex.title);
    if (!exNorm) continue;
    const descOverlap = descriptionOverlapRatio(proposedDescription, ex.description);
    if (norm === exNorm) {
      matches.push({
        taskNo: ex.taskNo,
        reason: '标题归一化后完全相同',
        confidence: 'high',
        desc_overlap: descOverlap,
      });
      continue;
    }
    if (norm.length >= 6 && exNorm.length >= 6 && (norm.includes(exNorm) || exNorm.includes(norm))) {
      const confidence = descOverlap >= 0.35 ? 'high' : 'medium';
      matches.push({
        taskNo: ex.taskNo,
        reason:
          descOverlap >= 0.35
            ? '标题高度重合且描述词重叠'
            : '标题归一化后高度重合（描述未充分佐证）',
        confidence,
        desc_overlap: descOverlap,
      });
    } else if (descOverlap >= 0.55 && norm.length >= 4 && exNorm.length >= 4) {
      matches.push({
        taskNo: ex.taskNo,
        reason: '描述词高度重叠',
        confidence: 'medium',
        desc_overlap: descOverlap,
      });
    }
  }
  return matches;
}

/**
 * 组装 Agent AI 重合检测输入（机侧预筛 + Agent 复核）
 */
export function buildDedupContext(proposedTasks, existingTasks) {
  const proposed = (proposedTasks || []).map(slimProposedTask);
  const existing = (existingTasks || []).map((t) => ({ ...t }));

  const machine_skipped = [];
  const machine_hints = [];
  const uncertain = [];
  for (const p of proposed) {
    const matches = findMachineDedupMatches(p.title, existing, p.description);
    if (matches.length > 0) {
      const best = matches[0];
      machine_hints.push({
        proposed_index: p.proposed_index,
        proposed_title: p.title,
        existing_taskNo: best.taskNo,
        reason: best.reason,
        confidence: best.confidence,
        desc_overlap: best.desc_overlap,
      });
      if (best.confidence === 'high') {
        machine_skipped.push({
          proposed_index: p.proposed_index,
          existing_taskNo: best.taskNo,
          reason: best.reason,
        });
      } else {
        uncertain.push({
          proposed_index: p.proposed_index,
          proposed_title: p.title,
          existing_taskNo: best.taskNo,
          reason: best.reason,
          action: 'T-TASK-DEDUP-CLARIFY',
        });
      }
    }
  }

  const skippedIndexes = new Set(machine_skipped.map((s) => s.proposed_index));
  const to_create_indexes = proposed
    .filter((p) => !skippedIndexes.has(p.proposed_index))
    .map((p) => p.proposed_index);

  return {
    status: uncertain.length
      ? 'pending_agent_clarify'
      : machine_skipped.length
        ? 'pending_agent_review_with_machine_hints'
        : 'pending_agent_review',
    proposed_tasks: proposed,
    existing_tasks: existing,
    machine_hints,
    uncertain,
    skipped: machine_skipped,
    to_create_indexes,
  };
}

/**
 * 根据 Agent 判定结果过滤 task_items（prepare-create 确认后、T01 前）
 * @param {object} prepared prepare-create 产出
 * @param {Array<{ proposed_index: number, existing_taskNo?: string, reason?: string }>} skipped
 */
export function applyDedupSkips(prepared, skipped = []) {
  const items = prepared.task_items || [];
  if (!items.length) return { ...prepared };

  const skipSet = new Set(
    (skipped || []).map((s) => Number(s.proposed_index)).filter((n) => Number.isFinite(n)),
  );
  const filtered = items.filter((_, i) => !skipSet.has(i));
  const skipList = (skipped || []).map((s) => ({
    proposed_index: s.proposed_index,
    proposed_title: items[s.proposed_index]?.title || '',
    existing_taskNo: s.existing_taskNo || '',
    reason: s.reason || '',
  }));

  return {
    ...prepared,
    task_items: filtered,
    create_count: filtered.length,
    title: filtered[0]?.title || prepared.title,
    description: filtered[0]?.description || prepared.description,
    dedup: {
      ...(prepared.dedup || {}),
      status: 'applied',
      skipped: skipList,
      to_create_indexes: filtered.map((_, i) => i),
    },
    _parse: {
      ...(prepared._parse || {}),
      dedup_applied: true,
      dedup_skipped_count: skipList.length,
    },
  };
}
