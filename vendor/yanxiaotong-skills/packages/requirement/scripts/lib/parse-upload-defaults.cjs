'use strict';

const fs = require('fs');
const path = require('path');

/**
 * SC-260802-005：product-repos.yml 预填段（字段名冻结）
 * requirement_upload_defaults:
 *   business_domain_name / feature_team_name / app_service_name
 *
 * feature_team_name 双义：可写特性小组名（M06→teamId）或关联项目名（M02→projectId）。
 * 解析顺序：先 M06，未命中再 M02；二者独立字段，禁止把「特性小组=关联项目」。
 * 仅命中小组时 projectId 回退会话 / M02 手选（创建必填）。
 */

const DEFAULT_KEYS = ['business_domain_name', 'feature_team_name', 'app_service_name'];

function stripQuotes(v) {
  const s = String(v == null ? '' : v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 轻量解析根级 requirement_upload_defaults 映射（无外部 yaml 依赖） */
function parseRequirementUploadDefaultsFromText(ymlText) {
  const text = String(ymlText || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  let blockIndent = null;
  const defaults = {
    business_domain_name: '',
    feature_team_name: '',
    app_service_name: '',
  };
  let found = false;

  for (const line of lines) {
    if (/^\s*#/.test(line) || !line.trim()) {
      continue;
    }
    const mKey = line.match(/^(\s*)([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!mKey) {
      if (inBlock) break;
      continue;
    }
    const indent = mKey[1].length;
    const key = mKey[2];
    const rest = mKey[3];

    if (!inBlock) {
      if (indent === 0 && key === 'requirement_upload_defaults') {
        inBlock = true;
        found = true;
        blockIndent = null;
        continue;
      }
      continue;
    }

    if (blockIndent == null) {
      if (indent === 0) break;
      blockIndent = indent;
    }
    if (indent < blockIndent) break;
    if (indent === blockIndent && DEFAULT_KEYS.includes(key)) {
      const valPart = rest.replace(/\s+#.*$/, '').trim();
      defaults[key] = stripQuotes(valPart);
    }
  }

  const effective = DEFAULT_KEYS.some((k) => String(defaults[k] || '').trim() !== '');
  return { found, effective, defaults };
}

function findDocRepositoryRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const direct = path.join(dir, 'efficiency-hub-doc');
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
    const nested = path.join(dir, 'efficiency-hub', 'efficiency-hub-doc');
    if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveProductReposYmlPath({ ymlPath, docRoot, startDir } = {}) {
  if (ymlPath) {
    const abs = path.resolve(ymlPath);
    return { ymlPath: abs, docRoot: docRoot || path.dirname(abs), exists: fs.existsSync(abs) };
  }
  const root = docRoot ? path.resolve(docRoot) : findDocRepositoryRoot(startDir);
  if (!root) {
    return { ymlPath: null, docRoot: null, exists: false, error: '未找到 efficiency-hub-doc' };
  }
  const abs = path.join(root, 'product-repos.yml');
  return { ymlPath: abs, docRoot: root, exists: fs.existsSync(abs) };
}

function loadRequirementUploadDefaults(opts = {}) {
  const loc = resolveProductReposYmlPath(opts);
  if (!loc.exists) {
    return {
      ok: false,
      effective: false,
      found: false,
      ymlPath: loc.ymlPath,
      docRoot: loc.docRoot,
      error: loc.error || 'product-repos.yml 不存在',
      defaults: {
        business_domain_name: '',
        feature_team_name: '',
        app_service_name: '',
      },
    };
  }
  const text = fs.readFileSync(loc.ymlPath, 'utf8');
  const parsed = parseRequirementUploadDefaultsFromText(text);
  return {
    ok: true,
    ymlPath: loc.ymlPath,
    docRoot: loc.docRoot,
    found: parsed.found,
    effective: parsed.effective,
    defaults: parsed.defaults,
    error: !parsed.found
      ? '无 requirement_upload_defaults 段'
      : !parsed.effective
        ? '预填段存在但三项均为空'
        : null,
  };
}

/**
 * 名称 → 元数据记录：精确唯一 > 模糊唯一；多义/未命中不猜
 * @param {Array<{id:any,name?:string,label?:string}>} records
 * @param {string} name
 */
function matchUniqueByName(records, name) {
  const n = String(name || '').trim();
  if (!n) return { status: 'empty', record: null, candidates: [] };
  const list = Array.isArray(records) ? records : [];
  const labelOf = (r) => String(r?.name || r?.label || '').trim();

  const exact = list.filter((r) => labelOf(r) === n);
  if (exact.length === 1) {
    return { status: 'unique', mode: 'exact', record: exact[0], candidates: exact };
  }
  if (exact.length > 1) {
    return { status: 'ambiguous', mode: 'exact', record: null, candidates: exact };
  }

  const fuzzy = list.filter((r) => {
    const lab = labelOf(r);
    return lab && (lab.includes(n) || n.includes(lab));
  });
  if (fuzzy.length === 1) {
    return { status: 'unique', mode: 'fuzzy', record: fuzzy[0], candidates: fuzzy };
  }
  if (fuzzy.length > 1) {
    return { status: 'ambiguous', mode: 'fuzzy', record: null, candidates: fuzzy };
  }
  return { status: 'miss', mode: null, record: null, candidates: [] };
}

function idOf(record) {
  if (!record || record.id == null) return null;
  return String(record.id);
}

/**
 * @param {object} defaults yml 三项中文名
 * @param {object} lists { domains, teams, projects, appServices }
 */
function resolveNamesToIds(defaults, lists = {}) {
  const unresolved = [];
  const resolved = {
    businessDomainId: null,
    businessDomainName: '',
    businessDomainSource: null,
    teamId: null,
    teamName: '',
    teamSource: null,
    projectId: null,
    projectName: '',
    projectSource: null,
    featureTeamDisplayName: '',
    featureTeamResolvePath: null,
    appServiceId: null,
    appServiceName: '',
    appServiceSource: null,
  };

  const domainName = defaults?.business_domain_name || '';
  const featureOrProjectName = defaults?.feature_team_name || '';
  const appName = defaults?.app_service_name || '';

  if (domainName.trim()) {
    const m = matchUniqueByName(lists.domains || [], domainName);
    if (m.status === 'unique') {
      resolved.businessDomainId = idOf(m.record);
      resolved.businessDomainName = m.record.name || m.record.label || domainName;
      resolved.businessDomainSource = 'yml';
    } else {
      unresolved.push({
        field: 'business_domain_name',
        name: domainName,
        mapsTo: 'businessDomainId',
        note: 'M01 业务领域',
        status: m.status,
        candidates: (m.candidates || []).map((r) => ({
          id: idOf(r),
          name: r.name || r.label,
        })),
      });
    }
  }

  if (featureOrProjectName.trim()) {
    resolved.featureTeamDisplayName = featureOrProjectName;
    const teamMatch = matchUniqueByName(lists.teams || [], featureOrProjectName);
    if (teamMatch.status === 'unique') {
      resolved.teamId = idOf(teamMatch.record);
      resolved.teamName = teamMatch.record.name || teamMatch.record.label || featureOrProjectName;
      resolved.teamSource = 'yml';
      resolved.featureTeamResolvePath = 'team';
    } else {
      const projectMatch = matchUniqueByName(lists.projects || [], featureOrProjectName);
      if (projectMatch.status === 'unique') {
        resolved.projectId = idOf(projectMatch.record);
        resolved.projectName =
          projectMatch.record.name || projectMatch.record.label || featureOrProjectName;
        resolved.projectSource = 'yml';
        resolved.featureTeamResolvePath = 'project';
      } else {
        const prefer = teamMatch.status !== 'miss' ? teamMatch : projectMatch;
        const via =
          teamMatch.status !== 'miss'
            ? 'M06 特性小组'
            : projectMatch.status !== 'miss'
              ? 'M02 关联项目'
              : 'M06 特性小组 → M02 关联项目';
        unresolved.push({
          field: 'feature_team_name',
          name: featureOrProjectName,
          mapsTo: teamMatch.status !== 'miss' ? 'teamId' : 'projectId',
          note: `可写特性小组名或项目名；解析顺序 ${via}`,
          status: prefer.status === 'empty' ? 'miss' : prefer.status,
          teamStatus: teamMatch.status,
          projectStatus: projectMatch.status,
          candidates: (prefer.candidates || []).map((r) => ({
            id: idOf(r),
            name: r.name || r.label,
          })),
        });
      }
    }
  }

  if (appName.trim()) {
    const m = matchUniqueByName(lists.appServices || [], appName);
    if (m.status === 'unique') {
      resolved.appServiceId = idOf(m.record);
      resolved.appServiceName = m.record.name || m.record.label || appName;
      resolved.appServiceSource = 'yml';
    } else {
      unresolved.push({
        field: 'app_service_name',
        name: appName,
        mapsTo: 'appServiceId',
        note: 'M03 应用/服务',
        status: m.status,
        candidates: (m.candidates || []).map((r) => ({
          id: idOf(r),
          name: r.name || r.label,
        })),
      });
    }
  }

  return { resolved, unresolved };
}

module.exports = {
  DEFAULT_KEYS,
  parseRequirementUploadDefaultsFromText,
  findDocRepositoryRoot,
  resolveProductReposYmlPath,
  loadRequirementUploadDefaults,
  matchUniqueByName,
  resolveNamesToIds,
};
