/**
 * sh 工具的定义：名字、描述、参数、危险命令判断、结果渲染。
 *
 * 描述这部分很关键——它决定模型会不会在 Windows 上主动选 bash 而不是 PowerShell。
 * agent-experience 的规矩：把「什么时候用、怎么用、坑在哪」写在描述里，
 * 而不是指望模型自己记住。
 */

export const SH_TOOL_NAME = "sh";

export const SH_DESCRIPTION = [
  "在 Git Bash 里跑 shell 命令。**Windows 上默认用它，不要用 PowerShell。**",
  "",
  "为什么：PowerShell 会吃掉 `&&`、把中文参数变乱码、写文件带 BOM、嵌套引号到处出错，",
  "一个命令反复失败就是在浪费你的时间和用户的耐心。bash 没这些问题。",
  "",
  "用法：",
  "· cmd   一整段 bash 脚本，可以多行。支持 && || | > >> $() 变量 heredoc",
  "· cwd   工作目录，默认当前目录",
  "· timeoutMs  默认 120 秒，超时会被杀掉（退出码 124）",
  "· background=true  丢后台跑长任务，立刻返回 jobId；之后用它查进度",
  "· action=jobs / job / stop / kill  管理后台任务",
  "",
  "路径写法（Windows 盘符在 bash 里）：",
  "  D:\\Users\\x  →  /d/Users/x   或直接写 \"D:/Users/x\"",
  "  反斜杠是转义符，路径一律用正斜杠。",
  "",
  "几个 bash 写法对照（别再用 PowerShell 的）：",
  "  列目录      ls -la           不是 Get-ChildItem",
  "  找文件      find . -name '*.md'   不是 Get-ChildItem -Recurse",
  "  找内容      grep -rn '关键字' .   不是 Select-String",
  "  看文件头    head -n 40 f.txt      不是 Get-Content -TotalCount",
  "  环境变量    $HOME $PATH          不是 $env:HOME",
  "",
  "输出很长时会自动保留开头 + 结尾，中间省略——要看全的就重定向到文件再分页读。",
  "非零退出码会自动附一段「为什么失败、下一步怎么办」的诊断。",
  "",
  "注意：危险命令（rm -rf、git push -f、格式化磁盘）会被拦下来要求用户确认，",
  "确认了再带 confirmed=true 重发。不要自己想办法绕过。",
].join("\n");

export const SH_ACTIONS = ["run", "jobs", "job", "stop", "kill"];

export const SH_PARAMETERS = {
  action: {
    type: "string",
    enum: SH_ACTIONS,
    description: "run（默认，跑命令）/ jobs（列出后台任务）/ job（查某个任务）/ stop、kill（停掉任务）",
  },
  cmd: { type: "string", description: "要执行的 bash 脚本，可以多行。action=run 时必填。" },
  cwd: { type: "string", description: "工作目录绝对路径（Windows 路径就行，工具会自己转成 bash 路径）。" },
  timeoutMs: { type: "number", description: "超时毫秒数，默认 120000。长编译可调到 600000。" },
  background: { type: "boolean", description: "true = 丢后台跑，立刻返回 jobId，适合装依赖、跑测试、长时间构建。" },
  jobId: { type: "string", description: "action=job/stop/kill 时指定哪个任务。" },
  maxBytes: { type: "number", description: "输出上限字节数，默认 2MB；超了保留开头+结尾。" },
  stdin: { type: "string", description: "喂给脚本的标准输入（可选）。" },
  confirmed: {
    type: "boolean",
    description: "只有工具回来说「看起来是不可逆操作」、并且用户明确同意后，才填 true 重发。",
  },
};

/* ------------------------------------------------------------------ *
 * 危险命令：拦下来先问一句
 * ------------------------------------------------------------------ */

