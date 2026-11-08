/**
 * 工作流状态机：阶段定义 / 门禁 / 读写 / Mermaid 渲染。
 * 这是整个 pm-flow 的"唯一事实来源"，SKILL.md 只负责解释，不重复定义阶段。
 */
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA = 2;

/* =======================================================================
 * 阶段定义
 * exit: 门禁（离开本阶段前必须满足）
 *   { type:'file',    path:'master/master-prd.md', hint:'总 PRD 未落盘' }
 *   { type:'anyFile', glob:['demo/*.html'],        hint:'demo 原型未落盘' }
 *   { type:'field',   path:'yxt.parentNo',         hint:'父需求编号未回填' }
 *   { type:'review',  hint:'开发评审仍有未闭环问题' }
 *   { type:'blocker', hint:'存在未解除的卡点' }
 *   { type:'subs',    hint:'子需求尚未拆分' }
 *   { type:'tasks',   hint:'本阶段还有没做完的任务' }
 *
 * tasks: 本阶段的「标准任务清单」，init 时按清单播种成真实任务行。
 *   每条 = { tpl, title, who, hint?, optional? }
 *   tpl 是模板键：同一个 key 在不同阶段可以复用，任务 id 由阶段+tpl 决定。
 *   who = 这条任务卡在谁手上（角色，不记具体人/期限）。
 * ======================================================================= */

