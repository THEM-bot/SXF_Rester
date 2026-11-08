/**
 * pm-flow → archify 图规格生成器
 *
 * 为什么在这里做映射，而不是让模型每次手写 JSON：
 *   1. 模型手写 JSON 会飘（列号冲突、泳道不齐、主路径漏节点），archify 的校验器会直接拒
 *   2. 状态是我们自己的数据结构，映射规则应该只有一份，改一次全局生效
 *   3. 生成是纯函数，可以单测
 *
 * archify 的硬约束（schemas/workflow.schema.json，全部实测验证过）：
 *   · col 是 integer 0..5 —— 一张图最多 6 列
 *   · mainPath 里的边必须真实存在，且列号严格递增（回卷要用 return 边并踢出 mainPath）
 *   · edge.variant 只认 default | emphasis | security | dashed
 *   · edge.role   只认 main | branch | async | return | error
 *   · node.type   只认 frontend | backend | database | cloud | security | messagebus | external
 *   · node.icon   只认 calendar clock person briefcase flag moon frontend backend database
 *                 cloud security messagebus external start active waiting decision success
 *                 failure stop neutral none
 *   · sublabel 会被 readability 校验按「至少要多宽的卡片」反算，超过卡片宽度就拒稿
 *
 * 版式决定（踩过坑才定的）：
 *   阶段有 9~11 个，而一张图最多 6 列。早期做法是「每 6 个折一行」，结果折行处那条
 *   return 边要从右下角绕回左上角，横穿整张图，极丑。现在的做法是：
 *     · 每张图最多画 3 行 × 4 列 = 12 个阶段，且**每行都是 4 个**，让折行处的回边
 *       短、垂直、可读（archify 会把它画成右侧回落，不再横穿）
 *     · 行数 = ceil(n/4)，每行用一个泳道承载，泳道标题写「第 N 段 · 首阶段 → 末阶段」
 *     · 未走的阶段不着色（external 灰），走完的绿，当前青，卡住红
 */

const COLS_PER_ROW = 4; // 每行 4 个：折行回边最短，且 4×150px 在面板里放得下
const MAX_ROW = 5; // archify col 上限

/**
 * 阶段状态 → (配色, 角标)。
 * 语义：完成=绿、当前=青（红在 archify 里是风险/例外，当前阶段不该显红）、未到=灰、卡住=红。
 */
const LOOK_OF_STATE = {
  done: { type: 'backend', icon: 'success' },
  current: { type: 'frontend', icon: 'active' },
  blocked: { type: 'security', icon: 'failure' },
  pending: { type: 'external', icon: 'waiting' },
};

/** 任务状态 → (配色, 角标, 状态符) */
const LOOK_OF_TASK = {
  done: { type: 'backend', icon: 'success', mark: '✓' },
  doing: { type: 'frontend', icon: 'active', mark: '▶' },
  blocked: { type: 'security', icon: 'failure', mark: '✗' },
  todo: { type: 'external', icon: 'waiting', mark: '○' },
};

/** 图例换中文，否则 archify 显示 Agent Logic / Policy / Cloud service 这类通用英文 */
const LEGEND_ZH = {
  backend: { label: '已完成' },
  frontend: { label: '进行中' },
  security: { label: '卡住' },
  external: { label: '未开始' },
  cloud: { label: '参考' },
  database: { label: '归档' },
  messagebus: { label: '待确认' },
};

/**
 * archify 的 id 只允许 ASCII（[A-Za-z0-9_-]），但负责人名字是中文。
 * 直接过滤会把「业务」「开发」「我」全压成空串 → 泳道 id 撞车。
 * 所以：ASCII 保留、其余字符用码点十六进制占位，保证可逆且唯一。
 */
function safeId(s, fallback = 'n') {
  const raw = String(s ?? '').trim();
  if (!raw) return fallback;
  let out = '';
  for (const ch of raw) {
    if (/[A-Za-z0-9_-]/.test(ch)) out += ch;
    else out += 'u' + ch.codePointAt(0).toString(16);
  }
  return out || fallback;
}

