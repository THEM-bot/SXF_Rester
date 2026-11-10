/**
 * 父包入口路由提示（P-359 · Agent 只读，减少手工推断）
 * SSOT 对齐：router/routing-rules.md §意图→子包 · §判定优先级
 */

import { extractIntentPrefix } from './intent-prefix.mjs';
import { normalizePlatformTitledLinks } from './platform-titled-link.mjs';

const OR_URL = /\/(?:app\/)?requirements\/original\/requirement\/\d+/i;
const REQ_URL = /\/(?:pool\/)?requirement\/\d+/i;

const CREATE_REQ_VERBS =
  /创建需求|新建需求|新增需求|提需求|登记需求|创建池内需求|新建池内需求/;

/** 创建/新建原始需求（允许「原始」与「需求」间单字符笔误，如「原始i需求」） */
const CREATE_OR_VERBS =
  /创建原始.?需求|新建原始.?需求|新增原始.?需求|登记原始.?需求/;

/**
 * Demo 意图：只认意图前缀中的 Demo/出包动作，或全文 API 强信号。
 * 禁止仅因正文主题词「Demo演示」命中（与「新建原始需求」正文冲突）。
 */
function isDemoIntent(head, fullText) {
  const h = String(head || '');
  const t = String(fullText || '');
  if (/\bD03\b|\bD04\b/.test(t)) return true;
  if (/打包|出包|上传\s*.*zip|上传.*\.zip/i.test(h)) return true;
  if (/demo|D03|D04/i.test(h)) return true;
  return false;
}

