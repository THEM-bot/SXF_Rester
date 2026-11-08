/**
 * 角色定义装载器 —— 六个 agent 的说明书（agents/roles/*.md）的统一入口。
 *
 * 每个角色是一个独立的运行时技能 + 一份可被 Rester 派活的提示词。
 * 文件本身就是说明书，代码只做「读 + 拼」，不在 JS 里再写一遍规则。
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, "..");
export const ROLES_DIR = path.join(PACKAGE_ROOT, "agents", "roles");

/**
 * 角色清单。
 * - file：说明书文件名
 * - skill：注册成技能时的名字（kebab-case，DSH 要求）
 * - label：中文名，给用户看
 * - when：什么时候用它（技能描述里的 whenToUse）
 */
export const ROLES = [
  {
    key: "resid",
    file: "60-rester.md",
    skill: "pm-rester",
    label: "Rester · 调度",
    brief: "使用者主要对接这个角色：判断该谁上、派活、管节奏、推研效通。默认入口。",
    when: "用户说「这个需求到哪一步了 / 下一步干嘛 / 推到研效通 / 帮我看看这个需求」等任何没有明确指向某个具体产出的话时，先由 Rester 接。",
  },
  {
    key: "recorder",
    file: "10-recorder.md",
    skill: "pm-recorder",
    label: "Recorder · 收料",
    brief: "翻全部材料，还原需求全景：做什么、有哪些活、找谁、哪里有冲突。",
    when: "用户刚丢进来一堆材料（纪要、业务文档、邮件、demo、旧 PRD），或需要把一件事摸清楚再动手时。",
  },
  {
    key: "writer",
    file: "20-writer.md",
    skill: "pm-writer",
    label: "Writer · 写 PRD",
    brief: "写总 PRD、拆模块、写模块 PRD。分两遍：先骨架，再填满。",
    when: "需要写或改 PRD、需要把总 PRD 拆成分模块 PRD 时。",
  },
  {
    key: "maker",
    file: "30-maker.md",
    skill: "pm-maker",
    label: "Maker · 做 Demo",
    brief: "做 HTML 原型。分两遍：先页面结构说明，确认后生成单文件 HTML。",
    when: "需要做或改交互 demo、原型页面，或需要把 PRD 变成能点的东西时。",
  },
  {
    key: "shouter",
    file: "40-shouter.md",
    skill: "pm-shouter",
    label: "Shouter · 应询",
    brief: "开发或业务来质疑时，翻材料替他答；每答一次都要落台账。",
    when: "用户贴进开发的问题、评审会上的连环问，或问「这个我要怎么答」时。",
  },
  {
    key: "tester",
    file: "50-tester.md",
    skill: "pm-tester",
    label: "Tester · 挑错",
    brief: "查字段一致性、PRD 与 demo 覆盖、验收标准、跨模块冲突、业务视角。只报不改。",
    when: "用户说「检查一下 / 挑挑毛病」，或累计改动较多需要扫一遍时。",
  },
];

/** 共同底座：纪律。六个角色都要读。 */
export const BASE_FILE = "00-共同底座.md";

/** 业务域档案：世界。六个角色都要读，也知道「我在给谁干活」。 */
export const DOMAIN_FILE = "00-业务域档案.md";

