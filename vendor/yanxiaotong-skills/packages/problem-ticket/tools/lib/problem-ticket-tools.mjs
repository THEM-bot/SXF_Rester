import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getActiveEnv,
  parseCli,
  publicEnvBaseUrl,
  publicEnvLabel,
  resolveToken,
} from '../../../../tools/lib/open-api-token.mjs';
import { fetchWithRetry } from '../../../../tools/lib/http-json.mjs';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const VERIFY_CJS = path.join(PACK_ROOT, 'scripts', 'verify-problem-ticket-response.cjs');

export { parseCli, publicEnvBaseUrl, publicEnvLabel, resolveToken, getActiveEnv };

export function sessionFilePath() {
  const env = getActiveEnv();
  return path.join(os.homedir(), '.yanxiaotong', 'sessions', env.env_slug, 'problem-ticket');
}

export function resolveBaseUrl(cliBase) {
  const b = String(cliBase || '').trim();
  return b || publicEnvBaseUrl();
}

export function stripBomText(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

export function parseJsonText(text) {
  return JSON.parse(stripBomText(text));
}

export function readJsonArg(jsonPath) {
  if (!jsonPath) throw new Error('--json is required');
  return parseJsonText(fs.readFileSync(path.resolve(String(jsonPath)), 'utf8'));
}

export function resolveOutPath(args) {
  return args.out ? path.resolve(String(args.out)) : null;
}

export function newIdempotencyKey() {
  return randomUUID();
}

export function validateIdempotencyKey(key) {
  const k = String(key || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(k)) {
    throw new Error('Idempotency-Key 须为 8-128 位字母、数字或 . _ : -');
  }
  return k;
}

export async function httpJson(method, urlPath, { token, body, baseUrl, headers } = {}) {
  const base = resolveBaseUrl(baseUrl);
  const t =
    token ||
    resolveToken({ environment: publicEnvLabel() }) ||
    (() => {
      throw new Error('No token');
    })();
  const url = `${base.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
  const init = {
    method,
    headers: {
      'X-Open-Api-Token': t,
      Accept: 'application/json',
      ...(headers || {}),
    },
  };
  if (body != null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetchWithRetry(() => fetch(url, init), { method, urlPath });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.success === false || (json.code != null && json.code !== 200 && json.code !== '200')) {
    const msg = json.message || json.msg || text.slice(0, 300);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function writeSessionPatch(patch) {
  const file = sessionFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let cur = {};
  if (fs.existsSync(file)) {
    try {
      cur = parseJsonText(fs.readFileSync(file, 'utf8'));
    } catch {
      cur = {};
    }
  }
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function looksLikeHtml(text) {
  return /<(p|ul|ol|li|br|div|h[1-6]|strong|em)\b/i.test(String(text || ''));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 纯文本 → HTML（详情页富文本）；已是块级 HTML 则原样。
 * 规则对齐 reference/create-defaults.md §描述 HTML。
 */
export function normalizeDescriptionHtml(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) return raw;

  const lines = raw.split('\n');
  const out = [];
  let listBuf = [];
  const flushList = () => {
    if (!listBuf.length) return;
    out.push(`<ul>${listBuf.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
    listBuf = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushList();
      continue;
    }
    const bullet = t.match(/^[-*·•]\s+(.+)$/) || t.match(/^\d+[.)、．]\s*(.+)$/);
    if (bullet) {
      listBuf.push(bullet[1]);
      continue;
    }
    flushList();
    if (/^(切片声明|切片自检|用户故事|验收标准|背景|问题描述|本卡闭环)$/.test(t)) {
      out.push(`<p><strong>${escapeHtml(t)}</strong></p>`);
      continue;
    }
    out.push(`<p>${escapeHtml(t)}</p>`);
  }
  flushList();
  return out.join('') || `<p>${escapeHtml(raw)}</p>`;
}

/** 确认表用：剥标签，保留换行；超长截断为前缀。 */
export function descriptionPreviewPlain(htmlOrText, maxLen = 800) {
  const s = stripHtmlToPlain(htmlOrText);
  if (!s) return '—';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

export function stripHtmlToPlain(htmlOrText) {
  return String(htmlOrText || '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 拒绝整卡搬迁，以及「全文约 N 行」式伪概况。
 * 描述必须是对用户问题内容的业务概况（做什么/约束/价值），不是文档长度说明。
 */
export function assertDescriptionIsAgentSummary(description, title = '') {
  const plain = stripHtmlToPlain(description);
  if (!plain) {
    throw new Error('问题描述不能为空：请先写对用户问题的业务概况再 prepare');
  }
  const reasons = [];
  if (plain.length > 700) {
    reasons.push(`过长（${plain.length} 字，概况目标约 80～400 字）`);
  }
  if (/标题须是/.test(plain)) {
    reasons.push('含卡片元说明「标题须是」');
  }
  if (/全文约\s*\d+\s*行|约\s*\d+\s*行|（全文|含切片声明|含切片自检/.test(plain)) {
    reasons.push('是「全文约 N 行 / 含切片…」式伪概况，不是对问题内容的总结');
  }
  // 禁止「收紧...」「…」截断式预览；概况须写完整句子，不要省略号糊弄
  if (/\.\.\.|……|…/.test(plain) && (plain.length < 120 || /全文|行\)|行）/.test(plain))) {
    reasons.push('含「.../…」截断预览；须写出完整业务概况，禁止用省略号代替内容');
  }
  const cardMarkers = ['切片声明', '切片自检', '用户故事', '本卡闭环'].filter((m) => plain.includes(m));
  if (cardMarkers.length >= 2) {
    reasons.push(`像故事卡原文（同时含：${cardMarkers.join('、')}）`);
  }
  const titleBare = String(title || '')
    .replace(/^SC-\d+-\d+\s*/, '')
    .trim();
  if (titleBare && plain.startsWith(titleBare) && plain.length > titleBare.length + 80) {
    reasons.push('正文以标题复述开头且过长');
  }
  const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 12) {
    reasons.push(`行数过多（${lines.length} 行）`);
  }
  if (!reasons.length) return;
  throw new Error(
    [
      '问题描述不合格，已拒绝 prepare/create。',
      `原因：${reasons.join('；')}`,
      '请写成对用户输入的业务概况（用户能做什么、关键约束、一句话价值），约 80～400 字。',
      '正确例：Demo 权限选人支持批量粘贴加人并在确认前预览；搜索仅显示当前账号可见人员，降低误授与越权风险；兼容已有单选能力。',
      '错误例：增量卡：…（全文约 146 行，含切片声明、闭环、用户故事等）',
    ].join('\n'),
  );
}