export const PROJECT_STAGES = [
  {
    key: 'P1_INTAKE',
    icon: '①',
    name: '收料',
    goal: '把会议纪要 / 业务文档 / demo / 立项报告 收齐，判断大需求还是小需求',
    do: '让用户把原件放进 原材料/，用 pmw digest 转成 Markdown；缺什么列清',
    exit: [],
    tasks: [
      { tpl: 'collect-minutes', title: '收齐会议纪要', who: '我' },
      { tpl: 'collect-bizdoc', title: '收业务文档 / 需求描述', who: '我' },
      { tpl: 'collect-existing', title: '收 demo / 立项报告 / 旧系统材料', who: '我', optional: true },
      { tpl: 'decide-kind', title: '判断走大需求还是小需求', who: '我' },
    ],
  },
  {
    key: 'P2_DISCOVERY',
    icon: '②',
    name: '需求梳理与业务对齐',
    goal: '从纪要+业务文档抽出真实诉求、角色、场景、边界；把不懂的问业务问清楚',
    do: '生成「澄清清单」，逐条问业务；答完把结论写进 discover.md',
    exit: [{ type: 'file', path: 'discover.md', hint: '需求梳理结论（discover.md）未落盘' }],
    tasks: [
      { tpl: 'extract-asks', title: '从纪要抽出真实诉求', who: '我' },
      { tpl: 'extract-roles', title: '列出涉及的角色与场景', who: '我' },
      { tpl: 'scope-boundary', title: '圈出本次范围与不做的部分', who: '我' },
      { tpl: 'ask-biz-unknown', title: '把不懂的地方逐条问业务', who: '业务' },
      { tpl: 'write-discover', title: '把结论写进 discover.md', who: '我' },
    ],
  },
  {
    key: 'P3_MASTER_PRD',
    icon: '③',
    name: '总 PRD',
    goal: '写出一份主管和开发都能看懂的总方案：价值 + 范围 + 模块 + 关键规则',
    do: '按模板起草 master/master-prd.md；价值段给主管，规则段给开发',
    exit: [{ type: 'file', path: 'master/master-prd.md', hint: '总 PRD 未落盘' }],
    tasks: [
      { tpl: 'value-section', title: '写价值与使用场景（给主管看）', who: '我' },
      { tpl: 'module-outline', title: '列模块清单与职责边界', who: '我' },
      { tpl: 'key-rules', title: '写关键业务规则与字段口径', who: '我' },
      { tpl: 'confirm-scope-exec', title: '找主管过一遍范围与投入', who: '主管' },
    ],
  },
  {
    key: 'P4_MODULE_SPLIT',
    icon: '④',
    name: '拆模块 / 拆子需求',
    goal: '总 PRD → 模块 → 可独立排期验收的子需求；每条的依赖、阶段、验收口径都定下来',
    do: 'pmw split 生成骨架，再补内容；pmw check 校验与总 PRD 对得上',
    exit: [
      { type: 'subs', hint: '还没有任何子需求，先用 pmw split 拆' },
      { type: 'file', path: 'modules/index.md', hint: '模块/子需求索引（modules/index.md）未生成' },
    ],
    tasks: [
      { tpl: 'split-modules', title: '按 demo 功能模块拆模块', who: '我' },
      { tpl: 'split-subs', title: '每个模块拆成可独立验收的子需求', who: '我' },
      { tpl: 'deps-order', title: '定依赖顺序与批次', who: '我' },
      { tpl: 'confirm-split', title: '跟开发确认拆分粒度合理', who: '开发' },
    ],
  },
  {
    key: 'P5_MODULE_PRD',
    icon: '⑤',
    name: '模块 PRD / 子 PRD',
    goal: '每个子需求都有能独立交付的 PRD（按任务顺序写功能流，不是 CRUD 清单）',
    do: '逐个模块写 modules/MOD-xx/module-prd.md，逐个子需求写 subs/<ID>/prd.md',
    exit: [{ type: 'subPrds', hint: '仍有子需求没有 prd.md' }],
    tasks: [
      { tpl: 'module-prd', title: '写模块合集 PRD', who: '我' },
      { tpl: 'sub-prd', title: '逐个写子需求 PRD（按任务顺序）', who: '我' },
      { tpl: 'sub-ac', title: '每条子需求写可核对的验收标准', who: '我' },
      { tpl: 'scenario-walk', title: '按正常/异常/边界场景走一遍', who: '我' },
    ],
  },
  {
    key: 'P6_DEMO',
    icon: '⑥',
    name: 'Demo 原型',
    goal: '可点 HTML 原型跑通每个模块主流程，给开发和主管看',
    do: '在 demo/ 里按模块生成页面；pmw check 校验 demo 页面与模块一一对应',
    exit: [{ type: 'anyFile', glob: ['demo/*.html'], hint: '还没有任何 demo 页面' }],
    tasks: [
      { tpl: 'demo-pages', title: '写每个模块的可点原型页', who: '我' },
      { tpl: 'demo-scenario', title: '按场景补分支页面（异常/边界）', who: '我' },
      { tpl: 'show-boss', title: '给主管/开发演示一遍', who: '主管' },
      { tpl: 'demo-changelog', title: '写 demo 改动说明给开发', who: '我' },
    ],
  },
  {
    key: 'P7_PUBLISH',
    icon: '⑦',
    name: '发布到研效通 + 企微',
    goal: '父需求 + 各子需求进需求池，Word 附件传上去，企微文档同步',
    do: 'pmw sync plan 看差异 → 逐条建需求 → 回填 REQ 编号 → 在 Web 补上级需求/传附件',
    exit: [
      { type: 'field', path: 'yxt.parentNo', hint: '父需求编号（yxt.parentNo）未回填' },
      { type: 'subSynced', hint: '仍有子需求未推送到需求池' },
    ],
    tasks: [
      { tpl: 'publish-parent', title: '建父需求并回填编号', who: '我' },
      { tpl: 'publish-subs', title: '批量建子需求', who: '我' },
      { tpl: 'web-parent', title: '在 Web 手工设上级需求', who: '我' },
      { tpl: 'web-attach', title: '在 Web 手工传 PRD 附件', who: '我' },
      { tpl: 'wecom-sync', title: '企微文档同步', who: '我' },
    ],
  },
  {
    key: 'P8_DEV_REVIEW',
    icon: '⑧',
    name: '开发评审',
    goal: '开发围绕需求提问，产品回答；答不了的转业务确认，直到全部闭环',
    do: 'pmw review add 记录问题；答完 pmw review answer；要问业务的 pmw review defer',
    exit: [{ type: 'review', hint: '开发评审仍有未闭环问题（open / deferred）' }],
    tasks: [
      { tpl: 'review-meeting', title: '开评审会，逐条记录问题', who: '我' },
      { tpl: 'review-answer', title: '能答的当场答 / 会后补答', who: '我' },
      { tpl: 'review-defer', title: '答不了的转业务确认', who: '业务' },
      { tpl: 'review-close', title: '回收开发确认，逐条闭环', who: '开发' },
    ],
  },
  {
    key: 'P9_BUILD',
    icon: '⑨',
    name: '开发中 + 改动说明',
    goal: 'PRD / demo 变更要留改动说明并同步给开发，不能悄悄改',
    do: '每次改完 pmw sync plan 看差异，写 changelog.md，再 push',
    exit: [],
    tasks: [
      { tpl: 'dev-inprogress', title: '开发实现中（跟进 blocker）', who: '开发' },
      { tpl: 'change-note', title: '每次改 PRD/demo 写改动说明', who: '我' },
      { tpl: 'repush', title: '改动后重新推研效通/企微', who: '我' },
      { tpl: 'align-dev', title: '改动跟开发对齐一遍', who: '开发' },
    ],
  },
  {
    key: 'P10_UAT',
    icon: '⑩',
    name: 'UAT / SIT 验收',
    goal: '开发自测完通知业务验收，不通过就回到开发评审',
    do: '记录验收结论与不通过项；不通过 → pmw back P8_DEV_REVIEW',
    exit: [{ type: 'noBlocker', hint: '验收仍有未解除的卡点' }],
    tasks: [
      { tpl: 'uat-notify', title: '通知业务开始验收', who: '我' },
      { tpl: 'uat-run', title: '业务按场景验一遍', who: '业务' },
      { tpl: 'uat-record', title: '记录不通过项与结论', who: '我' },
      { tpl: 'uat-fix', title: '不通过 → 回开发评审重走', who: '开发' },
    ],
  },
  {
    key: 'DONE',
    icon: '✅',
    name: '完成',
    goal: '上线并留档',
    do: '归档：总 PRD / 模块 PRD / demo / 改动说明 / 验收记录',
    exit: [],
    tasks: [{ tpl: 'archive', title: '归档全部产物', who: '我' }],
  },
];

