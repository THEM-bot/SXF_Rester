/**
 * check-all 列表展示 SSOT：所有扫描项（含跳过）均进同一张表。
 */

export function formatUpdateConfirmFooter(summary) {
  const updatable = summary?.updatable || 0;
  const lines = ['请确认本轮操作：', ''];
  let n = 1;

  if (updatable > 0) {
    lines.push(`${n++}. 更新全部可更新项（共 ${updatable} 项）`);
    if (updatable > 1) {
      lines.push(`${n++}. 选择部分更新`);
    }
  }
  lines.push(`${n++}. 重新比对`);
  lines.push(`${n++}. 取消`);
  lines.push('', '请回复序号（如 `1`）。');
  return lines.join('\n');
}

export function resolveListStatus(item) {
  if (item.skipReason === 'manifest_invalid') {
    const msg = String(item.error || item.scanError || 'manifest 无效').replace(/\s+/g, ' ').slice(0, 120);
    return {
      listStatus: 'manifest 无效',
      listAction: '跳过',
      canUpdate: false,
      detail: msg,
    };
  }
  if (item.skipReason === 'duplicate_skill_id') {
    return {
      listStatus: '重复 skillId',
      listAction: '跳过',
      canUpdate: false,
      detail: '同 skillId 多处 manifest，须人工处理',
    };
  }
  if (item.skipReason === 'local_modified') {
    return {
      listStatus: '本地改动',
      listAction: '跳过',
      canUpdate: false,
      detail: '登记与 manifest 不一致',
    };
  }
  if (item.skipReason === 'draft') {
    return {
      listStatus: '草稿',
      listAction: '跳过',
      canUpdate: false,
      detail: '社区侧未发布',
    };
  }
  if (item.skipReason === 'security_pending') {
    const msg = String(item.error || '安全检测进行中').replace(/\s+/g, ' ').slice(0, 120);
    return {
      listStatus: '检测中',
      listAction: '跳过',
      canUpdate: false,
      detail: msg,
    };
  }
  if (item.skipReason === 'sync_meta_error') {
    const msg = String(item.error || 'sync-meta 失败').replace(/\s+/g, ' ').slice(0, 120);
    return {
      listStatus: '接口异常',
      listAction: '跳过',
      canUpdate: false,
      detail: msg,
    };
  }
  if (item.skipReason === 'up_to_date') {
    return {
      listStatus: '已最新',
      listAction: '跳过',
      canUpdate: false,
      detail: 'MD5 一致',
    };
  }
  if (item.needUpdate) {
    const draftHint = item.status && item.status !== 'published' ? `（${item.status}）` : '';
    return {
      listStatus: '可更新',
      listAction: '更新',
      canUpdate: true,
      detail: `MD5 不一致${draftHint}`,
    };
  }
  return {
    listStatus: '已最新',
    listAction: '跳过',
    canUpdate: false,
    detail: '已同步',
  };
}

export function enrichItemForList(item) {
  const st = resolveListStatus(item);
  return {
    ...item,
    listStatus: st.listStatus,
    listAction: st.listAction,
    canUpdate: st.canUpdate,
    listDetail: st.detail,
  };
}

