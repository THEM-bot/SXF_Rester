/**
 * sh 工具：用 Git Bash 跑命令，替代 PowerShell。
 *
 * 为什么要有它：Windows 上 agent 用 PowerShell 干活，经常撞到这几类坑——
 * 引号被 PS 解析器吃掉、`&&` 老版本不认、`node -e` 内联中文乱码、
 * `>` 重定向写出 BOM、管道捕获子进程输出 EPERM。用 bash 这些坑基本没了。
 *
 * 这个文件只管「怎么找到 bash + 怎么把一个脚本跑起来 + 怎么把结果整理成人能读的样子」，
 * 参数校验和危险命令判断在 tool.js。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SH_TOOL_NAME = "sh";

/* ------------------------------------------------------------------ *
 * 找 bash
 * ------------------------------------------------------------------ */

const WIN_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\sh.exe",
  "C:\\msys64\\usr\\bin\\bash.exe",
  "C:\\cygwin64\\bin\\bash.exe",
];

const UNIX_BASH_CANDIDATES = [
  "/bin/bash",
  "/usr/bin/bash",
  "/usr/local/bin/bash",
  "/opt/homebrew/bin/bash",
];

let cachedBash = null;

/** 返回 bash 可执行文件路径；找不到就 null。 */
export function findBash(env = process.env) {
  if (env.PMF_BASH && fs.existsSync(env.PMF_BASH)) return env.PMF_BASH;
  if (cachedBash && fs.existsSync(cachedBash)) return cachedBash;

  const list = process.platform === "win32" ? WIN_BASH_CANDIDATES : UNIX_BASH_CANDIDATES;
  for (const p of list) {
    try {
      if (fs.existsSync(p)) { cachedBash = p; return p; }
    } catch { /* 忽略权限问题，继续找下一个 */ }
  }
  return null;
}