export const REQ_STAGES = [
  {
    key: 'S1_INTAKE',
    icon: '①',
    name: '收料',
    goal: '收齐会议纪要（.docx）、业务文档、口头诉求，判断是小需求还是大需求',
    do: '原件放 原材料/，pmw digest 转 Markdown；如果其实是 0→1 重构，pmw init project 重开',
    exit: [],
    tasks: [
      { tpl: 'collect-minutes', title: '收齐会议纪要', who: '我' },
      { tpl: 'collect-bizdoc', title: '收业务文档 / 需求描述', who: '我' },
      { tpl: 'decide-kind', title: '判断走大需求还是小需求', who: '我' },
    ],
  },
  {
    key: 'S2_ALIGN',
    icon: '②',
    name: '业务对齐',
    goal: '把纪要里没写清的地方问清楚：字段从哪来、取值规则、是否复用、什么算做完',
    do: '列澄清清单逐条问业务，结论写进 align.md',
    exit: [{ type: 'file', path: 'align.md', hint: '业务对齐结论（align.md）未落盘' }],
    tasks: [
      { tpl: 'extract-asks', title: '从纪要抽出真实诉求', who: '我' },
      { tpl: 'scope-boundary', title: '圈出本次范围与不做的部分', who: '我' },
      { tpl: 'ask-biz-unknown', title: '把不懂的地方逐条问业务', who: '业务' },
      { tpl: 'write-discover', title: '把结论写进 align.md', who: '我' },
    ],
  },
  {
    key: 'S3_PRD',
    icon: '③',
    name: 'PRD 起草',
    goal: '一页能说清：背景、范围、字段与规则、验收标准、异常与权限',
    do: '按 templates/small-prd.md 起草 prd.md；简单需求一两页就够',
    exit: [{ type: 'file', path: 'prd.md', hint: 'PRD 未落盘' }],
    tasks: [
      { tpl: 'field-rules', title: '写字段与取值规则', who: '我' },
      { tpl: 'sub-ac', title: '写可核对的验收标准', who: '我' },
      { tpl: 'scenario-walk', title: '按正常/异常/边界场景走一遍', who: '我' },
      { tpl: 'write-discover', title: 'PRD 落盘 prd.md', who: '我' },
    ],
  },
  {
    key: 'S4_DEV_REVIEW',
    icon: '④',
    name: '开发评审',
    goal: '开发提问题 → 产品回答 → 答不了的转业务确认，全部闭环',
    do: 'pmw review add 记问题 / answer 回答 / defer 转业务 / close 关闭',
    exit: [{ type: 'review', hint: '评审仍有未闭环问题' }],
    tasks: [
      { tpl: 'review-meeting', title: '开评审会，逐条记录问题', who: '我' },
      { tpl: 'review-answer', title: '能答的当场答 / 会后补答', who: '我' },
      { tpl: 'review-defer', title: '答不了的转业务确认', who: '业务' },
      { tpl: 'review-close', title: '回收开发确认，逐条闭环', who: '开发' },
    ],
  },
  {
    key: 'S5_FINAL',
    icon: '⑤',
    name: '定稿',
    goal: 'PRD 定稿，未决项要么有结论要么明确挂起并标注',
    do: '清掉 [待确认]，把挂起项写进「待确认」小节；pmw check',
    exit: [{ type: 'noBlocker', hint: '仍有未解除的卡点' }],
    tasks: [
      { tpl: 'clear-pending', title: '清掉 PRD 里的 [待确认]', who: '我' },
      { tpl: 'confirm-scope-exec', title: '找主管/开发确认定稿', who: '开发' },
    ],
  },
  {
    key: 'S6_PUBLISH',
    icon: '⑥',
    name: '发布',
    goal: '需求进需求池，Word 附件挂上，企微文档同步',
    do: 'pmw sync plan → 建需求 → pmw sync commit 回填 REQ 编号',
    exit: [{ type: 'field', path: 'yxt.no', hint: '需求编号（yxt.no）未回填' }],
    tasks: [
      { tpl: 'publish-subs', title: '建需求并回填 REQ 编号', who: '我' },
      { tpl: 'web-attach', title: '在 Web 手工传 PRD 附件', who: '我' },
      { tpl: 'wecom-sync', title: '企微文档同步', who: '我' },
    ],
  },
  {
    key: 'S7_BUILD',
    icon: '⑦',
    name: '开发中',
    goal: '开发实现；需求变更要留改动说明并重新 push',
    do: '改完 pmw sync plan 看差异，写 changelog.md 再发布',
    exit: [],
    tasks: [
      { tpl: 'dev-inprogress', title: '开发实现中（跟进 blocker）', who: '开发' },
      { tpl: 'change-note', title: '每次改 PRD 写改动说明', who: '我' },
      { tpl: 'repush', title: '改动后重新推研效通/企微', who: '我' },
    ],
  },
  {
    key: 'S8_UAT',
    icon: '⑧',
    name: 'UAT / SIT 验收',
    goal: '通知业务验收；不通过回到开发评审',
    do: '记录验收结论；不通过 → pmw back S4_DEV_REVIEW',
    exit: [{ type: 'noBlocker', hint: '验收仍有未解除的卡点' }],
    tasks: [
      { tpl: 'uat-notify', title: '通知业务开始验收', who: '我' },
      { tpl: 'uat-run', title: '业务按场景验一遍', who: '业务' },
      { tpl: 'uat-record', title: '记录不通过项与结论', who: '我' },
      { tpl: 'uat-fix', title: '不通过 → 回开发评审重走', who: '开发' },
    ],
  },
  {
    key: 'DONE',
    icon: '✅',
    name: '完成',
    goal: '上线留档',
    do: '归档 PRD / 改动说明 / 验收记录',
    exit: [],
    tasks: [{ tpl: 'archive', title: '归档全部产物', who: '我' }],
  },
];