const DANGEROUS_RULES = [
  { re: /(^|[;&|]\s*|\b)(sudo\s+)?rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\*)(\s|$)/, why: "删根目录 / 家目录 / 通配符" },
  { re: /(^|[;&|]\s*|\b)(sudo\s+)?rm\s+-[a-zA-Z]*(rf|fr)[a-zA-Z]*\s/, why: "递归强删" },
  { re: /(^|[;&|]\s*)\s*git\s+push\b[^\n]*(--force\b|(?<=\s)-f\b)/, why: "强制推送，会覆盖远端历史" },
  { re: /(^|[;&|]\s*)\s*git\s+reset\s+--hard\b/, why: "丢弃所有未提交改动" },
  { re: /(^|[;&|]\s*)\s*git\s+clean\s+-[a-zA-Z]*[fd]/, why: "删除未跟踪文件" },
  { re: /(^|[;&|]\s*|\b)(sudo\s+)?(chmod|chown)\s+-R\b/, why: "递归改权限/属主" },
  { re: /(^|[;&|]\s*|\b)mkfs(\.|\s)/, why: "格式化文件系统" },
  { re: /(^|[;&|]\s*|\b)dd\s+[^\n]*of=\/dev\//, why: "直接写块设备" },
  { re: /(^|[;&|]\s*|\b)(shutdown|reboot)\b/, why: "关机 / 重启" },
  { re: /(^|[;&|]\s*)>[^>\n]*\/dev\/sd[a-z]/, why: "覆盖磁盘设备" },
  { re: /(^|[;&|]\s*|\b)(npm|yarn|pnpm)\s+publish\b/, why: "发布到公共 registry" },
  { re: /(^|[;&|]\s*)\s*git\s+push\b[^\n]*\s(main|master)(\s|$)/, why: "直接推主干" },
  { re: /:\(\)\s*\{.*\};\s*:/, why: "fork 炸弹" },
];

/**
 * 命中危险规则就返回一句给人看的说明，否则空串。
 *
 * 先剥掉单/双引号里的内容再判断——`grep -rn "rm -rf" docs/` 这种是在**搜索**这个字符串，
 * 不是要执行它，不能拦。
 */
export function looksDangerous(cmd) {
  if (!cmd) return "";
  const stripped = String(cmd)
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  for (const r of DANGEROUS_RULES) {
    if (r.re.test(stripped)) return r.why;
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * 参数校验
 * ------------------------------------------------------------------ */

export function validateArgs(args = {}) {
  const action = args.action || "run";
  if (!SH_ACTIONS.includes(action)) {
    return `不认识 action「${action}」，只能是：${SH_ACTIONS.join(" / ")}`;
  }
  if (action === "run" && !String(args.cmd || "").trim()) {
    return "action=run 需要 cmd（要执行的 bash 脚本）。";
  }
  if ((action === "job" || action === "stop" || action === "kill") && !args.jobId) {
    return `action=${action} 需要 jobId。先 action=jobs 看有哪些任务。`;
  }
  return "";
}

/** 把执行结果整理成一段人读的文本。 */
export function renderResult(value) {
  const lines = [];

  // 待确认优先：此时 ok=false，但要给出确认提示
  if (value?.needsConfirm) return value.confirmPrompt;

  // 工具自身出错（找不到 bash、参数不对）：带 error 且没有 exitCode，说明命令根本没跑起来
  if (!value?.ok && value?.error) {
    lines.push(`✗ ${value.error}`);
    if (value?.hint) lines.push("", value.hint);
    return lines.join("\n");
  }

  if (value.action === "jobs") {
    if (!value.jobs?.length) return "没有后台任务。";
    lines.push(`后台任务 ${value.jobs.length} 个：`);
    for (const j of value.jobs) {
      lines.push(`  ${j.id}  ${j.status}${j.exitCode !== null ? ` (exit ${j.exitCode})` : ""}  ${Math.round(j.runningMs / 1000)}s  ${j.script}`);
    }
    return lines.join("\n");
  }

  if (value.action === "job") {
    const j = value.job;
    if (!j) return "没有这个任务。";
    lines.push(`${j.id}  ${j.status}${j.exitCode !== null ? ` (exit ${j.exitCode})` : ""}  ${Math.round(j.runningMs / 1000)}s`);
    if (j.output) lines.push("", j.output);
    else lines.push("", "（还没有输出）");
    return lines.join("\n");
  }

  if (value.action === "stop") {
    return value.stopped ? `已停止 ${value.jobId}` : `没有这个任务：${value.jobId}`;
  }

  // run / background
  if (value.background) {
    lines.push(`已丢后台：${value.jobId}（pid ${value.pid}）`);
    lines.push("之后用 action=job jobId=" + value.jobId + " 看进度。");
    return lines.join("\n");
  }

  if (value.stdout) lines.push(value.stdout.trimEnd());
  if (value.stderr) {
    if (value.stdout) lines.push("", "--- stderr ---");
    lines.push(value.stderr.trimEnd());
  }
  if (!value.stdout && !value.stderr) lines.push("（没有输出）");

  lines.push("");
  lines.push(
    value.exitCode === 0
      ? `✓ exit 0  ${Math.round(value.durationMs)}ms`
      : `✗ exit ${value.exitCode}  ${Math.round(value.durationMs)}ms`,
  );
  if (value.truncated) lines.push("（输出太长，中间已省略）");
  if (value.diagnosis) {
    lines.push("", "--- 可能的原因 ---", value.diagnosis);
  }
  return lines.join("\n");
}
