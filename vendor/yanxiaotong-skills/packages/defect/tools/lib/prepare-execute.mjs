/**
 * prepare + execute 编排
 */
import { httpJson, readSessionFile } from './defect-tools.mjs';
import { parseIntent, formatDefectTypeLabel } from './parse-intent-core.mjs';
import { buildCreateBody } from './build-create-body.mjs';
import {
  descriptionForConfirmCell,
  normalizeStructuredDescription,
} from './description-format.mjs';

export async function fetchRequirementDetail(idOrNo, { token } = {}) {
  const result = await httpJson('GET', `/api/open/requirements/detail/${encodeURIComponent(idOrNo)}`, {
    token,
  });
  return result.data || {};
}

export function validateRequirementForDefect(req) {
  if (!req || !req.requirementId) throw new Error('需求不存在');
  if (req.status === '已完成' || req.status === '作废') {
    throw new Error('需求状态为已完成或作废，不能新建缺陷');
  }
}

/**
 * 修复人优先级：用户指定 > 需求开发人员（首位有工号）> 令牌持有人
 * 缺陷 assigneeId 语义为工号（employeeId）。
 */
export async function resolveCreateAssignee(base, req, { token } = {}) {
  if (base.assigneeId) {
    const name = base.assigneeName || base.assigneeId;
    return {
      assigneeId: String(base.assigneeId),
      assigneeName: base.assigneeName || null,
      assigneeLabel: `${name}（来源：用户指定）`,
      assigneeSource: '用户指定',
    };
  }

  if (base.assigneeKeyword) {
    const kw = String(base.assigneeKeyword).trim();
    const q = `?keyword=${encodeURIComponent(kw)}&current=1&size=20`;
    const result = await httpJson('GET', `/api/open/metadata/users${q}`, { token });
    const records = result.data?.records || [];
    const exact = records.filter(
      (r) =>
        String(r.employeeId || '') === kw ||
        String(r.name || '') === kw ||
        String(r.name || '').includes(kw),
    );
    const pool = exact.length ? exact : records;
    const withEmp = pool.filter((r) => r.employeeId);
    if (withEmp.length === 1) {
      const u = withEmp[0];
      const name = u.name || u.employeeId;
      return {
        assigneeId: String(u.employeeId),
        assigneeName: name,
        assigneeLabel: `${name}（来源：用户指定）`,
        assigneeSource: '用户指定',
      };
    }
    const err = new Error(`MISSING:assignee`);
    err.code = 'MISSING_FIELDS';
    err.intent = {
      ...base,
      missing: ['assignee'],
      _assigneeCandidates: withEmp.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
      })),
    };
    throw err;
  }

  const empIds = Array.isArray(req.developerEmployeeIds) ? req.developerEmployeeIds : [];
  const names = Array.isArray(req.developerNames) ? req.developerNames : [];
  for (let i = 0; i < empIds.length; i += 1) {
    const emp = empIds[i] != null ? String(empIds[i]).trim() : '';
    if (!emp) continue;
    const name = (names[i] && String(names[i]).trim()) || emp;
    return {
      assigneeId: emp,
      assigneeName: name,
      assigneeLabel: `${name}（来源：需求开发人员）`,
      assigneeSource: '需求开发人员',
    };
  }

  return {
    assigneeId: null,
    assigneeName: null,
    assigneeLabel: '当前用户（令牌持有人）（来源：令牌）',
    assigneeSource: '令牌',
  };
}

export async function prepareCreateIntent(intent, { token } = {}) {
  const base = { ...(intent || {}) };
  const idOrNo = base.requirementId || base.requirementNo;
  if (!idOrNo) throw new Error('未解析到所属需求，请提供需求链接或 REQ 编号');

  const req = await fetchRequirementDetail(idOrNo, { token });
  validateRequirementForDefect(req);

  const description = base.description
    ? normalizeStructuredDescription(base.description)
    : '';

  const assignee = await resolveCreateAssignee(base, req, { token });

  return {
    ...base,
    create_mode: base.create_mode || 'quick',
    requirementId: String(req.requirementId),
    requirementNo: req.requirementNo || '',
    requirementTitle: req.title || '',
    title: base.title || '',
    description,
    description_for_confirm: description ? descriptionForConfirmCell(description) : '（无）',
    severity: base.severity || 'C类（一般）',
    discoveryPhase: req.status || '',
    requirementStatus: req.status || '',
    defectType: base.defectType || null,
    defectTypeSource: base.defectTypeSource || null,
    defectTypeLabel:
      base.defectTypeLabel ||
      (base.defectType
        ? formatDefectTypeLabel(base.defectType, base.defectTypeSource)
        : '（未选）'),
    assigneeId: assignee.assigneeId,
    assigneeName: assignee.assigneeName,
    assigneeLabel: assignee.assigneeLabel,
    assigneeSource: assignee.assigneeSource,
    regressionTesterId: base.regressionTesterId || null,
    regressionTesterName: base.regressionTesterName || null,
    regressionTesterLabel: base.regressionTesterLabel
      || (base.regressionTesterId ? (base.regressionTesterName || base.regressionTesterId) : '（未指定）'),
    track: base.track || null,
    source_content: base.source_content || null,
    refine_status: base.refine_status || null,
    title_refine_max: base.title_refine_max || null,
  };
}