export function stagesOf(kind) {
  return kind === 'project' ? PROJECT_STAGES : REQ_STAGES;
}

export function stageIndex(kind, key) {
  const list = stagesOf(kind);
  const i = list.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

export function stageOf(kind, key) {
  const list = stagesOf(kind);
  return list.find((s) => s.key === key) || list[0];
}

export function nextStageKey(kind, key) {
  const list = stagesOf(kind);
  const i = stageIndex(kind, key);
  return i + 1 < list.length ? list[i + 1].key : null;
}

/* ---------------- 读写 ---------------- */

export function stateFile(dir, kind) {
  return path.join(dir, kind === 'project' ? 'project.json' : 'req.json');
}

export function load(dir, kind) {
  const f = stateFile(dir, kind);
  if (!fs.existsSync(f)) throw new Error(`找不到状态文件：${f}（先用 pmw init 初始化）`);
  const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

export function save(dir, state) {
  const kind = state && state.kind;
  if (!state || typeof state !== 'object') {
    throw new Error('内部错误：要保存的状态为空');
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(stateFile(dir, kind || 'req'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

export function getField(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* ---------------- 门禁 ---------------- */

function hasAnyFile(dir, globs) {
  for (const g of globs) {
    const base = path.basename(g);
    const dirPart = path.dirname(g);
    const abs = dirPart === '.' ? path.join(dir, base) : path.join(dir, dirPart);
    if (!fs.existsSync(abs)) continue;
    if (!base.includes('*')) {
      if (fs.statSync(abs).isFile()) return true;
      continue;
    }
    const re = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (fs.readdirSync(abs).some((f) => re.test(f))) return true;
    } else if (re.test(base)) return true;
  }
  return false;
}

/** 返回未通过的检查项数组（空 = 通过） */
export function gateCheck(dir, state) {
  const kind = state.kind;
  const stage = stageOf(kind, state.stage);
  const failed = [];

  for (const chk of stage.exit) {
    switch (chk.type) {
      case 'file':
        if (!fs.existsSync(path.join(dir, chk.path))) failed.push({ ...chk, actual: `缺少 ${chk.path}` });
        break;
      case 'anyFile':
        if (!hasAnyFile(dir, chk.glob)) failed.push({ ...chk, actual: `缺少 ${chk.glob.join(' / ')}` });
        break;
      case 'field':
        if (!getField(state, chk.path)) failed.push({ ...chk, actual: `${chk.path} 为空` });
        break;
      case 'review': {
        const open = (state.reviews || []).filter((r) => r.status === 'open' || r.status === 'deferred');
        if (open.length) failed.push({ ...chk, actual: `${open.length} 条未闭环` });
        break;
      }
      case 'blocker': {
        const b = (state.blockers || []).filter((x) => !x.resolvedAt);
        if (b.length) failed.push({ ...chk, actual: `${b.length} 个卡点` });
        break;
      }
      case 'noBlocker': {
        const b = (state.blockers || []).filter((x) => !x.resolvedAt);
        if (b.length) failed.push({ ...chk, actual: `${b.length} 个卡点` });
        break;
      }
      case 'subs':
        if (!(state.subs || []).length) failed.push({ ...chk, actual: '子需求列表为空' });
        break;
      case 'subPrds': {
        const missing = (state.subs || []).filter((s) => !fs.existsSync(path.join(dir, s.path, 'prd.md')));
        if (missing.length) failed.push({ ...chk, actual: `缺 prd.md：${missing.map((m) => m.id).join('、')}` });
        break;
      }
      case 'subSynced': {
        const missing = (state.subs || []).filter((s) => !(s.yxt && s.yxt.no));
        if (missing.length) failed.push({ ...chk, actual: `未回填 REQ：${missing.map((m) => m.id).join('、')}` });
        break;
      }
      default:
        break;
    }
  }
  return failed;
}

/* ---------------- Mermaid ---------------- */

export function toMermaid(state) {
  const kind = state.kind;
  const list = stagesOf(kind);
  const cur = stageIndex(kind, state.stage);
  const blockedIds = (state.blockers || []).filter((b) => !b.resolvedAt).map((b) => b.scope);
  const isBlocked = blockedIds.length > 0;

  const id = (i) => `S${i}`;
  const label = (s, i) => {
    const mark = i < cur ? ' ✓' : i === cur ? ' ◀ 当前' : '';
    return `${s.icon} ${s.name}${mark}`;
  };

  const lines = ['flowchart TD'];
  list.forEach((s, i) => {
    lines.push(`  ${id(i)}["${label(s, i)}"]`);
  });
  for (let i = 0; i < list.length - 1; i += 1) {
    lines.push(`  ${id(i)} --> ${id(i + 1)}`);
  }
  // 回退边
  const backEdges = {
    P8_DEV_REVIEW: [['业务/开发答不上 → 回业务对齐', 1]],
    P10_UAT: [['验收不通过 → 回开发评审', 7]],
    S4_DEV_REVIEW: [['需业务确认 → 回业务对齐', 1]],
    S8_UAT: [['验收不通过 → 回开发评审', 3]],
  };

  list.forEach((s, i) => {
    const cls = i < cur ? 'done' : i === cur ? (isBlocked ? 'blocked' : 'current') : 'pending';
    lines.push(`  class ${id(i)} ${cls}`);
    for (const [text, target] of backEdges[s.key] || []) {
      lines.push(`  ${id(i)} -. "${text}" .-> ${id(target)}`);
    }
  });

  lines.push(
    '  classDef done fill:#d3f9d8,stroke:#2f9e44,color:#1b4332',
    '  classDef current fill:#fff3bf,stroke:#f08c00,stroke-width:3px,color:#663c00',
    '  classDef blocked fill:#ffe3e3,stroke:#e03131,stroke-width:3px,color:#c92a2a',
    '  classDef pending fill:#f1f3f5,stroke:#ced4da,color:#495057',
  );
  return lines.join('\n');
}

/* ---------------- 任务（tasks） ---------------- */

const TASK_STATUSES = ['todo', 'doing', 'done', 'blocked'];

export const BRANCH_KINDS = ['module', 'scenario'];

/**
 * 播种：按当前阶段（或指定阶段）的标准任务清单生成真实任务行。
 * 幂等——已有同 stage+tpl+branch 的任务不会重复建。
 */
export function seedTasks(state, stageKey) {
  state.tasks = state.tasks || [];
  const kind = state.kind;
  const stages = stageKey ? [stageOf(kind, stageKey)] : stagesOf(kind);
  const added = [];
  for (const s of stages) {
    for (const t of s.tasks || []) {
      const exists = state.tasks.some(
        (x) => x.stage === s.key && x.tpl === t.tpl && (x.branch || null) === null,
      );
      if (exists) continue;
      const item = {
        id: nextTaskId(state),
        stage: s.key,
        tpl: t.tpl,
        title: t.title,
        who: t.who,
        status: 'todo',
        branch: null,
        branchKind: null,
        from: 'tpl',
        note: '',
        optional: Boolean(t.optional),
        at: new Date().toISOString(),
        doneAt: null,
      };
      state.tasks.push(item);
      added.push(item);
    }
  }
  return added;
}

function nextTaskId(state) {
  state.tasks = state.tasks || [];
  let max = 0;
  for (const t of state.tasks) {
    const m = /^T(\d+)$/.exec(t.id || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T${String(max + 1).padStart(3, '0')}`;
}

export function addTask(state, { stage, title, who = '我', branch = null, branchKind = null, from = 'ai', note = '' }) {
  state.tasks = state.tasks || [];
  const key = stage || state.stage;
  stageOf(state.kind, key); // 校验阶段名合法
  const item = {
    id: nextTaskId(state),
    stage: key,
    tpl: null,
    title: String(title || '').trim(),
    who: String(who || '我').trim() || '我',
    status: 'todo',
    branch: branch || null,
    branchKind: branchKind || (branch ? 'module' : null),
    from,
    note: note || '',
    optional: false,
    at: new Date().toISOString(),
    doneAt: null,
  };
  state.tasks.push(item);
  return item;
}

export function findTask(state, id) {
  const t = (state.tasks || []).find((x) => x.id === id);
  if (!t) throw new Error(`找不到任务 ${id}（用 pmw task list 看现有任务）`);
  return t;
}

export function setTaskStatus(state, id, status, note) {
  const t = findTask(state, id);
  if (!TASK_STATUSES.includes(status)) {
    throw new Error(`任务状态只能是 ${TASK_STATUSES.join(' / ')}，收到 ${status}`);
  }
  t.status = status;
  t.doneAt = status === 'done' ? new Date().toISOString() : null;
  if (note !== undefined && note !== '') t.note = note;
  return t;
}

export function tasksOf(state, { stage, who, status, branch } = {}) {
  return (state.tasks || []).filter(
    (t) =>
      (!stage || t.stage === stage) &&
      (!who || t.who === who) &&
      (!status || t.status === status) &&
      (!branch || t.branch === branch),
  );
}

/** 按分支聚合：无分支的放 '' 组 */
export function taskBranches(state, stageKey) {
  const list = tasksOf(state, stageKey ? { stage: stageKey } : {});
  const map = new Map();
  for (const t of list) {
    const k = t.branch || '';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return map;
}

/* ---------------- 分支（支线） ---------------- */

/** 从模块/子需求派生分支名：MOD-01 或 BG-01 */
export function autoBranches(state) {
  const out = [];
  for (const s of state.subs || []) {
    out.push({ name: s.id, kind: 'module', title: s.title });
  }
  for (const m of state.modules || []) {
    out.push({ name: m.id, kind: 'module', title: m.title });
  }
  return out;
}

/** 「该找谁确认」汇总：谁 → 需要他确认的事项清单 */
export function pendingByWho(state) {
  const map = new Map();
  const push = (who, text, ref) => {
    const k = who || '我';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ text, ref });
  };
  for (const t of state.tasks || []) {
    if (t.status === 'done') continue;
    if (t.who && t.who !== '我') push(t.who, t.title, t.id);
  }
  for (const r of state.reviews || []) {
    if (r.status === 'deferred') push(r.deferredTo || r.to || '业务', r.text || r.question || r.id, `#${r.id}`);
    else if (r.status === 'open' && (r.to || r.deferredTo)) {
      push(r.deferredTo || r.to, r.text || r.question || r.id, `#${r.id}`);
    }
  }
  for (const b of state.blockers || []) {
    if (!b.resolvedAt) push(b.who || b.to || '我', b.text || b.reason || b.scope || '', b.id || '');
  }
  return map;
}

/* ---------------- 任务链路图 ---------------- */

const STATUS_ICON = { done: '✓', doing: '▶', todo: '○', blocked: '✗' };

/**
 * 当前阶段的任务图：中心节点是阶段目标，下面按分支挂任务。
 * 有分支 → 每个分支一个 subgraph；无分支任务直接挂在阶段下。
 */
export function toTaskMermaid(state, stageKey) {
  const kind = state.kind;
  const key = stageKey || state.stage;
  const stage = stageOf(kind, key);
  const list = tasksOf(state, { stage: key });
  if (!list.length) {
    return `flowchart TD\n  G["${stage.icon} ${stage.name}（还没有任务，用 pmw task add 加一条）"]`;
  }

  const lines = ['flowchart LR'];
  const esc = (s) => String(s || '').replace(/["\r\n]/g, ' ').replace(/\|/g, '/');
  const branches = new Map();
  const plain = [];
  for (const t of list) {
    if (t.branch) {
      if (!branches.has(t.branch)) branches.set(t.branch, []);
      branches.get(t.branch).push(t);
    } else plain.push(t);
  }

  const nodeLabel = (t) => {
    const icon = STATUS_ICON[t.status] || '○';
    const who = t.who && t.who !== '我' ? ` @${t.who}` : '';
    return `${icon} ${esc(t.title)}${who}`;
  };
  const nodeCls = (t) =>
    t.status === 'done' ? 'done' : t.status === 'doing' ? 'current' : t.status === 'blocked' ? 'blocked' : 'pending';

  let bi = 0;
  for (const [name, items] of branches) {
    bi += 1;
    const gid = `B${bi}`;
    lines.push(`  subgraph ${gid}["分支：${esc(name)}"]`);
    for (const t of items) lines.push(`    ${t.id}["${nodeLabel(t)}"]`);
    lines.push('  end');
  }
  for (const t of plain) {
    lines.push(`  ${t.id}["${nodeLabel(t)}"]`);
  }

  // 阶段目标 → 各分支 / 各任务
  lines.push(`  G["${stage.icon} ${stage.name}<br/>${esc(stage.goal).slice(0, 40)}"]`);
  if (branches.size) {
    let gi = 0;
    for (const _ of branches.keys()) {
      gi += 1;
      lines.push(`  G --> B${gi}`);
    }
  }
  for (const t of plain) lines.push(`  G --> ${t.id}`);

  // 分支内部按顺序串起来（前一条 → 后一条）
  for (const [, items] of branches) {
    for (let i = 0; i < items.length - 1; i += 1) {
      lines.push(`  ${items[i].id} --> ${items[i + 1].id}`);
    }
  }

  for (const t of list) lines.push(`  class ${t.id} ${nodeCls(t)}`);
  lines.push(
    '  classDef done fill:#d3f9d8,stroke:#2f9e44,color:#1b4332',
    '  classDef current fill:#fff3bf,stroke:#f08c00,stroke-width:3px,color:#663c00',
    '  classDef blocked fill:#ffe3e3,stroke:#e03131,stroke-width:3px,color:#c92a2a',
    '  classDef pending fill:#f1f3f5,stroke:#ced4da,color:#495057',
  );
  return lines.join('\n');
}

/** 全部阶段的任务进度一览（给面板顶部的条） */
export function taskRollup(state) {
  const kind = state.kind;
  const out = [];
  for (const s of stagesOf(kind)) {
    const list = tasksOf(state, { stage: s.key });
    if (!list.length) continue;
    const done = list.filter((t) => t.status === 'done').length;
    out.push({
      stage: s.key,
      name: s.name,
      icon: s.icon,
      total: list.length,
      done,
      blocked: list.filter((t) => t.status === 'blocked').length,
      current: s.key === state.stage,
    });
  }
  return out;
}

/* ---------------- 汇总 ---------------- */

export function summarize(dir, state) {
  const kind = state.kind;
  const list = stagesOf(kind);
  const cur = stageIndex(kind, state.stage);
  const failed = gateCheck(dir, state);
  const openReviews = (state.reviews || []).filter((r) => r.status === 'open' || r.status === 'deferred');
  const blockers = (state.blockers || []).filter((b) => !b.resolvedAt);
  const curTasks = tasksOf(state, { stage: state.stage });
  const whoMap = pendingByWho(state);
  return {
    id: state.id,
    title: state.title,
    kind,
    stage: state.stage,
    stageName: list[cur].name,
    progress: `${cur + 1}/${list.length}`,
    next: nextStageKey(kind, state.stage),
    canAdvance: failed.length === 0,
    gateFailures: failed,
    openReviews,
    blockers,
    subs: (state.subs || []).map((s) => ({
      id: s.id,
      title: s.title,
      module: s.module || null,
      yxtNo: s.yxt ? s.yxt.no : null,
    })),
    tasks: {
      current: curTasks,
      todo: curTasks.filter((t) => t.status === 'todo' || t.status === 'doing'),
      done: curTasks.filter((t) => t.status === 'done'),
      blocked: curTasks.filter((t) => t.status === 'blocked'),
      rollup: taskRollup(state),
    },
    pendingByWho: [...whoMap.entries()].map(([who, items]) => ({ who, items })),
    reflect: state.reflect
      ? {
          round: state.reflect.round,
          stage: state.reflect.stage,
          by: state.reflect.by || 'ai',
          focus: state.reflect.focus || '',
          open: (state.reflect.findings || []).filter((f) => f.status === 'open').length,
          total: (state.reflect.findings || []).length,
          closed: Boolean(state.reflect.closedAt),
        }
      : null,
    reroute: state.reroute
      ? {
          at: state.reroute.at,
          active: (state.reroute.proposals || []).filter((p) => !p.dismissed).length,
          proposals: (state.reroute.proposals || []).filter((p) => !p.dismissed),
        }
      : null,
  };
}
