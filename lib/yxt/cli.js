/**
 * 研效通子包 CLI 的统一调用层。
 *
 * 为什么要有这一层：
 * 1. 六个子包的 CLI 都在 `packages/<pkg>/tools/*-api.mjs`，参数风格一致但输出位置不同
 *    （有的只认 --out，有的写 stdout），散在业务代码里会很乱。
 * 2. Windows 上中文参数走命令行极易被编码吃掉，所以**一律写 JSON 体到临时文件**再
 *    用 `--json` 传路径，不把中文放到 argv 里。
 * 3. 本机沙箱禁止管道捕获子进程输出（spawn 带 pipe 会 EPERM），所以用文件 fd 做 stdio。
 *
 * 平台纪律（yanxiaotong-skills 的 PLATFORM.md）：
 * - 禁止 `cd path && node ...`，一律绝对路径 → 我们直接用绝对路径调脚本。
 * - 禁止 `>` 重定向捕获 JSON → 我们读 --out 落盘文件。
 * - 禁止 PowerShell 写 JSON（会带 BOM）→ 我们用 Node 写 UTF-8 无 BOM。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** 子包名 → CLI 文件名 */
export const PKG_TOOLS = {
  requirement: 'requirement-api.mjs',
  task: 'task-api.mjs',
  defect: 'defect-api.mjs',
  'original-requirement': 'original-requirement-api.mjs',
  'org-todo': 'org-todo-api.mjs',
  'problem-ticket': 'problem-ticket-api.mjs',
};

/** demo 子包的脚本不叫 *-api.mjs，单独列出 */
export const DEMO_TOOLS = {
  create: 'create-demo.mjs',
  upload: 'upload-demo.mjs',
  pack: 'pack-mock-zip.mjs',
  preview: 'preview-upload-params.mjs',
  meta: 'fetch-metadata.mjs',
};

/** 子包的中文名，报错时好懂一点 */
export const PKG_LABEL = {
  requirement: '需求',
  task: '任务',
  defect: '缺陷',
  'original-requirement': '原始需求',
  'org-todo': '组织待办',
  'problem-ticket': '问题单',
  demo: 'Demo',
};

let tempDirCache = null;

/** 临时目录：%TEMP%/pmf-yxt */
export function yxtTempDir() {
  if (tempDirCache) {
    if (fs.existsSync(tempDirCache)) return tempDirCache;
  }
  const dir = path.join(os.tmpdir(), 'pmf-yxt');
  fs.mkdirSync(dir, { recursive: true });
  tempDirCache = dir;
  return dir;
}

let seq = 0;

/** 生成一个本次调用专用的临时文件路径 */
export function tempPath(ext = '.json') {
  seq += 1;
  const stamp = `${Date.now()}-${process.pid}-${seq}`;
  return path.join(yxtTempDir(), `t-${stamp}${ext}`);
}

/** 写 JSON 到临时文件（UTF-8 无 BOM），返回文件路径 */
export function writeJsonTemp(obj) {
  const file = tempPath('.json');
  // 显式无 BOM：Node 默认就不写 BOM，但保持"知道这事"的意图
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, { encoding: 'utf8' });
  return file;
}

/** 读文本文件，不存在返回 null */
export function readTextFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** 从任意文本里抠出第一个 JSON 对象/数组 */
export function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 继续找 */
  }
  // 找到第一段看起来完整的 {...} 或 [...]
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = trimmed.indexOf(open);
    if (start < 0) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/**
 * 平台返回的英文错误翻成人话。
 * 常见：401 token 失效 / 400 必填缺失 / 403 无权限 / 404 单据不存在 / 409 冲突。
 */
export function humanizeError(status, message) {
  const msg = String(message || '').trim();
  const byStatus = {
    401: '研效通 token 失效或过期。去 研效通 → 个人设置 → 开放 API 令牌 重新生成，写进 ~/.yanxiaotong/tokens/prod',
    403: '这个账号没有该操作的权限（可能是项目/业务领域范围外的单据）。',
    404: '平台里找不到这张单据，检查编号是不是抄错了。',
    409: '平台说状态冲突：这张单据当前的状态不允许这个操作。',
    429: '调得太频繁了，等一会儿再试。',
  };
  if (byStatus[status]) return `${byStatus[status]}${msg ? `（平台原话：${msg}）` : ''}`;
  if (status === 400) {
    if (/token/i.test(msg)) return `token 有问题：${msg}`;
    return `平台拒收了这个请求体：${msg}`;
  }
  if (status >= 500) return `研效通服务端出错（${status}）：${msg}`;
  return msg;
}