/** 给人类看的说明：找不到 bash 时怎么办。 */
export function missingBashHint() {
  if (process.platform !== "win32") return "本机没有找到 bash，请安装后重试（或设置 PMF_BASH 指向 bash 可执行文件）。";
  return [
    "本机没有找到 bash（Git Bash）。",
    "",
    "装一个 Git for Windows 就行：https://git-scm.com/download/win",
    "装好后默认路径是 C:\\Program Files\\Git\\bin\\bash.exe，本工具会自动找到它。",
    "如果你装在别处，设环境变量 PMF_BASH 指向 bash.exe 即可。",
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * 把 Windows 路径换成 bash 能懂的路径
 * ------------------------------------------------------------------ */

/**
 * `D:\a\b` → `/d/a/b`。已经是 / 开头的原样返回。
 * 只在 Windows 上做这个转换，而且只对「看起来像 Windows 绝对路径」的做。
 */
export function toBashPath(p) {
  if (!p) return p;
  if (process.platform !== "win32") return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p.replace(/\\/g, "/");
  return `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

/** 反过来：bash 里的 /d/a/b → D:/a/b，好让 Node 侧能比对路径。 */
export function fromBashPath(p) {
  if (!p) return p;
  if (process.platform !== "win32") return p;
  const m = /^\/([A-Za-z])\/(.*)$/.exec(p);
  if (!m) return p;
  return `${m[1].toUpperCase()}:/${m[2]}`;
}

/* ------------------------------------------------------------------ *
 * 跑脚本
 * ------------------------------------------------------------------ */

/**
 * 用 bash 跑一个脚本。
 *
 * 做法：把脚本写进临时文件，`bash -l <file>` 执行——避免命令行长度限制，
 * 也避免把多行脚本塞进 argv 被各处转义搞坏。
 *
 * @returns {Promise<{ok, exitCode, stdout, stderr, truncated, durationMs, bashPath}>}
 */
export async function runScript(script, opts = {}) {
  const {
    cwd,
    timeoutMs = 120_000,
    maxBytes = 2 * 1024 * 1024,
    env = {},
    stdin,
  } = opts;

  const bash = findBash();
  if (!bash) {
    const err = new Error(missingBashHint());
    err.code = "NO_BASH";
    throw err;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmf-sh-"));
  const scriptFile = path.join(tmpDir, "cmd.sh");
  const outFile = path.join(tmpDir, "out.log");
  const errFile = path.join(tmpDir, "err.log");

  // 统一 LF，避免 CRLF 让 bash 报 `$'\r': command not found`
  fs.writeFileSync(scriptFile, script.replace(/\r\n/g, "\n"), "utf8");

  const outFd = fs.openSync(outFile, "w");
  const errFd = fs.openSync(errFile, "w");
  const startedAt = Date.now();

  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(bash, ["-l", toBashPath(scriptFile)], {
      cwd: cwd || process.cwd(),
      stdio: [stdin === undefined ? "ignore" : "pipe", outFd, errFd],
      env: {
        ...process.env,
        // 让 git 别在输出里混进回车进度条
        GIT_PAGER: "cat",
        PAGER: "cat",
        TERM: "dumb",
        LANG: process.env.LANG || "C.UTF-8",
        ...env,
      },
      windowsHide: true,
    });

    if (stdin !== undefined && child.stdin) {
      child.stdin.end(stdin);
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* 已经退了 */ }
    }, timeoutMs);

    const result = await new Promise((resolve) => {
      child.on("error", (e) => resolve({ error: e }));
      child.on("close", (code, signal) => resolve({ code, signal }));
    });

    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;

    let stdout = readHeadAndTail(outFile, maxBytes);
    let stderr = readHeadAndTail(errFile, maxBytes);

    if (result.error) {
      return {
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: `${result.error.message}`,
        truncated: false,
        durationMs,
        bashPath: bash,
      };
    }

    const exitCode = timedOut ? 124 : result.code ?? (result.signal ? 137 : -1);

    if (timedOut) {
      stderr += `\n\n[超时] 命令跑了 ${Math.round(durationMs / 1000)} 秒还没结束，已被终止。\n` +
        `如果它就是慢，把 timeoutMs 调大；如果它该一直跑，用 background=true 丢后台。`;
    }

    return {
      ok: exitCode === 0,
      exitCode,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      durationMs,
      bashPath: bash,
    };
  } finally {
    try { fs.closeSync(outFd); } catch { /* ignore */ }
    try { fs.closeSync(errFd); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * 读日志文件，超长就保留**开头几行 + 结尾大部分**。
 *
 * 为什么留开头：报错和命令回显通常在前面，能看出它到底跑没跑对。
 * 为什么留结尾：编译/测试/安装的结果在最后，那是真正要看的。
 */
export function readHeadAndTail(file, maxBytes) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return { text: "", truncated: false };
  }
  if (buf.length <= maxBytes) return { text: buf.toString("utf8"), truncated: false };

  const headBytes = Math.min(4 * 1024, Math.floor(maxBytes * 0.15));
  const tailBytes = maxBytes - headBytes;
  const head = buf.subarray(0, headBytes).toString("utf8");
  const tail = buf.subarray(buf.length - tailBytes).toString("utf8");
  const dropped = buf.length - headBytes - tailBytes;
  const mark = `\n\n... [中间省略 ${formatBytes(dropped)}，共 ${formatBytes(buf.length)}；要看全的把它写到文件里再读] ...\n\n`;
  return { text: head + mark + tail, truncated: true };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * 失败诊断：把 bash 侧的真实报错翻译成「下一步该干嘛」
 * ------------------------------------------------------------------ */

const DIAGNOSES = [
  {
    test: /command not found|: not found$/m,
    hint: (m) => [
      `找不到命令「${m}」。`,
      "常见原因：",
      "  1. 这个工具没装，或没加进 PATH（bash -lc 加载的是登录 shell 的 PATH）",
      "  2. 是 Windows 原生程序但不在 PATH——用绝对路径，例如 /c/Windows/System32/xxx.exe",
      "  3. 想调 PowerShell 命令（Get-ChildItem 之类）→ bash 里不认，要么用 ls，要么显式 powershell -Command",
    ].join("\n"),
  },
  {
    test: /No such file or directory/,
    hint: () => [
      "路径不存在。Windows 盘符在 bash 里这么写：",
      "  D:\\Users\\x  →  /d/Users/x   （或者直接写 \"D:/Users/x\" 也行）",
      "另外注意反斜杠：bash 里 \\ 是转义符，路径尽量用正斜杠。",
    ].join("\n"),
  },
  {
    test: /Permission denied/,
    hint: () => "没有执行权限：脚本用 chmod +x，或者 bash script.sh 显式执行；写文件被拒则检查是不是在受保护目录。",
  },
  {
    test: /\$'\\r': command not found|syntax error near unexpected token `\$'\\r'/,
    hint: () => "脚本里有 CRLF 换行。本工具已统一转成 LF，若这条是子脚本报的，对它跑一次 dos2unix 或 sed -i 's/\\r$//'。",
  },
  {
    test: /unexpected EOF while looking for matching/,
    hint: () => "引号没配对。多行脚本建议用 heredoc：cat <<'EOF' ... EOF（单引号包住 EOF 可防变量展开）。",
  },
  {
    test: /ENOSPC|No space left/,
    hint: () => "磁盘满了。",
  },
  {
    test: /cmd\.exe|The system cannot find the path specified/i,
    hint: () => "这条是 cmd.exe 报的错，说明命令被转交给了 Windows 侧程序，路径要用反斜杠或双引号包住。",
  },
];

/** 根据退出码和 stderr 给一句「接下来该干嘛」。没问题就返回空串。 */
export function diagnose({ exitCode, stdout = "", stderr = "", script = "" }) {
  if (exitCode === 0) return "";

  const blob = `${stderr}\n${stdout}`;

  // 用户脚本自己 exit 1（比如 grep 没匹配到）——这不算故障，别硬塞诊断
  const looksLikeGrepMiss = /^grep\b/m.test(script) && exitCode === 1;
  if (looksLikeGrepMiss) return "grep 没匹配到内容（退出码 1），这通常是正常结果，不是错误。";

  for (const d of DIAGNOSES) {
    const m = d.test.exec(blob);
    if (m) return d.hint(m);
  }

  if (exitCode === 126) return "命令存在但没有执行权限。";
  if (exitCode === 127) return "命令不存在，检查拼写和 PATH。";
  if (exitCode === 130) return "被 Ctrl-C / SIGINT 中断。";
  if (exitCode === 137) return "进程被 SIGKILL 杀掉（可能是超时或被系统回收内存）。";
  if (exitCode === 124) return "超时。";

  // 只报了 exit N 没给原因，提示往 stderr 找
  if (!stderr.trim()) return `退出码 ${exitCode}，但没有任何错误输出——可能脚本里用了 exit ${exitCode}，或者错误被重定向掉了。`;
  return "";
}

/* ------------------------------------------------------------------ *
 * 后台长任务
 * ------------------------------------------------------------------ */

const jobs = new Map();
let jobSeq = 0;

/** 起一个后台任务，返回 jobId。 */
export async function startJob(script, opts = {}) {
  const bash = findBash();
  if (!bash) { const e = new Error(missingBashHint()); e.code = "NO_BASH"; throw e; }

  jobSeq += 1;
  const id = `sh-${jobSeq}`;
  const logDir = path.join(os.tmpdir(), "pmf-sh-jobs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${id}.log`);
  const scriptFile = path.join(logDir, `${id}.sh`);
  fs.writeFileSync(scriptFile, script.replace(/\r\n/g, "\n") + "\n", "utf8");

  const fd = fs.openSync(logFile, "w");
  const { spawn } = await import("node:child_process");
  // -l 会加载登录 shell 的 PATH，但也可能 fork；用 -c 'bash file' 两层保证 exit code 传到我们手上
  const child = spawn(bash, ["-l", toBashPath(scriptFile)], {
    cwd: opts.cwd || process.cwd(),
    stdio: ["ignore", fd, fd],
    env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat", TERM: "dumb", LANG: process.env.LANG || "C.UTF-8", ...(opts.env || {}) },
    windowsHide: true,
  });
  fs.closeSync(fd);

  const job = {
    id,
    pid: child.pid,
    script: script.slice(0, 200),
    cwd: opts.cwd || process.cwd(),
    logFile,
    startedAt: Date.now(),
    status: "running",
    exitCode: null,
    child,
    stopRequested: false,
  };
  child.on("close", (code, signal) => {
    if (job.stopRequested) {
      job.status = "stopped";
      job.exitCode = null;
    } else {
      job.status = code === 0 ? "done" : "failed";
      job.exitCode = code;
    }
    job.endedAt = Date.now();
  });
  child.on("error", () => { job.status = "failed"; job.exitCode = -1; job.endedAt = Date.now(); });

  jobs.set(id, job);
  return id;
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  let output = "";
  try {
    output = readHeadAndTail(job.logFile, 200 * 1024).text;
  } catch { /* 日志可能还没建 */ }
  return {
    id: job.id,
    pid: job.pid,
    status: job.status,
    exitCode: job.exitCode,
    cwd: job.cwd,
    runningMs: (job.endedAt || Date.now()) - job.startedAt,
    output,
    logFile: job.logFile,
  };
}

export function listJobs() {
  return [...jobs.values()].map((j) => ({
    id: j.id,
    pid: j.pid,
    status: j.status,
    exitCode: j.exitCode,
    cwd: j.cwd,
    runningMs: (j.endedAt || Date.now()) - j.startedAt,
    script: j.script,
  }));
}

export async function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  job.stopRequested = true;
  try { job.child.kill("SIGKILL"); } catch { /* 已结束 */ }
  // 进程树在 Windows 上 SIGKILL 未必能收掉 bash 派的子进程，补一刀
  if (process.platform === "win32" && job.pid) {
    try {
      const { spawnSync } = await import("node:child_process");
      spawnSync("taskkill", ["/PID", String(job.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch { /* 已经没了 */ }
  }
  if (job.status === "running") job.status = "stopped";
  return true;
}