export async function prepareIntent(intentInput, { token } = {}) {
  const intent =
    typeof intentInput === 'string'
      ? parseIntent(intentInput, readSessionFile())
      : { ...(intentInput || {}) };

  if (intent.create_mode === 'full' && intent.operation === 'create') {
    const err = new Error('FULL_CREATE_MODE');
    err.code = 'FULL_CREATE_MODE';
    throw err;
  }

  if (intent.operation === 'create' && (intent.requirementId || intent.requirementNo)) {
    return prepareCreateIntent(intent, { token });
  }

  if (intent.operation === 'list' && intent.listQuery?.requirementNo && !intent.listQuery.requirementId) {
    const req = await fetchRequirementDetail(intent.listQuery.requirementNo, { token });
    intent.listQuery.requirementId = String(req.requirementId);
    delete intent.listQuery.requirementNo;
  }

  return intent;
}

export async function executeIntent(intent, { token, persist = true } = {}) {
  const op = intent.operation;
  if (!op) throw new Error('operation is required');

  if (op === 'create') {
    const body = buildCreateBody(intent);
    const result = await httpJson('POST', '/api/open/defects/create', { token, body });
    if (persist) {
      const { writeSessionFile } = await import('./defect-tools.mjs');
      writeSessionFile({
        last_create_defaults: {
          requirementId: body.requirementId,
          requirementNo: intent.requirementNo || '',
          requirementTitle: intent.requirementTitle || '',
          severity: body.severity || '',
        },
        last_defect: {
          defectId: result.data?.defectId,
          defectNo: result.data?.defectNo,
          title: body.title,
        },
      });
    }
    return { operation: op, body, result };
  }

  if (op === 'detail') {
    const id = intent.idOrNo;
    if (!id) throw new Error('idOrNo is required');
    const result = await httpJson('GET', `/api/open/defects/detail/${encodeURIComponent(id)}`, { token });
    return { operation: op, result };
  }

  if (op === 'list') {
    const body = { ...(intent.listQuery || { current: 1, size: 5 }) };
    delete body._allowEmpty;
    if (!body.size) body.size = 5;
    const result = await httpJson('POST', '/api/open/defects/findPage', { token, body });
    if (persist) {
      const { writeSessionFile } = await import('./defect-tools.mjs');
      writeSessionFile({ last_list_filters: { filtersJson: JSON.stringify(body) } });
    }
    return { operation: op, body, result };
  }

  if (op === 'update') {
    const id = intent.idOrNo;
    const body = { ...(intent.updateBody || {}) };
    delete body.discoveryPhase;
    if ('discoveryPhase' in (intent.updateBody || {})) {
      throw new Error('发现阶段不能通过开放 API 修改，创建时自动取所属需求状态');
    }
    if (!Object.keys(body).length) throw new Error('update body is empty');
    const result = await httpJson('POST', `/api/open/defects/update/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    return { operation: op, idOrNo: id, body, result };
  }

  if (op === 'status') {
    const id = intent.idOrNo;
    const body = { status: intent.status };
    const result = await httpJson('POST', `/api/open/defects/status/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    return { operation: op, idOrNo: id, body, result };
  }

  if (op === 'close') {
    const id = intent.idOrNo;
    const body = { closeType: intent.closeType };
    const result = await httpJson('POST', `/api/open/defects/close/${encodeURIComponent(id)}`, {
      token,
      body,
    });
    return { operation: op, idOrNo: id, body, result };
  }

  throw new Error(`Unknown operation: ${op}`);
}

export function parseAndPrepareFromText(text, { token } = {}) {
  const session = readSessionFile();
  const partial = parseIntent(text, session);
  if (partial.missing?.length) {
    const err = new Error(`MISSING:${partial.missing.join(',')}`);
    err.code = 'MISSING_FIELDS';
    err.intent = partial;
    throw err;
  }
  return prepareIntent(partial, { token });
}
