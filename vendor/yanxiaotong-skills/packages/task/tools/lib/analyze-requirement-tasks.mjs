/**
 * 无用户 NL 时：分析所属需求 → 推断任务数 + 生成各任务标题/描述（v0.6）
 * SSOT：reference/create-defaults.md §4.2
 */
import {
  MAX_CREATE_COUNT,
  stripHtmlToPlain,
  extractBusinessOverviewSummary,
} from './parse-create-intent.mjs';

const TITLE_MAX = 80;

/**
 * 从需求正文提取可拆分工作项（CRUD 条目 / 编号小节）
 */
export function extractRequirementWorkItems(reqDescription) {
  const plain = stripHtmlToPlain(reqDescription);
  if (!plain) return [];

  const crud = [...plain.matchAll(/([CRUD])（([^）]+)）[:：]?\s*([^。]*)。/g)]
    .map((m) => `${m[1]}（${m[2]}）${m[3].trim()}。`)
    .filter((s) => {
      const body = s.replace(/^[CRUD]（[^）]+）[:：]?\s*/, '').replace(/。$/, '').trim();
      return body.length >= 1 || /^[CRUD]（[^）]+）/.test(s);
    });
  if (crud.length >= 2) return crud;

  const numbered = [...plain.matchAll(/(?:^|\s)\d+\.\s*[^。\d]{4,}?(?:。|$)/gm)].map((m) =>
    m[0].trim(),
  );
  if (numbered.length >= 2) return numbered;

  return [];
}

export function inferCreateCountFromRequirement(req) {
  const ph = Number(req?.plannedHours);
  if (Number.isFinite(ph) && ph > 1) {
    return {
      count: Math.min(MAX_CREATE_COUNT, Math.ceil(ph)),
      source: 'planned_hours',
      hint: `需求计划工期 ${ph} 人天`,
    };
  }
  const sp = Number(req?.storyPoint);
  if (Number.isFinite(sp) && sp > 1) {
    return {
      count: Math.min(MAX_CREATE_COUNT, Math.ceil(sp)),
      source: 'story_point',
      hint: `需求故事点 ${sp}`,
    };
  }
  const workItems = extractRequirementWorkItems(req?.description);
  if (workItems.length > 1) {
    return {
      count: Math.min(MAX_CREATE_COUNT, workItems.length),
      source: 'req_work_items',
      hint: `需求范围拆分为 ${workItems.length} 项`,
    };
  }
  return { count: 1, source: 'default', hint: null };
}

function summarizeWorkItemTitle(workItem, reqTitle, index, total) {
  const t = String(workItem || '').trim();
  const crud = t.match(/^([CRUD])（([^）]+)）[:：]?\s*(.+)/);
  if (crud) {
    const label = crud[2].trim();
    const rest = crud[3].replace(/[。；;].*$/, '').trim();
    const title = rest && rest.length > 1 ? `${label}：${rest}` : label;
    return title.slice(0, TITLE_MAX);
  }
  const numbered = t.replace(/^\d+\.\s*/, '').replace(/[。；;].*$/, '').trim();
  if (numbered) return numbered.slice(0, TITLE_MAX);
  if (total > 1) return `${reqTitle}（子项 ${index}/${total}）`.slice(0, TITLE_MAX);
  return reqTitle.slice(0, TITLE_MAX);
}

export function deriveAnalyzedTitle(overview, reqTitle) {
  const ov = String(overview || '').trim();
  if (ov) {
    const first = ov.split(/[。！？.!?]/)[0]?.trim();
    if (first && first.length >= 6 && first.length <= TITLE_MAX && first !== reqTitle) {
      return first;
    }
  }
  const rt = String(reqTitle || '').trim();
  if (rt.length > 50) {
    return rt.replace(/\/skills技能$/i, '').slice(0, 50);
  }
  return rt ? `推进${rt.slice(0, 40)}` : '迭代开发任务';
}

export function formatAnalyzedTaskDescription(title, overview) {
  const lines = [title];
  const ov = String(overview || '').trim();
  if (ov && ov !== title) lines.push('', ov);
  return lines.join('\n').trim();
}

function buildSingleAnalyzedTask(req) {
  const overview = extractBusinessOverviewSummary(req.description, req.title);
  const title = deriveAnalyzedTitle(overview, req.title);
  const description = formatAnalyzedTaskDescription(title, overview);
  return { title, description };
}

function buildMultiAnalyzedTasks(req, count, workItems) {
  const overview = extractBusinessOverviewSummary(req.description, req.title);
  const items = workItems.length >= count ? workItems.slice(0, count) : workItems;
  const tasks = [];

  for (let i = 0; i < count; i += 1) {
    const workItem = items[i] || overview;
    const title = summarizeWorkItemTitle(workItem, req.title, i + 1, count);
    tasks.push({
      title,
      description: formatAnalyzedTaskDescription(title, overview),
    });
  }
  return tasks;
}

/**
 * @param {object} req R02 需求详情
 * @returns {{ create_count, create_count_source, create_count_hint, tasks, analyzed: true }}
 */
export function analyzeRequirementForTasks(req) {
  const { count, source, hint } = inferCreateCountFromRequirement(req);
  const workItems = extractRequirementWorkItems(req?.description);

  let tasks;
  if (count === 1) {
    tasks = [buildSingleAnalyzedTask(req)];
  } else if (source === 'req_work_items' && workItems.length >= 2) {
    tasks = buildMultiAnalyzedTasks(req, count, workItems);
  } else {
    const overview = extractBusinessOverviewSummary(req.description, req.title);
    tasks = [];
    for (let i = 0; i < count; i += 1) {
      const title = `${deriveAnalyzedTitle(overview, req.title)}（${i + 1}/${count}）`.slice(
        0,
        TITLE_MAX,
      );
      tasks.push({
        title,
        description: formatAnalyzedTaskDescription(title, overview),
      });
    }
  }

  return {
    create_count: count,
    create_count_source: source,
    create_count_hint: hint,
    tasks,
    analyzed: true,
  };
}