function readRoleFile(name) {
  const p = path.join(ROLES_DIR, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").trim() : "";
}

/** 业务域档案正文（可作为独立技能加载）。 */
export function loadDomain() {
  return readRoleFile(DOMAIN_FILE);
}

/**
 * 读一份说明书正文。
 * withBase=true 时按「共同底座 → 业务域档案 → 本角色」顺序拼好——
 * 顺序不能反：先讲纪律（怎么说话），再讲世界（我们在干什么），最后才是本角色的手艺。
 */
export function loadRoleDoc(roleKey, { withBase = false } = {}) {
  const role = ROLES.find((r) => r.key === roleKey);
  if (!role) return null;
  const body = readRoleFile(role.file);
  if (!body) return null;
  if (!withBase) return body;

  const parts = [readRoleFile(BASE_FILE), readRoleFile(DOMAIN_FILE), body].filter(Boolean);
  return parts.join("\n\n---\n\n");
}

/**
 * 业务域档案注册成独立技能，任何角色随时可以单独加载它。
 * 名字带 pm- 前缀，和六个角色技能保持一致。
 */
export function domainSkillDefinition() {
  const content = loadDomain();
  if (!content) return null;
  return {
    name: "pm-domain",
    description:
      "深信服 ToB 内部供应链与财经的业务域档案：系统全景、订单生命周期、型号与配置、库存六个口径、财经与结账节奏、主数据、这张网里的人、术语词典、七类常见需求的标准结构、做对了的四条判据。",
    whenToUse:
      "需要判断「这个需求插在哪条线上 / 这个数从哪来 / 这个字段归谁维护 / 该找谁确认」，或者要写立项报告、PRD 背景、汇报材料，需要先把业务世界对齐时。写 PRD、做 demo、回答开发质疑之前先过一遍。",
    content,
  };
}

/** 角色总图（六人怎么配合）。 */
export function loadOverview() {
  const p = path.join(ROLES_DIR, "00-角色总图.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").trim() : "";
}

/** 剥掉 Markdown frontmatter（说明书本身没有，但万一以后加了）。 */
function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

/** 注册用的技能定义（content 用说明书全文，不含共同底座——底座由 SKILL.md 主技能提供）。 */
export function skillDefinitionFor(role) {
  const body = loadRoleDoc(role.key, { withBase: false });
  if (!body) return null;
  return {
    name: role.skill,
    description: `${role.label}：${role.brief}`,
    whenToUse: role.when,
    content: stripFrontmatter(body),
  };
}

/**
 * 生成派给某个角色的子会话提示词。
 * 结构固定，见 agents/roles/00-角色总图.md 里「派活时给子会话的提示词结构」。
 */
export function buildDelegationPrompt(roleKey, { projectDir, projectTitle, kind, stageName, task, upstream, writable }) {
  const role = ROLES.find((r) => r.key === roleKey);
  if (!role) return null;
  const overlay = [
    `# 你的角色：${role.label}`,
    "",
    `先读这三份文件（用 read 工具，绝对路径，按顺序读）：`,
    `1. ${path.join(ROLES_DIR, BASE_FILE)}　（纪律：怎么说话、不许做什么）`,
    `2. ${path.join(ROLES_DIR, DOMAIN_FILE)}　（世界：这家公司在干什么、系统长什么样）`,
    `3. ${path.join(ROLES_DIR, role.file)}　（你的手艺：这个角色具体怎么做）`,
    "",
    "读完再动手。三份都不许跳——跳过第 2 份，你写出来的东西会一眼被看出「不懂业务」。",
    "",
    "下面是本次任务。",
    "",
    "## 项目",
    `- 目录：${projectDir || "（未指定）"}`,
    `- 名称：${projectTitle || "（未指定）"}`,
    `- 类型：${kind === "req" ? "小需求" : "大需求"}`,
    `- 当前阶段：${stageName || "（未知）"}`,
    "",
    "## 你要做的事",
    task || "（未指定 —— 必须问清楚再动手）",
  ];

  // 项目目录在工作区外时，子会话写不进去——提前说清楚，别让它撞墙后才发现
  if (writable === false) {
    const inboxFile = path.join(PACKAGE_ROOT, "inbox", `${path.basename(projectDir || "project")}-<文件名>.md`);
    overlay.push(
      "",
      "## ⚠ 落盘限制（必须先看）",
      "项目目录在**当前会话的工作区之外**，你的 write / edit 工具会被沙箱拒绝（表现为 UnauthorizedAccessException / EPERM / 路径不存在）。",
      `- 需要落盘的 md 内容，写到工作区内：\`${inboxFile}\``,
      "- 在返回里**写出该文件绝对路径**，调用方会把它复制到项目目录。",
      "- 状态读写（pmw task / pmw review / pmw block）不受影响，照常用：",
      `  \`node "${path.join(PACKAGE_ROOT, "tools", "pmw.mjs")}" task add "..." --dir "${projectDir || "<项目目录>"}" --json --no-color\``,
      "- 不要用 PowerShell 提权，不要反复重试同一路径。"
    );
  } else if (writable === true) {
    overlay.push("", "## 落盘", `项目目录可写，直接写 ${projectDir} 下的文件即可。`);
  }

  if (upstream) {
    overlay.push("", "## 上游交接", upstream);
  }
  overlay.push(
    "",
    "## 干完返回（严格四行，不要多写）",
    "- 结果：一句话",
    "- 产出：文件绝对路径（没有就写「无」）",
    "- 要用户拍板：逐条列（没有就写「无」）",
    "- 下一步建议：该谁上（Rester / Writer / Maker / Tester / 用户自己）",
    "",
    "## 纪律",
    "- 状态一律用 pmw 命令读写，不要手改 project.json / req.json。",
    "- 拿不准的信息标 `[待确认]`，不要编。",
    "- 完成后不要替用户拍板任何业务规则。"
  );
  return overlay.join("\n");
}

/** 给用户看的角色清单（Markdown 表）。 */
export function rolesTable() {
  const lines = ["| 角色 | 干什么 |", "| --- | --- |"];
  for (const r of ROLES) lines.push(`| **${r.label}** | ${r.brief} |`);
  return lines.join("\n");
}
