/**
 * intent + 需求详情 → T01 body 列表
 */
import { stringifyFields } from './task-tools.mjs';

const LONG_ID_FIELDS = ['requirementId'];

export function buildCreateBodies(prepared) {
  const intent = prepared || {};

  if (Array.isArray(intent.task_items) && intent.task_items.length > 0) {
    const bodies = [];
    for (const item of intent.task_items) {
      if (!item?.title) throw new Error('任务标题不能为空');
      const body = {
        title: item.title,
        taskPhase: intent.taskPhase,
        taskCategory: intent.taskCategory,
        requirementId: String(intent.requirementId),
        plannedStartDate: intent.plannedStartDate,
        plannedEndDate: intent.plannedEndDate,
        plannedStartPeriod: intent.plannedStartPeriod || 'PM',
        plannedEndPeriod: intent.plannedEndPeriod || 'PM',
        estimatedHours: intent.estimatedHours ?? 1,
      };
      if (item.description) body.description = item.description;
      bodies.push(stringifyFields(body, LONG_ID_FIELDS));
    }
    return bodies;
  }

  const n = intent.create_count || 1;
  const baseTitle = intent.title;
  if (!baseTitle) throw new Error('任务标题不能为空');

  const bodies = [];
  for (let i = 1; i <= n; i += 1) {
    let title = baseTitle;
    if (n > 1) title = `${baseTitle}（${i}/${n}）`;
    const body = {
      title,
      taskPhase: intent.taskPhase,
      taskCategory: intent.taskCategory,
      requirementId: String(intent.requirementId),
      plannedStartDate: intent.plannedStartDate,
      plannedEndDate: intent.plannedEndDate,
      plannedStartPeriod: intent.plannedStartPeriod || 'PM',
      plannedEndPeriod: intent.plannedEndPeriod || 'PM',
      estimatedHours: intent.estimatedHours ?? 1,
    };
    if (intent.description) body.description = intent.description;
    bodies.push(stringifyFields(body, LONG_ID_FIELDS));
  }
  return bodies;
}
