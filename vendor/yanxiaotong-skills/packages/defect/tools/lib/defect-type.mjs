/**
 * 缺陷类型码表 / 显式解析 / Agent 语义写入
 * SSOT：reference/create-defaults.md §4 · M11 defectTypes
 *
 * v0.6：创建自动类型以 **Agent 语义判定**（`agent_infer`）为准；
 * 机侧关键词启发式仅作显式工具函数保留，**默认不参与** create 解析。
 */

/** 与 Web / M11 defectTypes 一致：码 → 中文 */
export const DEFECT_TYPE_LABELS = {
  '1': '预研问题',
  '2': '需求问题-版本范围内',
  '3': '需求问题-版本范围外',
  '4': '设计问题',
  '5': '编码问题',
  '6': '合入引发',
  '7': '历史遗留',
  '8': '改动引发',
};

export function defectTypeLabel(code) {
  if (code == null || code === '') return null;
  return DEFECT_TYPE_LABELS[String(code)] || String(code);
}

export function parseDefectType(text) {
  const t = String(text || '');
  if (/清空缺陷类型|清除缺陷类型/.test(t)) {
    return { clearDefectType: true };
  }
  const codeM = t.match(/(?:缺陷类型)\s*(?:改为|改成|变为|设为|为)?\s*[:：]?\s*([1-8])\b/);
  if (codeM) return { defectType: codeM[1], source: 'explicit' };
  // 长标签优先匹配，避免「需求问题」歧义
  const labels = Object.entries(DEFECT_TYPE_LABELS).sort((a, b) => b[1].length - a[1].length);
  for (const [code, label] of labels) {
    if (t.includes(label)) return { defectType: code, source: 'explicit' };
  }
  // 「缺陷类型：设计 / 编码」等简称
  const shortM = t.match(
    /(?:缺陷类型)\s*(?:改为|改成|变为|设为|为)?\s*[:：]?\s*(预研|设计|编码|合入|历史|改动|需求)/,
  );
  if (shortM) {
    const map = {
      预研: '1',
      需求: '2',
      设计: '4',
      编码: '5',
      合入: '6',
      历史: '7',
      改动: '8',
    };
    const code = map[shortM[1]];
    if (code) return { defectType: code, source: 'explicit' };
  }
  return null;
}

/**
 * 遗留：关键词启发式（默认 **不** 用于 create 自动填类型）
 * 仅供单测 / 显式 `keywordInfer: true` 调用。
 */
export const DEFECT_TYPE_INFER_RULES = [
  {
    code: '6',
    patterns: [/合入引发/, /合入后/, /合并引入/, /合码引发/, /merge\s*conflict/i, /合并冲突/],
  },
  {
    code: '8',
    patterns: [
      /改动引发/,
      /改动后/,
      /本次改动/,
      /回归引入/,
      /引入的(?:缺陷|问题|bug)/i,
      /改完后/,
      /发版后出现/,
      /上线后出现/,
    ],
  },
  {
    code: '7',
    patterns: [/历史遗留/, /一直存在/, /老问题/, /遗留问题/, /历史问题/, /很久以前/],
  },
  {
    code: '1',
    patterns: [/预研问题/, /预研阶段/, /调研阶段/, /\bPOC\b/i, /可行性验证/],
  },
  {
    code: '3',
    patterns: [/版本范围外/, /超出版本/, /不在本版本/, /范围外需求/, /下个版本才/],
  },
  {
    code: '2',
    patterns: [
      /需求问题/,
      /与需求不符/,
      /需求变更/,
      /验收不符/,
      /需求遗漏/,
      /需求理解/,
      /需求描述有误/,
      /和需求不一致/,
    ],
  },
  {
    code: '4',
    patterns: [
      /设计问题/,
      /样式/,
      /布局/,
      /\bUI\b/i,
      /错乱/,
      /视觉/,
      /交互设计/,
      /原型/,
      /\bUX\b/i,
      /对齐/,
      /间距/,
      /色值/,
      /字体/,
      /页面难看/,
      /显示错位/,
    ],
  },
  {
    code: '5',
    patterns: [
      /编码问题/,
      /报错/,
      /异常/,
      /\bNPE\b/i,
      /空指针/,
      /接口/,
      /超时/,
      /崩溃/,
      /\b500\b/,
      /死循环/,
      /内存泄漏/,
      /NullPointer/i,
      /Exception/i,
      /白屏/,
      /卡死/,
      /无响应/,
      /打不开/,
      /逻辑错误/,
      /计算错误/,
      /数据丢失/,
      /保存失败/,
      /提交失败/,
      /SQL/i,
      /前端报错/,
      /后端报错/,
      /JS\s*报错/i,
    ],
  },
];

export function inferDefectTypeFromContent(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const rule of DEFECT_TYPE_INFER_RULES) {
    for (const re of rule.patterns) {
      if (re.test(t)) {
        return { defectType: rule.code, source: 'content_infer' };
      }
    }
  }
  return null;
}

/**
 * 显式指定优先；关键词推断须显式 opts.keywordInfer（默认关闭）
 * @returns {{ defectType: string, source: 'explicit'|'content_infer' } | { clearDefectType: true } | null}
 */
export function resolveDefectType(text, contentForInfer = null, opts = {}) {
  const explicit = parseDefectType(text);
  if (explicit?.clearDefectType) return explicit;
  if (explicit?.defectType) return explicit;
  if (opts.keywordInfer) {
    const inferText = contentForInfer != null ? contentForInfer : text;
    return inferDefectTypeFromContent(inferText);
  }
  return null;
}

export function formatDefectTypeLabel(code, source) {
  const label = defectTypeLabel(code);
  if (!label) return '（未选）';
  if (source === 'content_infer' || source === 'agent_infer') {
    return `${label}（自动判定）`;
  }
  return label;
}

/**
 * 提炼 / Agent 写回缺陷类型：
 * - CLI/`--defect-type` 传入 → `agent_infer`（显式口令已在 intent 上则保留 explicit）
 * - 未传入 → **不**做关键词推断，保持「未选」（除非已有 explicit）
 * @param {object} intent
 * @param {{ defectType?: string|null, corpus?: string, source?: string, keywordInfer?: boolean }} opts
 */
export function applyDefectTypeToIntent(intent, {
  defectType = undefined,
  corpus = '',
  source = undefined,
  keywordInfer = false,
} = {}) {
  const next = { ...intent, _parse: { ...(intent._parse || {}) } };
  const explicitKeep =
    intent.defectTypeSource === 'explicit' && intent.defectType
      ? { defectType: String(intent.defectType), source: 'explicit' }
      : null;

  let resolved = null;
  if (defectType != null && String(defectType).trim() !== '') {
    const code = String(defectType).trim();
    if (explicitKeep) {
      resolved = explicitKeep;
    } else {
      resolved = {
        defectType: code,
        source: source || 'agent_infer',
      };
    }
  } else if (explicitKeep) {
    resolved = explicitKeep;
  } else if (keywordInfer) {
    const text =
      corpus || [intent.title, intent.description, intent.source_content].filter(Boolean).join('\n');
    resolved = resolveDefectType('', text, { keywordInfer: true });
  }

  if (resolved?.defectType) {
    next.defectType = String(resolved.defectType);
    next.defectTypeSource = resolved.source;
    next.defectTypeLabel = formatDefectTypeLabel(resolved.defectType, resolved.source);
    next._parse.defect_type_source = resolved.source;
  } else {
    delete next.defectType;
    next.defectTypeLabel = '（未选）';
    next.defectTypeSource = null;
    next._parse.defect_type_source = null;
  }
  return next;
}