function escCell(s) {
  return String(s ?? '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildCheckAllSummary(items) {
  const enriched = items.map(enrichItemForList);
  return {
    total: enriched.length,
    updatable: enriched.filter((i) => i.listAction === '更新').length,
    skipped: enriched.filter((i) => i.listAction === '跳过').length,
    upToDate: enriched.filter((i) => i.listStatus === '已最新').length,
    draft: enriched.filter((i) => i.listStatus === '草稿').length,
    localModified: enriched.filter((i) => i.listStatus === '本地改动').length,
    errors: enriched.filter((i) => i.listStatus === '接口异常').length,
    securityPending: enriched.filter((i) => i.listStatus === '检测中').length,
    manifestInvalid: enriched.filter((i) => i.listStatus === 'manifest 无效').length,
    duplicate: enriched.filter((i) => i.listStatus === '重复 skillId').length,
  };
}

export function formatCheckAllTable({ skillsRoot, summary, items }) {
  const lines = [];
  lines.push(`已扫描技能目录 \`${skillsRoot}\`，同步比对结果如下（**含跳过项**）：`);
  lines.push('');
  lines.push('| # | 技能 | skillId | 本轮 | 状态 | 说明 |');
  lines.push('|---|------|---------|------|------|------|');
  items.forEach((item, idx) => {
    const row = enrichItemForList(item);
    lines.push(
      `| ${idx + 1} | ${escCell(row.displayName)} | ${escCell(row.skillId)} | ${escCell(row.listAction)} | ${escCell(row.listStatus)} | ${escCell(row.listDetail)} |`
    );
  });
  lines.push('');
  lines.push(
    `合计 ${summary.total} 项：本轮可更新 ${summary.updatable} · 跳过 ${summary.skipped}（已最新 ${summary.upToDate} · 草稿 ${summary.draft} · 本地改动 ${summary.localModified} · 检测中 ${summary.securityPending || 0} · 接口异常 ${summary.errors} · manifest 无效 ${summary.manifestInvalid} · 重复 skillId ${summary.duplicate}）`
  );
  lines.push('');
  lines.push(formatUpdateConfirmFooter(summary));
  return lines.join('\n');
}

export function buildDailyAutoRows(items, updateResults = []) {
  const byId = new Map((updateResults || []).map((r) => [String(r.skillId), r]));
  return items.map((item, idx) => {
    const row = enrichItemForList(item);
    const upd = byId.get(String(row.skillId));
    let updateResult = '-';
    if (row.canUpdate) {
      if (!upd) updateResult = '未执行';
      else if (upd.ok) updateResult = '成功';
      else updateResult = '失败';
    }
    const detail = upd && !upd.ok ? String(upd.error || '更新失败') : row.listDetail;
    return {
      index: idx + 1,
      skillId: row.skillId,
      displayName: row.displayName,
      scanAction: row.listAction,
      scanStatus: row.listStatus,
      updateResult,
      detail,
      canUpdate: row.canUpdate,
      ok: upd?.ok ?? null,
    };
  });
}

export function buildDailyAutoStats(summary, updateResults = []) {
  const results = updateResults || [];
  return {
    scanned: summary.total,
    updatable: summary.updatable,
    skipped: summary.skipped,
    update_attempted: results.length,
    update_success: results.filter((r) => r.ok).length,
    update_failure: results.filter((r) => !r.ok).length,
  };
}

export function shouldUseDailyDetail(stats, rows) {
  if (stats.update_failure > 0) return true;
  if (rows.some((r) => r.updateResult === '失败')) return true;
  const detailStatuses = new Set(['检测中', '接口异常', 'manifest 无效', '重复 skillId', '草稿', '本地改动']);
  if (rows.some((r) => detailStatuses.has(r.scanStatus))) return true;
  return false;
}

export function formatDailyAutoCompact(stats) {
  if (!stats.scanned) return '技能包：本地未发现已安装技能';
  if (!stats.updatable) return `技能包已是最新（扫描 ${stats.scanned} 项）`;
  return `技能包已自动更新：扫描 ${stats.scanned} 项 · 更新 ${stats.update_success} 项 · 成功 ${stats.update_success} 项`;
}

export function formatDailyAutoDetail({ skillsRoot, summary, items, updateResults }) {
  const stats = buildDailyAutoStats(summary, updateResults);
  const rows = buildDailyAutoRows(items, updateResults);
  const lines = [];
  lines.push('技能包自动同步结果：');
  lines.push('');
  lines.push(`目录 \`${skillsRoot}\``);
  lines.push('');
  lines.push('| # | 技能 | skillId | 比对 | 状态 | 更新结果 | 说明 |');
  lines.push('|---|------|---------|------|------|----------|------|');
  for (const row of rows) {
    lines.push(
      `| ${row.index} | ${escCell(row.displayName)} | ${escCell(row.skillId)} | ${escCell(row.scanAction)} | ${escCell(row.scanStatus)} | ${escCell(row.updateResult)} | ${escCell(row.detail)} |`
    );
  }
  lines.push('');
  lines.push(
    `合计：扫描 ${stats.scanned} 项 · 可更新 ${stats.updatable} · 已尝试更新 ${stats.update_attempted} · 成功 ${stats.update_success} · 失败 ${stats.update_failure} · 跳过 ${stats.skipped}`
  );
  return { stats, rows, text: lines.join('\n'), displayMode: 'detail' };
}

export function resolveDailyAutoDisplay(params) {
  const stats = buildDailyAutoStats(params.summary, params.updateResults);
  const rows = buildDailyAutoRows(params.items, params.updateResults);
  if (shouldUseDailyDetail(stats, rows)) {
    const detail = formatDailyAutoDetail(params);
    return { ...detail, dailyBlock: detail.text };
  }
  const compact = formatDailyAutoCompact(stats);
  return { stats, rows, displayMode: 'compact', dailyBlock: compact, text: compact };
}

/** @deprecated 使用 resolveDailyAutoDisplay；保留兼容 */
export function formatDailyAutoTable(params) {
  const resolved = resolveDailyAutoDisplay(params);
  if (resolved.displayMode === 'detail') return resolved;
  const envLabel = params.envLabel || '-';
  const lines = [
    `今日首次使用已自动完成技能包比对与更新（环境：${envLabel}）。`,
    '',
    resolved.dailyBlock,
  ];
  return { ...resolved, text: lines.join('\n') };
}
