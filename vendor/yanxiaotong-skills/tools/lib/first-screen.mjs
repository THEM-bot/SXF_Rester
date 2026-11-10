/** 无意图首屏 · SSOT：router/response-templates.md · T-FIRST-SCREEN */

export const SELF_UPDATE_HINT =
  '主技能包已更新，建议重新 @yanxiaotong-skills 后再选菜单。';

/** 与菜单标题同款分隔：—— 标题 —— */
export const MENU_SEP = '——';

/**
 * 菜单上的 §0c 提示行（图示样式）
 * compact：`—— 今日自动同步 —— 技能包已是最新（扫描 2 项）`
 * detail：首行标题，其后跟多行表
 */
export function formatDailySyncMenuLine(dailySyncBlock) {
  if (!dailySyncBlock) return null;
  const trimmed = String(dailySyncBlock).trim();
  if (!trimmed) return null;
  if (trimmed.includes('\n')) {
    return `${MENU_SEP} 今日自动同步 ${MENU_SEP}\n${trimmed}`;
  }
  return `${MENU_SEP} 今日自动同步 ${MENU_SEP} ${trimmed}`;
}

/** §0c 横幅（有意图 handoff 前 · P-411 · T-DAILY-SYNC-BANNER） */
export function buildDailySyncBanner({ dailySyncBlock, selfUpdate = false } = {}) {
  const line = formatDailySyncMenuLine(dailySyncBlock);
  if (!line) return '';
  if (!selfUpdate) return line;
  return `${line}\n\n${SELF_UPDATE_HINT}`;
}

/**
 * 首屏文本：环境 / 同步 / 菜单标题之间用空行分隔，
 * 避免 Markdown 把单换行折叠成空格（聊天渲染）。
 */
export function buildFirstScreen({ envLabel, envSourceSuffix = '', dailySyncBlock = null, selfUpdate = false }) {
  const suffix = envSourceSuffix || '';
  const envLine = `${envLabel}${suffix}`;
  const parts = [`研效通技能助手 · 当前环境：${envLine}`];

  const syncLine = formatDailySyncMenuLine(dailySyncBlock);
  if (syncLine) {
    parts.push(syncLine);
    if (selfUpdate) {
      parts.push(SELF_UPDATE_HINT);
    }
  }

  const menu = [
    `${MENU_SEP} 请选择要做的事 ${MENU_SEP}`,
    '1. Demo 打包上传',
    '2. 原始需求 — 创建 / 查询 / 修改',
    '3. 需求池 — 创建 / 查询 / 修改 / 作废',
    '4. 任务 — 创建 / 查询 / 修改 / 取消',
    '5. 缺陷 — 创建 / 查询 / 修改 / 流转 / 关闭',
    '6. 技能包 — 安装 / 更新',
    '7. 组织待办 — 创建 / 查询 / 修改 / 追加进展',
    '8. 问题单 — 创建 / 获取元数据',
    '',
    `环境：${envLine}`,
    '须令牌：序号 1、2、3、4、5、6、7、8',
    '',
    '请回复序号（如 `1`）。',
  ].join('\n');

  parts.push(menu);
  // 段落之间空行：聊天 Markdown 才能稳定换行展示
  return parts.join('\n\n');
}
