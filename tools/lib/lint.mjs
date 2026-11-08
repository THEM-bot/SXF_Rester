/**
 * 文档一致性体检：抓「有没有」之外的那类问题 —— 前后对不上。
 *
 * 只做三件能被机器确定的事，不做语义判断：
 *   A 跨文档字段名：总 PRD 定义过的字段，模块 PRD 里换了叫法
 *   B 验收覆盖：规则表有 N 行，验收标准只有 M 条
 *   C demo 与 PRD 覆盖：demo 做了的 PRD 没写，PRD 写了的 demo 没做
 *
 * 全部纯函数，不碰文件系统；调用方把文件内容读好传进来。
 */

/** 字段类名词的常见后缀。用来把「变更时间 / 生效时间」归到同一族里比对 */
const FIELD_SUFFIX = [
  '时间', '日期', '状态', '金额', '数量', '类型', '编号', '名称', '标识',
  '备注', '附件', '地址', '单位', '比例', '天数', '小时', '原因', '方式',
  '人', '率', '数', '号', '码',
];

/** 定义表的表头里出现这些词，说明这张表在给字段下定义 */
const DEF_HEADER_RE = /字段|术语|名称|项目|属性/;
const DEF_BODY_RE = /定义|含义|说明|口径|规则|解释/;

const CELL_MAX = 14;
const CELL_MIN = 2;

/**
 * 通用词停用表：这些是表头里的结构性词（「编号 | 可核对结果」），
 * 不是业务字段名，拿去跟字段定义表比对只会制造噪音。
 */
const GENERIC_WORDS = new Set([
  '编号', '序号', '名称', '说明', '备注', '原因', '方式', '类型', '状态',
  '数量', '金额', '时间', '日期', '附件', '单位', '比例', '地址', '范围',
  '步骤', '环节', '部门', '角色', '权限', '字段', '内容', '结果', '来源',
]);

/** 把 markdown 里的所有表格切出来（不含分隔行） */
export function tableBlocks(md) {
  const lines = String(md || '').split(/\r?\n/);
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cellsOf = (l) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const isSep = (l) => isRow(l) && cellsOf(l).every((c) => /^:?-{2,}:?$/.test(c) || c === '');

  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isRow(line)) {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    // 下一行是分隔行 → 这一行是表头，开一张新表
    // （两张表紧挨着写时，markdown 靠分隔行分界，不能靠空行）
    if (i + 1 < lines.length && isSep(lines[i + 1])) {
      if (cur) out.push(cur);
      cur = { header: cellsOf(line), rows: [] };
      i += 1; // 吃掉分隔行
      continue;
    }
    if (isSep(line)) continue;
    if (!cur) cur = { header: cellsOf(line), rows: [] };
    else cur.rows.push(cellsOf(line));
  }
  if (cur) out.push(cur);
  return out;
}