/** 从 CLI 输出里找平台错误（shape 因包而异，统一兜一下） */
function pickError(json, stderrText) {
  if (json) {
    const status = json.status ?? json.httpStatus ?? json.code;
    const message =
      json.message ??
      json.msg ??
      json.error?.message ??
      (typeof json.error === 'string' ? json.error : '') ??
      '';
    if (message || (typeof status === 'number' && status >= 400)) {
      return humanizeError(typeof status === 'number' ? status : 400, message);
    }
  }
  const m = String(stderrText || '').match(/(?:Error|错误)[:：]\s*(.+)/);
  if (m) return m[1].trim();
  return '';
}

/**
 * 跑一个子包的 CLI。
 * @param {string} root 研效通技能包根目录
 * @param {string} pkg  子包名（PKG_TOOLS 的键）
 * @param {string[]} args 参数（不含 node 与脚本路径）
 * @param {object} opts  { timeoutMs, wantOut }
 * @returns {{ok:boolean, exitCode:number, json:any, stdout:string, stderr:string, error:string, argv:string[]}}
 */
export function runYxt(root, pkg, args = [], opts = {}) {
  const tool = PKG_TOOLS[pkg];
  if (!tool) throw new Error(`未知子包：${pkg}（可选：${Object.keys(PKG_TOOLS).join(' / ')}）`);
  const script = path.join(root, 'packages', pkg, 'tools', tool);
  if (!fs.existsSync(script)) {
    throw new Error(`找不到 ${PKG_LABEL[pkg] || pkg} 子包的 CLI：${script}。用 pmw yxt doctor 检查研效通包路径。`);
  }
  return spawnCli(script, args, opts);
}

/** 跑 demo 子包的脚本 */
export function runDemo(root, which, args = [], opts = {}) {
  const name = DEMO_TOOLS[which];
  if (!name) throw new Error(`未知 demo 脚本：${which}（可选：${Object.keys(DEMO_TOOLS).join(' / ')}）`);
  const script = path.join(root, 'packages', 'demo', 'tools', name);
  if (!fs.existsSync(script)) {
    throw new Error(`找不到 demo 子包脚本：${script}`);
  }
  return spawnCli(script, args, opts);
}

/** 真正起子进程：文件 fd 做 stdio，绕开沙箱对 pipe 的限制 */
function spawnCli(script, args, opts = {}) {
  const { timeoutMs = 180000, wantOut = true } = opts;
  const dir = yxtTempDir();
  const outFile = tempPath('.out.json');
  const stdoutFile = tempPath('.stdout.log');
  const stderrFile = tempPath('.stderr.log');

  const argv = [script, ...args];
  const hasOut = args.some((a) => a === '--out' || a === '--out-dir');
  const outOk = wantOut && !hasOut;
  if (outOk) argv.push('--out', outFile);

  const outFd = fs.openSync(stdoutFile, 'w');
  const errFd = fs.openSync(stderrFile, 'w');
  let res;
  try {
    res = spawnSync(process.execPath, argv, {
      cwd: dir,
      stdio: ['ignore', outFd, errFd],
      timeout: timeoutMs,
      windowsHide: true,
      env: process.env,
    });
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }

  const stdout = readTextFile(stdoutFile) || '';
  const stderr = readTextFile(stderrFile) || '';

  let json = null;
  if (outOk) {
    const fromFile = readTextFile(outFile);
    if (fromFile) json = extractJson(fromFile);
  }
  if (!json) json = extractJson(stdout);

  const exitCode = typeof res?.status === 'number' ? res.status : res?.signal ? -1 : -2;
  let ok = exitCode === 0;
  let error = '';
  if (!ok) {
    error = pickError(json, stderr) || (res?.error ? String(res.error.message || res.error) : '');
    if (!error && res?.signal) error = `子进程被信号 ${res.signal} 终止（可能超时）`;
    if (!error) error = `研效通 CLI 退出码 ${exitCode}`;
  } else if (json && (json.success === false || json.ok === false)) {
    ok = false;
    error = pickError(json, stderr) || '研效通返回失败';
  }

  // 清理本次的中间文件；排查问题时设 PMF_YXT_KEEP=1 保留
  const keep = process.env.PMF_YXT_KEEP === '1';
  if (keep) {
    console.error(`[yxt] keep artifacts: ${outFile} ${stdoutFile} ${stderrFile}`);
  } else {
    for (const f of [outFile, stdoutFile, stderrFile]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* 忽略 */
      }
    }
  }

  return { ok, exitCode, json, stdout, stderr, error, argv: argv.slice(1) };
}

/** 从 CLI 返回里取 data（各包都是 { data: {...} } 形状） */
export function dataOf(res) {
  if (!res?.json) return null;
  const j = res.json;
  if (j.data && typeof j.data === 'object') return j.data;
  if (j.result && typeof j.result === 'object') return j.result;
  return j;
}
