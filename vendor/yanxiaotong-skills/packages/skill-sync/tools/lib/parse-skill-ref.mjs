/**
 * Parse skillId from plaza URL, zip path, or plain numeric id.
 * 广场复制提示词常含「自举 zip + 目标 zip」：优先解析「再用它安装 / 用它依次安装 / 安装技能」之后的 id。
 */

const ZIP_ID_RE = /\/imported\/(\d+)\/skill-zip/gi;
const TARGET_MARK_RE = /再用它安装|用它依次安装|安装技能/;

function zipSource(fullText, idMatchIndex) {
  const slice = String(fullText || '').slice(Math.max(0, idMatchIndex - 80), idMatchIndex + 40);
  return /\/api\/open\//i.test(slice) ? 'open_api_zip_path' : 'plaza_zip_path';
}

/** 提取文中全部 skill-zip id（去重、保序） */
export function parseAllSkillZipIds(input) {
  const text = String(input || '');
  const ids = [];
  const seen = new Set();
  for (const m of text.matchAll(/\/imported\/(\d+)\/skill-zip/gi)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 安装目标切片：有「再用它安装 / 用它依次安装 / 安装技能」时只在其后解析，避免命中自举包 id。
 */
function targetSearchText(text) {
  const mark = text.search(TARGET_MARK_RE);
  if (mark < 0) return text;
  return text.slice(mark);
}

function parseZipOrQuery(searchText, fullText) {
  const skillQuery = searchText.match(/[?&]skill=(\d+)/i);
  if (skillQuery) {
    return { skillId: skillQuery[1], source: 'plaza_url' };
  }

  const zipPath = searchText.match(/\/imported\/(\d+)\/skill-zip/i);
  if (zipPath) {
    const absIndex = fullText.indexOf(zipPath[0]);
    return {
      skillId: zipPath[1],
      source: zipSource(fullText, absIndex >= 0 ? absIndex : 0),
    };
  }

  const embedded = searchText.match(/skill[=:](\d+)/i);
  if (embedded) {
    return { skillId: embedded[1], source: 'plaza_url' };
  }

  return null;
}

export function parseSkillRef(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return { skillId: text, source: 'plain_id' };
  }

  const fromTarget = parseZipOrQuery(targetSearchText(text), text);
  if (fromTarget) return fromTarget;

  // 无目标标记或标记后无 id 时，回退全文（兼容只贴一条 zip）
  return parseZipOrQuery(text, text);
}

/** 安装列表：目标段内全部 zip id；无标记则全文全部 zip id */
export function parseInstallSkillIds(input) {
  const text = String(input || '').trim();
  if (!text) return [];
  const ids = parseAllSkillZipIds(targetSearchText(text));
  if (ids.length > 0) return ids;
  if (/^\d+$/.test(text)) return [text];
  const one = parseSkillRef(text);
  return one ? [one.skillId] : [];
}

export function resolveSkillIdFromArgs({ skillId, skillRef, text, positionals = [] } = {}) {
  const direct = String(skillId || '').trim();
  if (direct) return { skillId: direct, source: 'plain_id' };

  const raw = String(skillRef || text || positionals[0] || '').trim();
  if (!raw) return null;
  return parseSkillRef(raw);
}