function cleanCell(c) {
  return String(c || '')
    .replace(/\*\*|__|`|\[|\]|\(|\)|（|）/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function endsWithFieldSuffix(word) {
  return FIELD_SUFFIX.some((s) => word.endsWith(s) && word.length > s.length);
}

/**
 * 像不像一个字段名：纯中文/字母/数字，2~10 个字。
 * 这一条把「三条错误都能给出具体行号」这种整句话挡在门外 —— 否则后面全是噪音。
 */
function isFieldWord(w) {
  if (w.length < CELL_MIN || w.length > 10) return false;
  if (!/^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9]*$/.test(w)) return false;
  if (GENERIC_WORDS.has(w)) return false;
  return endsWithFieldSuffix(w);
}

export function suffixOf(word) {
  return FIELD_SUFFIX.find((s) => word.endsWith(s) && word.length > s.length) || '';
}

/**
 * 把后缀按「同一族」归组：变更时间 / 变更日期 是同一个概念的两个说法，
 * 光比对后缀相等抓不到，得看词干是不是一样。
 */
const SUFFIX_FAMILY = [
  ['时间', '日期', '天数', '小时'],
  ['金额', '数量', '数', '比例', '率'],
  ['名称', '标识', '编号', '号', '码', '类型'],
];

function familyOf(suf) {
  return SUFFIX_FAMILY.find((f) => f.includes(suf)) || [suf];
}

/** 词干：去掉末尾的字段后缀 */
function stemOf(word) {
  const suf = suffixOf(word);
  return suf ? word.slice(0, -suf.length) : word;
}

/**
 * 从总 PRD 里抽「标准字段名」：来自定义表（表头含字段/术语/名称，且正文含定义/说明/口径）。
 * 找不到定义表时，退而用所有表格的首列 + 表头里像字段的词。
 */
export function definedTerms(masterMd) {
  const blocks = tableBlocks(masterMd);
  const strict = new Set();
  const loose = new Set();
  for (const b of blocks) {
    const headerText = b.header.join(' ');
    const bodyText = b.rows.flat().join(' ');
    const isDef = DEF_HEADER_RE.test(headerText) && DEF_BODY_RE.test(headerText + ' ' + bodyText);
    // 首列往往是字段名
    for (const row of b.rows) {
      const first = cleanCell(row[0]);
      if (isFieldWord(first)) {
        loose.add(first);
        if (isDef) strict.add(first);
      }
    }
    // 表头本身也可能是字段名（转置表：字段在前、说明在后）
    if (isDef) {
      for (const h of b.header) {
        const w = cleanCell(h);
        if (isFieldWord(w)) strict.add(w);
      }
    }
  }
  return { strict, loose: strict.size ? strict : loose };
}

/** 一份文档里「像字段名」的表格词。只看表头与首列 —— 正文里的话不参与比对 */
export function tableFieldWords(md) {
  const set = new Set();
  for (const b of tableBlocks(md)) {
    const cells = [...b.header, ...b.rows.map((r) => r[0])];
    for (const c of cells) {
      const w = cleanCell(c);
      if (isFieldWord(w)) set.add(w);
    }
  }
  return set;
}

/**
 * 规则 A：拿总 PRD 的标准字段名去核每份模块/子 PRD。两种可疑情况：
 *   1) 后缀相同、词干不同（生效时间 vs 变更时间）——大概率是同一个概念两个叫法
 *   2) 词干相同、后缀不同但同族（变更日期 vs 变更时间）——同一个字段的两套写法
 */
export function fieldNameConflicts({ standard, docs }) {
  const out = [];
  const stdList = [...standard];
  const stdStems = new Map(stdList.map((s) => [stemOf(s), s]));
  for (const d of docs) {
    const words = tableFieldWords(d.text);
    for (const w of words) {
      if (standard.has(w)) continue;
      const suf = suffixOf(w);
      if (!suf) continue;

      // 情况 2：词干一样，只是后缀换了
      const stem = stemOf(w);
      const sameStem = stdStems.get(stem);
      if (sameStem) {
        out.push({ doc: d.name, word: w, standard: sameStem, shared: stem.length, sameStem: true });
        continue;
      }

      // 情况 1：同后缀族里，总 PRD 用了另一个名字
      const fam = familyOf(suf);
      const same = stdList.filter((s) => fam.includes(suffixOf(s)));
      if (!same.length) continue;
      const best = same
        .map((s) => {
          let n = 0;
          while (n < Math.min(s.length, w.length) && s[n] === w[n]) n += 1;
          return { s, n };
        })
        .sort((a, b) => b.n - a.n)[0];
      out.push({ doc: d.name, word: w, standard: best.s, shared: best.n, sameStem: false });
    }
  }
  return out;
}

/** 规则 B：规则表行数 vs 验收标准条数 */
export function acCoverage(md) {
  const acs = new Set(String(md).match(/-AC\d+/g) || []);
  let ruleRows = 0;
  for (const b of tableBlocks(md)) {
    const head = b.header.join('|');
    // 定义表 / 属性表不算规则表：它们本来就不该逐行配验收
    const isDefTable = /定义|含义|属性/.test(head) && !/规则|场景/.test(head);
    if (isDefTable) continue;
    if (!/处理规则|规则|场景/.test(head)) continue;
    ruleRows += b.rows.length;
  }
  return { acCount: acs.size, ruleRows };
}

/** 规则 C（其一）：demo 里标注的功能点 */
export function demoFeatures(html) {
  const set = new Set();
  const re = /data-feature\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1].trim());
  return set;
}

/**
 * 规则 C（其二）：拿 demo 的功能点集合与 PRD 里登记过的编号做双向比对。
 * ids 是 PRD 里「应当被 demo 覆盖」的编号（子需求 / 模块）。
 */
export function demoCoverage({ features, ids, hasDemo }) {
  const problems = [];
  const warns = [];
  if (!hasDemo) return { problems, warns };
  if (!features.size) {
    warns.push('demo 里还没有 data-feature 标记，没法跟 PRD 对覆盖。给每个功能块加 data-feature="BG-01" 就能自动比对');
    return { problems, warns };
  }
  const idSet = new Set(ids);
  for (const f of features) {
    if (!idSet.has(f)) problems.push(`demo 里做了「${f}」，但 PRD 里没有这个编号`);
  }
  for (const id of idSet) {
    if (!features.has(id)) warns.push(`PRD 有 ${id}，demo 里没有对应的 data-feature`);
  }
  return { problems, warns };
}

/**
 * 汇总。docs 形如 [{name, text}]，standard 为标准字段名集合。
 */
export function lintDocs({ standard, docs, features, prdIds, hasDemo }) {
  const problems = [];
  const warns = [];
  const details = { fieldConflicts: [], acBelowRules: [], demo: { features: [...(features || [])], missing: [] } };

  if (standard && standard.size) {
    for (const c of fieldNameConflicts({ standard, docs })) {
      const msg = c.sameStem
        ? `「${c.word}」和总 PRD 的「${c.standard}」词干一样、后缀不同，八成是同一个字段的两套写法（${c.doc}）`
        : `「${c.word}」不在总 PRD 的字段定义里；总 PRD 相近的是「${c.standard}」。${
            c.shared >= 2 ? '像是同一个东西的两个叫法' : '后缀一样但叫法不同，确认是不是同一个概念'
          }（${c.doc}）`;
      details.fieldConflicts.push(c);
      // 词干相同或前缀重合够多 → 提醒级；只是后缀撞车 → 当成要对齐的问题
      if (c.sameStem || c.shared >= 2) warns.push(msg);
      else problems.push(msg);
    }
  }

  for (const d of docs) {
    // 只有子需求 PRD 才查验收覆盖：总 PRD 是方案文档，模块 PRD 是合集，验收都在子需求那一层
    if (d.kind !== 'sub') continue;
    const cov = acCoverage(d.text);
    if (cov.ruleRows >= 3 && cov.acCount > 0 && cov.acCount * 2 < cov.ruleRows) {
      details.acBelowRules.push({ doc: d.name, ...cov });
      warns.push(`${d.name} 有 ${cov.ruleRows} 行规则但只有 ${cov.acCount} 条验收标准，八成有规则没被验收覆盖`);
    }
    if (cov.ruleRows >= 3 && cov.acCount === 0) {
      details.acBelowRules.push({ doc: d.name, ...cov });
      warns.push(`${d.name} 有 ${cov.ruleRows} 行规则却一条验收标准都没有`);
    }
  }

  const dc = demoCoverage({ features: features || new Set(), ids: prdIds || [], hasDemo });
  problems.push(...dc.problems);
  warns.push(...dc.warns);
  details.demo.missing = dc.warns.filter((w) => w.includes('没有对应的 data-feature'));

  return { problems, warns, details };
}
