/**
 * 研效通操作层：把"本地脑子里的东西"翻成平台单据。
 *
 * 设计原则：
 * 1. 每个写操作都先组 body（纯函数能单测），再决定是 dry（只打印）还是真提交。
 * 2. 一律走 `--json <临时文件>`，中文绝不进 argv。
 * 3. 成功后把平台单号/链接交回调用方，由 pmw 落到 state.yxt 里。
 */
import { runYxt, runDemo, writeJsonTemp, dataOf } from './cli.js';

/* ============================ 通用 ============================ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 本地日期 yyyy-MM-dd（不能用 toISOString，那是 UTC 会差一天） */
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function need(v, name) {
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`缺少 ${name}`);
  }
  return v;
}

/** 从需求编号拿平台 id（R01 建任务/缺陷都要求 requirementId 而不是编号） */
export function resolveRequirement(root, reqNoOrId) {
  const id = need(reqNoOrId, '需求编号（REQ-xxx）');
  const res = runYxt(root, 'requirement', ['detail', '--id', id]);
  if (!res.ok) return { ok: false, error: res.error || '查不到这个需求' };
  const data = dataOf(res) || {};
  // 平台字段名是 requirementId / requirementNo，不是 id / no
  return {
    ok: true,
    data,
    no: data.requirementNo || data.no || id,
    id: String(data.requirementId || data.id || ''),
  };
}

/* ============================ 任务 T01 ============================ */

/**
 * 组 T01 body。
 * 必填：title / taskPhase / taskCategory / requirementId / plannedStartDate / plannedEndDate
 */
export function buildTaskBody(input) {
  const def = input.defaults || {};
  const phase = input.phase || def.taskPhase || '开发阶段';
  const category = input.category || def.taskCategory || '开发编码';
  const start = input.start || localDate();
  const end = input.end || start;
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new Error('计划日期要用 yyyy-MM-dd');
  }
  if (end < start) throw new Error(`结束日期 ${end} 早于开始日期 ${start}`);
  const body = {
    title: String(need(input.title, '任务标题')).slice(0, 200),
    taskPhase: phase,
    taskCategory: category,
    requirementId: String(need(input.requirementId, '需求 id（先用 requirementId 解析）')),
    plannedStartDate: start,
    plannedEndDate: end,
    plannedStartPeriod: input.startPeriod || 'PM',
    plannedEndPeriod: input.endPeriod || 'PM',
  };
  if (input.description) body.description = input.description;
  if (input.hours != null && input.hours !== '') body.estimatedHours = Number(input.hours);
  if (input.assigneeId) body.assigneeId = String(input.assigneeId);
  return body;
}

/**
 * 把平台返回的"业务性拒绝"翻成可执行的下一步。
 * 这类错误不是 token 问题、不是参数写错，而是平台上还有前置条件没满足。
 */
export function explainPlatformRejection(error) {
  const e = String(error || '');
  if (/开发迭代/.test(e)) {
    return `${e}
  这说明这条需求在平台上还没挂开发迭代。研效通的任务必须落在某个迭代里，所以：
    1. 打开研效通 → 需求池 → 找到这条需求 → 编辑 → 设置「开发迭代」
    2. 回来再跑一次 pmw yxt task push`;
  }
  if (/需求不存在|requirement.*not.*found/i.test(e)) {
    return `${e}\n  需求编号对不对？用 pmw yxt req <REQ-xxx> 查一下。`;
  }
  if (/status|状态/.test(e) && /不允许|不能/.test(e)) {
    return `${e}\n  单据当前状态不允许这个操作，先去平台上把它流转到合适的状态。`;
  }
  return e;
}

export function createTask(root, input) {
  const body = buildTaskBody(input);
  if (input.dry) return { ok: true, dry: true, body, pkg: 'task', op: 'T01 create' };
  const res = runYxt(root, 'task', ['create', '--json', writeJsonTemp(body)]);
  if (!res.ok) return { ok: false, error: explainPlatformRejection(res.error), body };
  const data = dataOf(res) || {};
  return {
    ok: true,
    body,
    taskId: data.taskId || '',
    taskNo: data.taskNo || data.mappingKey || '',
    raw: data,
  };
}

export function listTasks(root, query = {}) {
  const q = { current: 1, size: 20, ...query };
  const res = runYxt(root, 'task', ['list', '--json', writeJsonTemp(q)]);
  if (!res.ok) return { ok: false, error: res.error };
  const data = dataOf(res) || {};
  const records = data.records || data.list || [];
  return { ok: true, total: data.total ?? records.length, records };
}

export function detailTask(root, id) {
  const res = runYxt(root, 'task', ['detail', '--id', need(id, '任务编号 TASK-xxx')]);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: dataOf(res) };
}