export function resolveRouteHint(userText) {
  const t = normalizePlatformTitledLinks(String(userText || '')).trim();
  if (!t) {
    return { package: null, operation: null, confidence: 'low', reason: 'empty_text' };
  }

  if (/^([1-8])$/.test(t) || /^选\s*[1-8]/.test(t)) {
    const n = t.match(/[1-8]/)?.[0];
    const map = {
      1: 'demo',
      2: 'original-requirement',
      3: 'requirement',
      4: 'task',
      5: 'defect',
      6: 'skill-sync',
      7: 'org-todo',
      8: 'problem-ticket',
    };
    return { package: map[n], operation: null, confidence: 'high', reason: 'menu_number' };
  }

  const head = extractIntentPrefix(t);

  // 原始需求详情 URL + 新建/创建 → 需求池（自动关联 OR；优先于泛化「创建需求」）
  if (OR_URL.test(t) && /创建|新建/.test(t)) {
    return { package: 'requirement', operation: 'create', confidence: 'high', reason: 'or_url_create' };
  }

  // 口令：带「原始」→ 原始需求；不带「原始」的「创建/新建需求」→ 需求池（不再 T-REQ-CLARIFY）
  // 优先于正文里的需求 URL /「关联缺陷」弱匹配
  if (CREATE_REQ_VERBS.test(head)) {
    return {
      package: 'requirement',
      operation: 'create',
      confidence: 'high',
      reason: 'create_requirement',
    };
  }

  if (REQ_URL.test(t) && !OR_URL.test(t)) {
    // 对象类型只认意图前缀，避免正文「关联缺陷」误触发
    const typeText = head || t;
    if (/任务|TASK|迭代任务/.test(typeText)) {
      return { package: 'task', operation: 'create', confidence: 'high', reason: 'req_url_task' };
    }
    if (/提缺陷|创建缺陷|新建缺陷|\bBUG\b/i.test(typeText)) {
      return { package: 'defect', operation: 'create', confidence: 'high', reason: 'req_url_defect' };
    }
    if (/创建|新建/.test(typeText) && !/任务|缺陷|BUG/i.test(typeText)) {
      return {
        package: null,
        operation: null,
        confidence: 'medium',
        reason: 'req_url_ambiguous',
        clarify: 'task_or_defect',
      };
    }
  }

  // 「技能」即可进 skill-sync，不必须说「技能包」；只认意图前缀，避免正文标题误伤
  if (
    /plaza\?skill=|安装技能|更新技能|skill-sync|技能包安装|技能包更新/.test(t) ||
    /技能/.test(head) ||
    /\/api\/open\/skills\/imported\/\d+\/skill-zip/i.test(t) ||
    /\/api\/skills\/plaza\/imported\/\d+\/skill-zip/i.test(t) ||
    /再用它安装|用它依次安装|直接下载安装/.test(t)
  ) {
    const op = /更新|同步|比对/.test(t) && !/安装/.test(t)
      ? 'update'
      : /安装|skill-zip|plaza\?skill=/i.test(t)
        ? 'install'
        : null;
    return { package: 'skill-sync', operation: op, confidence: 'high', reason: 'skill_sync' };
  }

  // 意图前缀「创建/新建原始需求」优先于正文 Demo 主题词（P-412）
  if (CREATE_OR_VERBS.test(head)) {
    return {
      package: 'original-requirement',
      operation: 'create',
      confidence: 'high',
      reason: 'create_original_requirement',
    };
  }

  if (isDemoIntent(head, t)) {
    return { package: 'demo', operation: null, confidence: 'high', reason: 'demo' };
  }

  // 须先于裸「需求」：带「原始」→ 原始需求
  if (/原始.?需求|需求受理|\bOR\b/i.test(head) || /原始需求|需求受理|\bOR-/i.test(t)) {
    return { package: 'original-requirement', operation: null, confidence: 'high', reason: 'original_requirement' };
  }

  // 不带「原始」的「需求」/ 需求池 URL / REQ- → 需求池（「读取需求详情」须直通，勿出首屏）
  if (
    /REQ-|需求池|池内需求|故事点/.test(t) ||
    /\/(?:app\/)?requirements\/pool\/requirement\/\d+/i.test(t) ||
    /需求/.test(head)
  ) {
    return { package: 'requirement', operation: null, confidence: 'high', reason: 'requirement_pool' };
  }

  if (/TASK-|迭代任务|创建任务|新建任务/.test(t)) {
    return { package: 'task', operation: null, confidence: 'high', reason: 'task' };
  }

  if (/TD-|提缺陷|创建缺陷|新建缺陷|迭代缺陷|\bBUG\b/i.test(t)) {
    return { package: 'defect', operation: null, confidence: 'high', reason: 'defect' };
  }

  // 组织待办：须「组织待办」或 OT- 前缀；裸「待办」不命中
  if (/\bOT-\d{8}-\d+/i.test(t) || /组织待办|组织级待办/.test(t)) {
    let operation = null;
    if (/创建|新建/.test(head)) operation = 'create';
    else if (/追加进展|写进展|补充进展/.test(t)) operation = 'append-progress';
    else if (/改|更新|修改|闭环|挂起|作废|处理中/.test(t) && /\bOT-/i.test(t)) operation = 'update';
    else if (/\bOT-/i.test(t) && /查|详情|查看/.test(t)) operation = 'detail';
    else if (/按负责人|列待办|列表|有哪些/.test(t)) operation = 'list';
    return { package: 'org-todo', operation, confidence: 'high', reason: 'org_todo' };
  }

  // 问题单：须「问题单」或 PRB-；勿与需求池「需求」混淆
  if (/\bPRB-\d{8}-\d+/i.test(t) || /问题单|问题单元数据/.test(t)) {
    let operation = null;
    if (/元数据|获取选项|defaults/.test(t)) operation = 'metadata';
    else if (/创建|新建/.test(head) || /创建问题单|新建问题单/.test(t)) operation = 'create';
    return { package: 'problem-ticket', operation, confidence: 'high', reason: 'problem_ticket' };
  }

  // 仅 CRUD 等仍无对象类型时澄清
  if (/仅.*CRUD|增删改查|^CRUD$/i.test(t)) {
    return { package: null, operation: null, confidence: 'medium', reason: 'ambiguous', clarify: 'T-REQ-CLARIFY' };
  }

  return { package: null, operation: null, confidence: 'low', reason: 'no_match' };
}