/** 去掉「① 」圈号前缀和状态符 */
export function stripNo(label) {
  return String(label ?? '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, '')
    .replace(/[✓◀○✗△▶]/g, '')
    .trim();
}

/** 副标题：archify 按像素反算卡片宽度，中文 10 字以内最稳；按标点断句，不留半截 */
function shortGoal(goal, max = 10) {
  const g = String(goal ?? '').trim();
  if (!g) return '';
  const first = g.split(/[，。；、,;：:（(]/)[0].trim();
  if (first.length <= max) return first;
  // 截断时优先在「的/后/前/时/里」后断开，读起来不像被砍掉
  const cut = first.slice(0, max);
  const soft = cut.replace(/[的着过了和后前时里中上下]+$/, '');
  return (soft.length >= 4 ? soft : cut) + '…';
}

/** 按 size 个一行切开 */
function chunk(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

/**
 * 需求流程图规格
 * @param {{title?:string, kind?:string, stageName?:string, progress?:string,
 *          stages:Array<{key,no,name,state,goal}>}} data
 */
export function specFlow(data) {
  const stages = (data?.stages ?? []).filter((s) => s && s.name);
  if (!stages.length) return null;

  const rows = chunk(stages, COLS_PER_ROW);
  const lanes = rows.map((row, i) => ({
    id: `row${i + 1}`,
    label: `第 ${i + 1} 段 · ${stripNo(row[0].name)} → ${stripNo(row[row.length - 1].name)}`,
  }));

  const nodes = [];
  const idAt = (r, c) => safeId(stages[r * COLS_PER_ROW + c].key || `S${r}_${c}`);
  rows.forEach((row, r) => {
    row.forEach((s, c) => {
      const look = LOOK_OF_STATE[s.state] ?? LOOK_OF_STATE.pending;
      nodes.push({
        id: idAt(r, c),
        lane: `row${r + 1}`,
        col: c,
        type: look.type,
        icon: look.icon,
        label: s.no ? `${s.no} ${stripNo(s.name)}` : stripNo(s.name),
        sublabel: shortGoal(s.goal),
        width: 150,
      });
    });
  });

  const edges = [];
  const mainPath = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length - 1; c++) {
      const from = idAt(r, c);
      const to = idAt(r, c + 1);
      edges.push({ from, to, role: 'main', variant: 'default' });
      if (r === 0) {
        if (!mainPath.length) mainPath.push(from);
        mainPath.push(to);
      }
    }
    if (rows[r + 1]?.length) {
      // 折行：上一行末 → 下一行首。必须是 return（列号会回卷），并且不进 mainPath
      edges.push({
        from: idAt(r, row.length - 1),
        to: idAt(r + 1, 0),
        role: 'return',
        variant: 'dashed',
        label: '接着',
      });
    }
  });

  const doneCount = stages.filter((s) => s.state === 'done').length;
  const curIdx = stages.findIndex((s) => s.state === 'current');
  const curName = curIdx >= 0 ? stripNo(stages[curIdx].name) : '';

  const views = [];
  if (curIdx >= 0) {
    const r = Math.floor(curIdx / COLS_PER_ROW);
    views.push({
      id: 'now',
      label: `当前：${curName}`,
      focus: nodes.filter((n) => n.lane === `row${r + 1}`).map((n) => n.id),
      note: `${doneCount}/${stages.length} 已完成`,
    });
  }

  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: {
      title: data.title || '需求流程',
      subtitle: [data.stageName, `已完成 ${doneCount}/${stages.length}`].filter(Boolean).join(' · '),
      output: 'flow.html',
      visual_preset: 'signal-flow',
      quality_profile: 'showcase',
      animation: 'none',
      legend: { mode: 'auto', entries: LEGEND_ZH },
      ...(views.length ? { views } : {}),
    },
    lanes,
    mainPath,
    nodes,
    edges,
  };
}

/**
 * 任务链图规格：泳道 = 负责人，列 = 该人的第几条任务
 * @param {{title?:string, stageName?:string, stage?:string,
 *          tasks:Array<{id,title,who,status,stage}>}} data
 */
export function specTasks(data) {
  // 同一任务可能同时出现在 current / todo / done（current 是「本阶段全部任务」，
  // 另几组是按状态跨阶段索引），必须按 id 去重，否则 archify 报 duplicate-node-id。
  const seen = new Set();
  const all = (data?.tasks ?? []).filter((t) => {
    if (!t || !(t.title || t.text)) return false;
    const k = t.id || t.title || t.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!all.length) return null;

  const cur = all.filter((t) => !data.stage || t.stage === data.stage);
  // 一道泳道最多 6 列，总共最多 6 道 —— 再多就不是一张图能看的东西了
  const list = (cur.length ? cur : all).slice(0, 36);

  const laneMap = new Map();
  for (const t of list) {
    const who = t.who && t.who !== '我' ? t.who : '我';
    if (!laneMap.has(who)) laneMap.set(who, []);
    laneMap.get(who).push(t);
  }
  const whoList = [...laneMap.keys()].sort((a, b) => {
    if (a === '我') return -1;
    if (b === '我') return 1;
    return laneMap.get(b).length - laneMap.get(a).length;
  });

  const laneIdOf = (who) => safeId('w_' + who, 'w');
  const lanes = whoList.slice(0, MAX_ROW + 1).map((who) => ({
    id: laneIdOf(who),
    label: who === '我' ? '我（产品）' : who,
    variant: who === '我' ? 'normal' : 'exception',
  }));

  const nodes = [];
  const edges = [];
  let mainPath = [];
  for (const who of whoList.slice(0, MAX_ROW + 1)) {
    const items = laneMap.get(who).slice(0, MAX_ROW + 1);
    const ids = items.map((t, i) => safeId(t.id || `${who}_${i}`));
    items.forEach((t, i) => {
      const look = LOOK_OF_TASK[t.status] ?? LOOK_OF_TASK.todo;
      nodes.push({
        id: ids[i],
        lane: laneIdOf(who),
        col: i,
        type: look.type,
        icon: look.icon,
        label: `${look.mark} ${String(t.title ?? t.text ?? '').slice(0, 24)}`,
        sublabel: t.id ? String(t.id) : '',
        width: 175,
      });
    });
    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ from: ids[i], to: ids[i + 1], role: 'main', variant: 'default' });
    }
    // 主路径只取一条真实存在、列号递增的边链：挑任务最多的那道
    if (!mainPath.length && ids.length > 1) mainPath = ids;
  }

  const open = list.filter((t) => t.status !== 'done').length;

  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: {
      title: data.title ? `${data.title} · 任务链` : '任务链',
      subtitle: [data.stageName, `${list.length} 条 · ${open} 条未完成`].filter(Boolean).join(' · '),
      output: 'tasks.html',
      visual_preset: 'signal-flow',
      quality_profile: 'showcase',
      animation: 'none',
      legend: { mode: 'auto', entries: LEGEND_ZH },
    },
    lanes,
    mainPath,
    nodes,
    edges,
  };
}
