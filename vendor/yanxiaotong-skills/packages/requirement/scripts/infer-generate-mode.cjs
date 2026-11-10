'use strict';

/**
 * 规划阶段：根据标题/正文/范围启发式识别实现方式与 AI-Coding 生成模式。
 * 输出 generateModeName 必须是 --modes 中的**已发布精确名**。
 */

const fs = require('fs');
const path = require('path');

/** 本地常见已发布名（可被 --modes 覆盖；须与配置页精确一致） */
const DEFAULT_MODES = ['S1：新增/大 需求', '改动需求/小需求', '缺陷'];

const TRADITIONAL_HINTS = [/传统开发/, /不走\s*AI[-_]?Coding/i, /纯人工/, /不使用\s*AI/];

/** 语义桶 → 匹配已发布名的别名关键词（按包含/正则） */
const BUCKETS = {
  new: {
    hints: [/新增/, /新建/, /新模块/, /从零/, /全新/, /新功能/, /新页面/, /立项/, /大需求/, /S1/],
    nameHints: [/新增/, /大\s*需求/, /S1/],
  },
  change: {
    hints: [/修改/, /改动/, /优化/, /调整/, /小需求/, /改文案/, /加按钮/, /增强/, /S2/],
    nameHints: [/改动/, /小需求/, /修改/, /S2/],
  },
  defect: {
    hints: [/缺陷/, /bug/i, /故障/, /报错/, /异常修复/, /线上问题/],
    nameHints: [/缺陷/, /bug/i],
  },
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--text') out.text = argv[++i];
    else if (a === '--path') out.path = argv[++i];
    else if (a === '--modes') out.modes = argv[++i];
    else if (a === '--modes-file') out.modesFile = argv[++i];
    else out._.push(a);
  }
  return out;
}

function loadModes(args) {
  if (args.modesFile) {
    const raw = JSON.parse(fs.readFileSync(args.modesFile, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.modes || raw.modeNames || [];
    return list.map(String);
  }
  if (args.modes) return args.modes.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  return DEFAULT_MODES.slice();
}

function classifyPublished(publishedModes) {
  const map = { new: [], change: [], defect: [], other: [] };
  for (const name of publishedModes) {
    if (BUCKETS.new.nameHints.some((re) => re.test(name))) map.new.push(name);
    else if (BUCKETS.change.nameHints.some((re) => re.test(name))) map.change.push(name);
    else if (BUCKETS.defect.nameHints.some((re) => re.test(name))) map.defect.push(name);
    else map.other.push(name);
  }
  return map;
}

function scoreBucket(text, bucketKey) {
  let n = 0;
  for (const re of BUCKETS[bucketKey].hints) if (re.test(text)) n += 1;
  return n;
}

function infer(text, publishedModes) {
  const t = String(text || '');
  if (TRADITIONAL_HINTS.some((re) => re.test(t))) {
    return {
      implementationType: 'TRADITIONAL',
      implementationTypeLabel: '传统开发',
      generateModeName: null,
      generateModeStatus: 'n/a',
      rationale: '正文出现传统开发/不走 AI-Coding 等表述，判定为传统开发，不写生成模式。',
      confidence: 'high',
    };
  }

  const classified = classifyPublished(publishedModes);
  const scores = {
    new: scoreBucket(t, 'new'),
    change: scoreBucket(t, 'change'),
    defect: scoreBucket(t, 'defect'),
  };

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1];

  const pickName = (bucket) => (classified[bucket] && classified[bucket][0]) || null;

  if (!best || best[1] <= 0 || !pickName(best[0])) {
    return {
      implementationType: 'AI_CODING',
      implementationTypeLabel: 'AI-Coding',
      generateModeName: null,
      generateModeStatus: 'pending',
      generateModeRaw: '[待确认]',
      rationale:
        '适用 AI-Coding，但无法根据标题/正文唯一匹配已发布模式名，填 [待确认]。请对照配置页精确名点选。',
      confidence: 'low',
      scores,
      publishedModes,
    };
  }

  if (second && second[1] === best[1] && best[1] > 0) {
    return {
      implementationType: 'AI_CODING',
      implementationTypeLabel: 'AI-Coding',
      generateModeName: null,
      generateModeStatus: 'pending',
      generateModeRaw: '[待确认]',
      rationale: `特征分并列（${best[0]}=${second[0]}=${best[1]}），无法唯一匹配，填 [待确认]。`,
      confidence: 'low',
      scores,
    };
  }

  const modeName = pickName(best[0]);
  return {
    implementationType: 'AI_CODING',
    implementationTypeLabel: 'AI-Coding',
    generateModeName: modeName,
    generateModeStatus: 'hit',
    rationale: `标题/正文命中「${best[0]}」特征（分=${best[1]}），写入已发布规范名「${modeName}」。`,
    confidence: best[1] >= 2 ? 'high' : 'medium',
    scores,
  };
}

function formatPropertyTable(result) {
  const modeCell =
    result.implementationType === 'TRADITIONAL'
      ? '（传统开发可不填）'
      : result.generateModeName || '[待确认]';
  return [
    '| 项 | 内容 |',
    '|----|------|',
    `| 实现方式 | ${result.implementationTypeLabel} |`,
    `| AI-Coding生成模式 | ${modeCell} |`,
    '',
    `> 判定依据：${result.rationale}`,
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  let text = args.text || '';
  if (args.path) text = fs.readFileSync(path.resolve(args.path), 'utf8');
  if (!text.trim()) {
    console.error('须提供 --text 或 --path');
    process.exit(1);
  }
  const modes = loadModes(args);
  const result = infer(text, modes);
  result.propertyTableMarkdown = formatPropertyTable(result);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = { infer, formatPropertyTable, DEFAULT_MODES, loadModes };