export function cancelTask(root, id) {
  const res = runYxt(root, 'task', ['cancel', '--id', need(id, '任务编号')]);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: dataOf(res) };
}

/** 任务元数据：阶段 / 类别（T01 必填的两个坐标轴） */
export function taskMeta(root, phase) {
  // 类别是"阶段下的类别"（联动项），所以必须带一个阶段才拿得到
  const p = phase || '开发阶段';
  const phases = runYxt(root, 'task', ['m10', '--pick', 'phase'], { wantOut: false });
  const cats = runYxt(root, 'task', ['m10', '--pick', 'category', '--phase', p], { wantOut: false });
  return {
    phase: p,
    phases: pickList(phases.stdout),
    categories: pickList(cats.stdout),
  };
}

/** 把 `--pick` 的文本输出解析成 [{name, id}] */
export function pickList(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\.\s*(.+?)\s*(?:\(id:\s*([^)]+)\))?\s*$/);
    if (m) out.push({ name: m[1].trim(), id: (m[2] || m[1]).trim() });
  }
  return out;
}

/* ============================ 缺陷 D ============================ */

export function buildDefectBody(input) {
  const body = {
    title: String(need(input.title, '缺陷标题')).slice(0, 500),
    requirementId: String(need(input.requirementId, '需求 id')),
  };
  body.severity = input.severity || 'C类（一般）';
  if (input.assigneeId) body.assigneeId = String(input.assigneeId);
  if (input.defectType != null && input.defectType !== '') body.defectType = Number(input.defectType);
  if (input.description) body.description = input.description;
  return body;
}

export function createDefect(root, input) {
  const body = buildDefectBody(input);
  if (input.dry) return { ok: true, dry: true, body, pkg: 'defect', op: 'D create' };
  const res = runYxt(root, 'defect', ['create', '--json', writeJsonTemp(body)]);
  if (!res.ok) return { ok: false, error: res.error, body };
  const data = dataOf(res) || {};
  return { ok: true, body, defectId: data.id || data.defectId || '', defectNo: data.no || data.defectNo || '', raw: data };
}

export function listDefects(root, query = {}) {
  const res = runYxt(root, 'defect', ['list', '--json', writeJsonTemp({ current: 1, size: 20, ...query })]);
  if (!res.ok) return { ok: false, error: res.error };
  const data = dataOf(res) || {};
  const records = data.records || data.list || [];
  return { ok: true, total: data.total ?? records.length, records };
}

export function setDefectStatus(root, id, status) {
  const res = runYxt(root, 'defect', ['status', '--id', need(id, '缺陷编号'), '--json', writeJsonTemp({ status: need(status, '目标状态') })]);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: dataOf(res) };
}

/* ============================ 原始需求 OR ============================ */

export function buildOriginalRequirementBody(input) {
  const def = input.defaults || {};
  return {
    title: String(need(input.title, '标题')).slice(0, 200),
    businessPain: need(input.businessPain, '业务背景痛点'),
    userNeedDesc: need(input.userNeedDesc, '原始需求描述'),
    valueDescription: input.valueDescription || '',
    expectedDeliveryDate: input.expectedDeliveryDate || localDate(),
    // P-130：snowflake 必须字符串
    businessDomainId: String(need(input.businessDomainId || def.businessDomainId, '业务领域 id（可用 pmw yxt config --business-domain-id 存起来）')),
  };
}

export function createOriginalRequirement(root, input) {
  const body = buildOriginalRequirementBody(input);
  if (input.dry) return { ok: true, dry: true, body, pkg: 'original-requirement', op: 'OR create' };
  const res = runYxt(root, 'original-requirement', ['create', '--json', writeJsonTemp(body)]);
  if (!res.ok) return { ok: false, error: res.error, body };
  const data = dataOf(res) || {};
  return { ok: true, body, orId: data.id || '', orNo: data.no || data.originalNo || '', raw: data };
}

/* ============================ 组织待办 OT ============================ */

export function buildOrgTodoBody(input) {
  const def = input.defaults || {};
  const owners = (input.owners && input.owners.length ? input.owners : def.owners) || [];
  return {
    descriptionHtml: need(input.descriptionHtml, '待办描述'),
    owners: owners.length ? owners.map(String) : [],
    plannedCloseAt: input.plannedCloseAt || addDays(localDate(), 30),
  };
}

export function createOrgTodo(root, input) {
  const body = buildOrgTodoBody(input);
  if (!body.owners.length && !input.dry) {
    // 未指定负责人时用 token 用户，CLI 侧有 resolve-token-user
    const me = runYxt(root, 'org-todo', ['resolve-token-user']);
    const d = dataOf(me) || {};
    if (d.employeeId) body.owners = [String(d.employeeId)];
  }
  if (input.dry) return { ok: true, dry: true, body, pkg: 'org-todo', op: 'OT create' };
  if (!body.owners.length) throw new Error('缺负责人工号（--owner 工号，或用 pmw yxt config --employee-id 存一个）');
  const res = runYxt(root, 'org-todo', ['create', '--json', writeJsonTemp(body)]);
  if (!res.ok) return { ok: false, error: res.error, body };
  const data = dataOf(res) || {};
  return { ok: true, body, todoId: data.id || '', todoNo: data.no || data.todoNo || '', raw: data };
}

export function appendTodoProgress(root, id, text) {
  const res = runYxt(root, 'org-todo', ['append-progress', '--id', need(id, '待办编号 OT-xxx'), '--json', writeJsonTemp({ bodyHtml: need(text, '进展正文') })]);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: dataOf(res) };
}

/* ============================ 问题单 PT ============================ */

export function buildProblemTicketBody(input) {
  const def = input.defaults || {};
  const body = {
    title: String(need(input.title, '问题标题')).slice(0, 512),
    description: need(input.description, '问题描述'),
    submitterName: input.submitterName || def.submitterName || '',
    problemType: input.problemType || '线上缺陷',
  };
  if (!body.submitterName && def.employeeId) body.submitterEmployeeId = String(def.employeeId);
  if (input.secondLineFollower) body.secondLineFollower = input.secondLineFollower;
  if (input.handler) body.handler = input.handler;
  if (input.businessDomain) body.businessDomain = input.businessDomain;
  if (input.appOrService) body.appOrService = input.appOrService;
  return body;
}

export function createProblemTicket(root, input) {
  const body = buildProblemTicketBody(input);
  if (!body.submitterName && !body.submitterEmployeeId) {
    delete body.submitterName;
    throw new Error('缺提单人（--submitter 姓名或 pmw yxt config --submitter-name 存一个）');
  }
  if (input.dry) return { ok: true, dry: true, body, pkg: 'problem-ticket', op: 'PT create' };
  const res = runYxt(root, 'problem-ticket', ['create', '--json', writeJsonTemp(body)]);
  if (!res.ok) return { ok: false, error: res.error, body };
  const data = dataOf(res) || {};
  return { ok: true, body, problemId: data.id || '', problemNo: data.no || '', raw: data };
}

/* ============================ Demo ============================ */

/** 打包 demo 目录成 zip（要求根有非空 index.html） */
export function packDemo(root, sourceDir, outZip) {
  const args = ['--source', sourceDir];
  if (outZip) args.push('--out', outZip);
  const res = runDemo(root, 'pack', args);
  if (!res.ok) return { ok: false, error: res.error, stdout: res.stdout };
  const data = dataOf(res);
  return { ok: true, zip: data?.zip || data?.out || outZip || '', data, stdout: res.stdout };
}

/**
 * 上传 demo。
 * mode: d03 新建 / d04 更新（更新要带 --demo-id）
 * 返回 accessUrl（这就是能发给开发/主管的链接）
 */
export function uploadDemo(root, input) {
  const args = [
    '--mode', input.mode || 'd03',
    '--environment', input.environment || '生产',
  ];
  if (input.zip) args.push('--zip', input.zip);
  if (input.demoId) args.push('--demo-id', String(input.demoId));
  if (input.name) args.push('--name', input.name);
  if (input.sourceType) args.push('--source-type', input.sourceType);
  if (input.businessDomainId) args.push('--business-domain-id', String(input.businessDomainId));
  if (input.appServiceId) args.push('--app-service-id', String(input.appServiceId));
  args.push('--save-session');
  if (input.noVerify) args.push('--no-verify');
  if (input.dry) return { ok: true, dry: true, argv: args, pkg: 'demo', op: `D0${input.mode === 'd04' ? 4 : 3} upload` };
  const res = runDemo(root, 'upload', args);
  if (!res.ok) return { ok: false, error: res.error, stdout: res.stdout, stderr: res.stderr };
  const data = dataOf(res) || {};
  return {
    ok: true,
    demoId: data.demoId || data.id || '',
    accessUrl: data.accessUrl || data.url || data.demoUrl || '',
    raw: data,
    stdout: res.stdout,
  };
}

/* ============================ 元数据 ============================ */

/** 业务领域（M01），建原始需求/需求都要 */
export function businessDomains(root) {
  const res = runYxt(root, 'requirement', ['m01', '--pick'], { wantOut: false });
  return pickList(res.stdout);
}

/** 跑任意子包元数据命令（m01/m05/m06/m09/m10/m11），返回原始文本 */
export function meta(root, pkg, args) {
  const res = runYxt(root, pkg, args, { wantOut: false });
  return { ok: res.ok, text: res.stdout || res.stderr || '', error: res.error };
}
