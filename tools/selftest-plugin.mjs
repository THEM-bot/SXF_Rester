/**
 * 本地冒烟测试：用假的 ctx 跑一遍 apply()，确认三样东西都注册上了，
 * 并且 pm_flow 工具的 execute 真的能调通 pmw.mjs。
 *
 * 用法：node tools/selftest-plugin.mjs
 *
 * 注意：这台机器的沙箱不允许「管道捕获另一个进程的输出」（spawn EPERM），
 * 所以假 subprocess 把 stdout/stderr 重定向到临时文件再读回来，
 * 正好也覆盖了 SubprocessHandle.collected.readFrom 的语义。
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apply, name, inject } from "../lib/index.js";
import { docxToMarkdown } from "./lib/docx.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const TMP_ROOT = path.join(PKG, ".selftest");

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, extra) => {
  failures += 1;
  console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
};

/* ---- 假 subprocess：文件式 stdio ---- */
const tmpFiles = [];
function makeFakeSubprocess() {
  return {
    async resolveExecutable(cmd) {
      return cmd === "node" ? process.execPath : cmd;
    },
    spawn(spec) {
      const n = tmpFiles.length;
      const outPath = path.join(TMP_ROOT, `.pipe-${n}.out`);
      const errPath = path.join(TMP_ROOT, `.pipe-${n}.err`);
      tmpFiles.push(outPath, errPath);
      const outFd = fs.openSync(outPath, "w");
      const errFd = fs.openSync(errPath, "w");

      const handle = spawn(spec.argv[0], spec.argv.slice(1), {
        cwd: spec.cwd,
        env: spec.env ?? process.env,
        stdio: ["ignore", outFd, errFd],
      });

      const done = new Promise((resolve) => {
        handle.on("close", (code) => {
          try {
            fs.closeSync(outFd);
            fs.closeSync(errFd);
          } catch {}
          resolve({ exitCode: code, signal: null });
        });
        handle.on("error", () => {
          try {
            fs.closeSync(outFd);
            fs.closeSync(errFd);
          } catch {}
          resolve({ exitCode: 1, signal: null });
        });
      });

      const read = (p) => {
        const silent = () => ({ text: "", nextOffset: 0, lossy: false });
        return {
          readFrom(fromByte = 0) {
            try {
              const buf = fs.readFileSync(p);
              return { text: buf.subarray(fromByte).toString("utf8"), nextOffset: buf.length, lossy: false };
            } catch {
              return silent();
            }
          },
        };
      };

      return {
        done,
        terminate() {
          try {
            handle.kill();
          } catch {}
        },
        collected: { stdout: read(outPath), stderr: read(errPath) },
      };
    },
  };
}

/* ---- 收集注册项 ---- */
const registered = { tools: [], skills: [], commands: [] };

function makeCtx() {
  const services = { subprocess: makeFakeSubprocess() };
  const ctx = {
    logger: { warn: (m) => console.log(`  [warn] ${m}`) },
    get(key) {
      return services[key];
    },
    inject(keys, fn) {
      fn(ctx);
    },
    effect(fn) {
      return fn();
    },
  };
  const tools = {
    register(def) {
      registered.tools.push(def);
      return () => {};
    },
  };
  const skills = {
    register(skill) {
      registered.skills.push(skill);
      return () => {};
    },
  };
  const commands = {
    register(def) {
      registered.commands.push(def);
      return () => {};
    },
  };
  Object.defineProperty(ctx, "tools", { get: () => tools });
  Object.defineProperty(ctx, "skills", { get: () => skills });
  Object.defineProperty(ctx, "commands", { get: () => commands });
  return ctx;
}

console.log("pm-flow 插件自测\n");
console.log(`  name   = ${name}`);
console.log(`  inject = ${JSON.stringify(inject)}\n`);

fs.rmSync(TMP_ROOT, { recursive: true, force: true });
fs.mkdirSync(TMP_ROOT, { recursive: true });

const ctx = makeCtx();
apply(ctx, { root: TMP_ROOT });

console.log("注册结果：");
registered.tools.length ? ok(`工具 pm_flow（${registered.tools.length} 个）`) : bad("没注册工具");
registered.skills.length
  ? ok(`技能 pm-flow（正文 ${registered.skills[0]?.content?.length ?? 0} 字，frontmatter 已剥）`)
  : bad("没注册技能");
if (registered.skills[0]) {
  registered.skills[0].content.startsWith("---")
    ? bad("SKILL.md frontmatter 没被剥掉")
    : ok("SKILL.md frontmatter 已剥");
  registered.skills[0].resourceBase?.path === PKG ? ok("resourceBase 指向包根") : bad("resourceBase 不对");
}
registered.commands.length ? ok(`命令 /pmw`) : bad("没注册命令");

const shTool = registered.tools.find((t) => t.name === "sh");
shTool ? ok("工具 sh（bash 执行）已注册") : bad("没注册 sh 工具");
if (shTool) {
  const r = await shTool.execute({ cmd: 'echo sh-ok; exit 0' });
  r?.ok && String(r.stdout).includes("sh-ok")
    ? ok(`sh 跑通（exit ${r.exitCode}，${Math.round(r.durationMs)}ms）`)
    : bad("sh 执行失败", JSON.stringify(r).slice(0, 300));

  const cn = await shTool.execute({ cmd: 'echo "中文 ✓"' });
  String(cn?.stdout || "").includes("中文 ✓") ? ok("sh 中文不乱码") : bad("sh 中文乱码", JSON.stringify(cn).slice(0, 200));

  const dr = await shTool.execute({ cmd: "rm -rf /" });
  dr?.needsConfirm && !dr.ok ? ok("sh 拦下危险命令") : bad("危险命令没被拦", JSON.stringify(dr).slice(0, 200));

  const diag = await shTool.execute({ cmd: "notacmd_zzz_404" });
  diag?.exitCode === 127 && String(diag.diagnosis || "").includes("找不到命令")
    ? ok("sh 失败给出诊断")
    : bad("sh 没诊断", JSON.stringify(diag).slice(0, 200));

  const jobs = await shTool.execute({ action: "jobs" });
  Array.isArray(jobs?.jobs) ? ok(`sh 后台任务列表（${jobs.jobs.length} 个）`) : bad("sh jobs 失败");
}

/* ---- 真跑工具 ---- */
console.log("\n工具执行：");
const tool = registered.tools[0];

const initRes = await tool.execute({
  command: "init",
  args: ["--kind", "project", "--id", "SELFTEST", "--title", "自测项目"],
});
initRes?.ok ? ok(`init → ${initRes.result?.id ?? "?"}`) : bad("init 失败", JSON.stringify(initRes).slice(0, 400));

const statusRes = await tool.execute({ command: "status", args: [] });
statusRes?.ok && statusRes.mermaid
  ? ok(`status 有 mermaid（${statusRes.mermaid.length} 字符）`)
  : bad("status 没有 mermaid", JSON.stringify(statusRes).slice(0, 400));

if (tool.output?.render && statusRes?.ok) {
  const text = tool.output.render({ command: "status" }, statusRes)?.[0]?.text ?? "";
  text.includes("```mermaid") ? ok(`render 输出了 Mermaid 代码块（${text.length} 字符）`) : bad("render 没输出 Mermaid");
}

const todayRes = await tool.execute({ command: "today", args: [] });
todayRes?.ok ? ok(`today → ${todayRes.result?.stageName ?? "?"}`) : bad("today 失败", JSON.stringify(todayRes).slice(0, 400));

const revRes = await tool.execute({ command: "review", args: ["add", "金额列能填负数吗", "--who", "张三"] });
revRes?.ok && revRes.result?.id ? ok(`review add → #${revRes.result.id}`) : bad("review add 失败", JSON.stringify(revRes).slice(0, 400));

const revList = await tool.execute({ command: "review", args: ["list"] });
revList?.ok && revList.result?.open === 1
  ? ok(`review list → ${revList.result.open} 条未闭环`)
  : bad("review list 不对", JSON.stringify(revList).slice(0, 400));

const chkRes = await tool.execute({ command: "check", args: [] });
chkRes?.result
  ? ok(`check → ${chkRes.result.problems?.length ?? 0} 问题 / ${chkRes.result.warns?.length ?? 0} 提醒`)
  : bad("check 失败", JSON.stringify(chkRes).slice(0, 400));

const guideRes = await tool.execute({ command: "guide", args: [] });
guideRes?.ok && guideRes.result?.body
  ? ok(`guide → ${String(guideRes.result.title ?? "").slice(0, 24)}…`)
  : bad("guide 失败", JSON.stringify(guideRes).slice(0, 400));

const guideNoKb = await tool.execute({ command: "guide", args: ["--no-kb"] });
guideNoKb?.ok && !guideNoKb.result?.kb
  ? ok("guide --no-kb 跳过知识库检索")
  : bad("guide --no-kb 仍然去查了知识库", JSON.stringify(guideNoKb).slice(0, 240));

const digRes = await tool.execute({ command: "digest", args: [] });
digRes?.ok && Array.isArray(digRes.result?.scanned)
  ? ok(`digest 无参数时递归扫工作区（scanned ${digRes.result.scanned.length}）`)
  : bad("digest 无参数扫描失败", JSON.stringify(digRes).slice(0, 400));

const boardRes = await tool.execute({ command: "board", args: [] });
boardRes?.ok && Array.isArray(boardRes.result?.active)
  ? ok(`board → ${boardRes.result.active.length} 个在跟进`)
  : bad("board 失败", JSON.stringify(boardRes).slice(0, 400));

/* ---- brief：巡检（要能算出「谁手上压了几天」） ---- */
console.log("\n巡检：");
const briefRes = await tool.execute({ command: "brief", args: ["--all", "--wait-days", "0", "--block-days", "0", "--stale-days", "0"] });
briefRes?.ok && briefRes.result?.counts && Array.isArray(briefRes.result.waiting)
  ? ok(`brief → ${briefRes.result.counts.projects} 个需求 / 在等 ${briefRes.result.counts.waiting} / 超期 ${briefRes.result.counts.overdue}`)
  : bad("brief 失败", JSON.stringify(briefRes).slice(0, 400));

const briefOverdue = await tool.execute({ command: "brief", args: ["--all", "--wait-days", "999", "--block-days", "999", "--stale-days", "999"] });
briefOverdue?.ok && briefOverdue.result?.counts?.overdue === 0
  ? ok("brief 阈值调大后不会误报超期")
  : bad("brief 阈值不生效", JSON.stringify(briefOverdue.result?.counts ?? {}).slice(0, 300));

/* ---- lint：一致性体检（字段叫法 / 验收覆盖 / demo 覆盖） ---- */
console.log("\n一致性体检：");
const lintRes = await tool.execute({ command: "lint", args: [] });
lintRes && Array.isArray(lintRes.result?.problems)
  ? ok(`lint → ${lintRes.result.problems.length} 问题 / ${lintRes.result.warns.length} 提醒（${lintRes.result.docs.length} 份文档）`)
  : bad("lint 失败", JSON.stringify(lintRes).slice(0, 400));

/* ---- yxt：研效通（只跑只读命令，绝不往生产库写） ---- */
console.log("\n研效通：");
const yxtDoctor = await tool.execute({ command: "yxt", args: ["doctor"] });
if (yxtDoctor?.result?.root) {
  ok("yxt doctor → 找到研效通包（" + yxtDoctor.result.source + "）");
  yxtDoctor.result.hasToken ? ok("yxt token 存在") : bad("yxt token 缺失", "需要在 ~/.yanxiaotong/tokens/prod 放令牌");
  Array.isArray(yxtDoctor.result.missing) && !yxtDoctor.result.missing.length
    ? ok("yxt 六个子包 CLI 齐全")
    : bad("yxt 子包缺失", JSON.stringify(yxtDoctor.result.missing ?? []));

  // 建任务的 body 组得对不对（dry：只打印不提交）
  const dry = await tool.execute({
    command: "yxt",
    args: ["task", "new", "--req", "REQ-20261107-0014", "--title", "自测用任务标题", "--dry"],
  });
  const b = dry?.result?.body;
  b && b.taskPhase && b.taskCategory && b.requirementId && b.plannedStartDate && b.plannedEndDate
    ? ok("yxt task new --dry → 六个必填齐（" + b.taskPhase + "/" + b.taskCategory + "/" + b.plannedStartDate + "）")
    : bad("yxt task new --dry body 不全", JSON.stringify(b ?? dry).slice(0, 400));

  // 元数据点选（真调接口，只读）
  const metaRes = await tool.execute({ command: "yxt", args: ["meta", "task", "m10", "--pick", "phase"] });
  metaRes?.result?.text && /设计阶段|开发阶段/.test(metaRes.result.text)
    ? ok("yxt meta task m10 → 拿到阶段枚举（token 有效）")
    : bad("yxt meta 失败", JSON.stringify(metaRes?.result ?? {}).slice(0, 300));
} else {
  bad("yxt doctor 没返回包路径", JSON.stringify(yxtDoctor?.result ?? yxtDoctor).slice(0, 300));
}

const taskRes = await tool.execute({ command: "task", args: ["add", "跟业务确认导入模板金额列能否为空", "--who", "业务"] });
taskRes?.ok && taskRes.result?.task?.id
  ? ok(`task add → ${taskRes.result.task.id}`)
  : bad("task add 失败", JSON.stringify(taskRes).slice(0, 400));

const taskList = await tool.execute({ command: "task", args: ["list"] });
taskList?.ok && Array.isArray(taskList.result?.tasks)
  ? ok(`task list → ${taskList.result.tasks.length} 条`)
  : bad("task list 失败", JSON.stringify(taskList).slice(0, 400));

let threw = false;
try {
  await tool.execute({ command: "nonsense", args: [] });
} catch {
  threw = true;
}
threw ? ok("未知命令正确抛错") : bad("未知命令没抛错");

/* ---- Word 引擎：Markdown → .docx 全链路 ---- */
console.log("\nWord 输出：");
const mdPath = path.join(TMP_ROOT, "SELFTEST", "prd.md");
const docxOut = path.join(TMP_ROOT, "SELFTEST", "dist", "prd.docx");
fs.mkdirSync(path.dirname(mdPath), { recursive: true });
fs.writeFileSync(mdPath, [
  "# 自测 PRD",
  "",
  "## 1. 交付范围",
  "",
  "本期**仅国内订单**。",
  "",
  "| 字段 | 来源 | 规则 |",
  "| --- | --- | --- |",
  "| 变更型号 | 盘古供 | 必填 |",
  "| ^^ | OMS | 匹配不到拦截 |",
].join("\n"), "utf8");
const docRes = await tool.execute({ command: "doc", args: [mdPath, "--out", docxOut] });
docRes?.ok && fs.existsSync(docxOut)
  ? ok(`doc → Word（${(fs.statSync(docxOut).size / 1024).toFixed(1)} KB）`)
  : bad("doc 生成 Word 失败", JSON.stringify(docRes).slice(0, 400));

// 回读校验：合并单元格（^^）应变成空格子，标题层级不应偏移
if (docRes?.ok && fs.existsSync(docxOut)) {
  const back = docxToMarkdown(docxOut);
  const headingOk = back.includes("# 自测 PRD") && back.includes("## 1. 交付范围");
  const mergeOk = /\| 变更型号 \| 盘古供 \| 必填 \|/.test(back) && /\|  \| OMS \| 匹配不到拦截 \|/.test(back);
  headingOk ? ok("Word 回读标题层级不偏移（# → #）") : bad("标题层级偏移", back.slice(0, 200));
  mergeOk ? ok("Word 合并单元格正确（^^ → 空格子）") : bad("合并单元格回读不对", back.slice(0, 400));
}

/* ---- Word 插图：尺寸保比例、图注编号、缺图报错 ---- */
console.log("\nWord 插图：");
{
  const zlib = await import("node:zlib");
  // 造一张 1200x800 的真 PNG，用来验证「撑满版心但不变形」
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (b) => {
    let c = 0xFFFFFFFF;
    for (const byte of b) c = table[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const makePng = (w, h) => {
    const raw = Buffer.alloc((w * 3 + 1) * h, 0x40);
    for (let y = 0; y < h; y += 1) raw[y * (w * 3 + 1)] = 0;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ]);
  };

  const imgDir = path.join(TMP_ROOT, "SELFTEST", "imgtest");
  fs.mkdirSync(imgDir, { recursive: true });

  const shots = path.join(imgDir, "shots");
  fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, "wide.png"), makePng(1200, 800));
  fs.writeFileSync(path.join(shots, "small.png"), makePng(300, 200));

  const md2 = path.join(imgDir, "img.md");
  fs.writeFileSync(md2, [
    "# 插图自测",
    "",
    "## 1. 默认撑满",
    "",
    "![导入页](shots/wide.png)",
    "",
    "## 2. 指定宽度",
    "",
    "![窄图](shots/wide.png){300}",
    "",
    "## 3. 小图不放大",
    "",
    "![小图](shots/small.png)",
    "",
    "## 4. 没有图注",
    "",
    "![](shots/small.png)",
    "",
    "## 5. 找不到的图",
    "",
    "![漏了](shots/none.png)",
  ].join("\n"), "utf8");

  const out2 = path.join(imgDir, "dist", "img.docx");
  const r2 = await tool.execute({ command: "doc", args: [md2, "--out", out2] });
  if (!r2?.ok || !fs.existsSync(out2)) {
    bad("插图 Word 生成失败", JSON.stringify(r2).slice(0, 400));
  } else {
    // 直接解 zip 读 document.xml，看每张图的显示尺寸
    const { execFileSync } = await import("node:child_process");
    const py = path.join(TMP_ROOT, "SELFTEST", "probe.py");
    fs.writeFileSync(py, [
      "import zipfile,re,sys",
      "z=zipfile.ZipFile(sys.argv[1])",
      "d=z.read('word/document.xml').decode('utf-8')",
      "print('MEDIA',len([n for n in z.namelist() if n.startswith('word/media/')]))",
      "print('SIZES',' '.join(f'{round(int(a)/9525)}x{round(int(b)/9525)}' for a,b in re.findall(r'<wp:extent cx=\"(\\d+)\" cy=\"(\\d+)\"',d)))",
      "print('CAPS','|'.join(re.findall(r'图 \\d+ [^<]{1,20}',d)))",
      "print('MISS',len(re.findall(r'\\[图片缺失\\]',d)))",
    ].join("\n"), "utf8");
    let outTxt = "";
    try {
      outTxt = execFileSync("python", [py, out2], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    } catch (e) {
      outTxt = String(e?.stdout || "");
    }
    const media = Number((outTxt.match(/MEDIA (\d+)/) || [])[1] || 0);
    const sizes = ((outTxt.match(/SIZES ([^\n]*)/) || [])[1] || "").trim().split(" ").filter(Boolean);
    const caps = ((outTxt.match(/CAPS ([^\n]*)/) || [])[1] || "").split("|").filter(Boolean);
    const miss = Number((outTxt.match(/MISS (\d+)/) || [])[1] || 0);

    media === 2
      ? ok(`插图：2 张图内嵌（去重后共享 media）`)
      : bad("插图数量不对", `media=${media} raw=${outTxt.slice(0, 200)}`);
    const [w1] = sizes;
    w1 === "600x400"
      ? ok("插图：1200×800 撑满版心 600×400（不变形）")
      : bad("默认尺寸不对", `实际 ${sizes.join(" ")}`);
    sizes.includes("300x200")
      ? ok("插图：小图/指定宽度都按比例")
      : bad("指定宽度不对", sizes.join(" "));
    caps.length === 3 && caps[0].startsWith("图 1 ") && caps[2].startsWith("图 3 ")
      ? ok("插图：图注自动编号（无说明的图不占号）")
      : bad("图注编号不对", caps.join(" | "));
    miss === 1
      ? ok("插图：找不到的图留下红色占位")
      : bad("缺图提示不对", `miss=${miss}`);
  }

  // check 应该能提前抓到缺图，不用等出 Word
  const projPrd = path.join(TMP_ROOT, "SELFTEST", "prd.md");
  fs.writeFileSync(projPrd, [
    "# 自测 PRD",
    "",
    "## 1. 交付范围",
    "",
    "验收：REQ-AC01 能看到图。",
    "",
    "![漏了](shots/不存在.png)",
    "",
    "| 实现方式 | 传统开发 |",
    "| 故事点 | 3 |",
  ].join("\n"), "utf8");
  const dbgDir = path.join(TMP_ROOT, "SELFTEST");
  const chk = await tool.execute({ command: "check", args: [], dir: dbgDir });
  if (process.env.PMF_DEBUG) console.log("CHK:", JSON.stringify(chk).slice(0, 600));
  const hasImgProblem = (chk?.result?.problems || []).some((p) => String(p).includes("图片找不到"));
  hasImgProblem
    ? ok("check：提前报出图片找不到")
    : bad("check 没报缺图", JSON.stringify(chk?.result?.problems || []).slice(0, 300));
}

/* ---- 表格与 PDF ---- */
console.log("\n表格与 PDF：");
{
  const dir = path.join(TMP_ROOT, "SELFTEST");

  // 写一个表，再读回来
  const spec = {
    sheets: [
      {
        name: "需求总览",
        title: "在跟的需求",
        columns: [
          { header: "编号", width: 20 },
          { header: "标题", width: 34 },
          { header: "阶段", width: 14 },
          { header: "任务数", width: 10 },
        ],
        rows: [
          ["REQ-1", "受控仓字段", "开发评审", 4],
          ["REQ-2", "配置切换", "PRD 起草", 2],
        ],
      },
    ],
  };
  const xlsxPath = path.join(TMP_ROOT, "out.xlsx");
  const specPath = path.join(TMP_ROOT, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec), "utf8");
  const w = await tool.execute({ command: "xlsx", args: ["write", specPath, xlsxPath], dir });
  fs.existsSync(xlsxPath) && fs.statSync(xlsxPath).size > 1000
    ? ok(`xlsx write → ${(fs.statSync(xlsxPath).size / 1024).toFixed(1)} KB`)
    : bad("xlsx write 没出文件", JSON.stringify(w).slice(0, 200));

  const rd = await tool.execute({ command: "xlsx", args: ["read", xlsxPath], dir });
  String(rd?.result?.markdown || "").includes("受控仓字段") && String(rd?.result?.markdown || "").includes("开发评审")
    ? ok("xlsx read：中文与内容都读回来了")
    : bad("xlsx read 内容不对", String(rd?.result?.markdown || "").slice(0, 200));

  const sh = await tool.execute({ command: "xlsx", args: ["sheets", xlsxPath], dir });
  (sh?.result?.sheets || []).length === 1
    ? ok("xlsx sheets → 列出 1 个 sheet")
    : bad("xlsx sheets 不对", JSON.stringify(sh).slice(0, 200));

  // 出 PDF
  const mdPath = path.join(TMP_ROOT, "t.md");
  fs.writeFileSync(mdPath, "## 1. 背景\n\n测试 **加粗** 与表格：\n\n| 场景 | 规则 |\n| --- | --- |\n| A | B |\n", "utf8");
  const pdfPath = path.join(TMP_ROOT, "t.pdf");
  const pm = await tool.execute({ command: "pdf", args: ["make", mdPath, "--out", pdfPath], dir });
  const pdfOk = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 5000;
  pdfOk ? ok(`pdf make → ${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB`) : bad("pdf 没生成", JSON.stringify(pm).slice(0, 300));

  if (pdfOk) {
    const pr = await tool.execute({ command: "pdf", args: ["read", pdfPath], dir });
    String(pr?.result?.markdown || "").includes("背景")
      ? ok("pdf read：能读回中文")
      : bad("pdf read 内容不对", String(pr?.result?.markdown || "").slice(0, 200));
  }

  // 导出与导入
  const ex = await tool.execute({ command: "export", args: ["--to", "xlsx", "--out", path.join(TMP_ROOT, "exp.xlsx")], dir });
  fs.existsSync(path.join(TMP_ROOT, "exp.xlsx"))
    ? ok("export --to xlsx：需求/任务链/台账导成 Excel")
    : bad("export 没出文件", JSON.stringify(ex).slice(0, 300));

  // 系统清单（没配就跳过）
  const sysRes = await tool.execute({ command: "sys", args: ["list"] });
  const sysCount = (sysRes?.result?.systems || []).length;
  sysCount > 0 ? ok(`sys list → ${sysCount} 个系统清单`) : ok("sys list：本机没配系统清单（跳过）");
}

/* ---- 跑一遍命令 ---- */
console.log("\n命令执行：");
const cmd = registered.commands[0];
const cmdRes = await cmd.handler({ rawInput: "status", attachments: [], signal: new AbortController().signal });
cmdRes?.kind === "success" && cmdRes.text.includes("```mermaid")
  ? ok(`/pmw status → ${cmdRes.text.length} 字符`)
  : bad("/pmw status 失败", JSON.stringify(cmdRes).slice(0, 400));

/* ---- 角色 ----
   期望注册 1 个主技能 + 1 个业务域档案技能 + 6 个角色技能 = 8 */
console.log("\n角色：");
const roleSkills = registered.skills.filter((s) => s.name !== "pm-flow");
const domainSkills = roleSkills.filter((s) => s.name === "pm-domain");
const personSkills = roleSkills.filter((s) => s.name !== "pm-domain");
const hasDomain = domainSkills.length === 1 && (domainSkills[0].content?.length ?? 0) > 5000;
hasDomain
  ? ok(`业务域档案技能已注册（pm-domain，${domainSkills[0].content.length} 字）`)
  : bad(`没注册业务域档案技能 pm-domain（现有：${roleSkills.map((s) => s.name).join(", ")}）`);

personSkills.length === 6
  ? ok(`6 个角色技能已注册（${personSkills.map((s) => s.name).join(", ")}）`)
  : bad(`角色技能数不对：${personSkills.length}`);
personSkills.every((s) => s.content && s.content.length > 500)
  ? ok("每份角色说明书都有实质内容")
  : bad("有角色说明书内容过短");

// 背景知识必须真的进了角色的说明书（在下面 pm_role context 里验证拼接结果）

const roleTool = registered.tools.find((t) => t.name === "pm_role");
if (!roleTool) {
  bad("没注册 pm_role 工具");
} else {
  const listRes = await roleTool.execute({ action: "list" });
  listRes?.roles?.length === 6 ? ok(`pm_role list → ${listRes.roles.length} 个角色`) : bad("pm_role list 不对");

  const docRes = await roleTool.execute({ action: "doc", role: "writer" });
  docRes?.ok && docRes.doc.length > 3000 ? ok(`pm_role doc writer → ${docRes.doc.length} 字`) : bad("pm_role doc 不对");

  const ctxRes = await roleTool.execute({ action: "context", role: "recorder", dir: path.join(TMP_ROOT, "SELFTEST") });
  ctxRes?.ok && ctxRes.doc.includes("当前项目状态")
    ? ok(`pm_role context → ${ctxRes.doc.length} 字（含项目状态）`)
    : bad("pm_role context 不对", JSON.stringify(ctxRes).slice(0, 300));

  // context = 共同底座 + 业务域档案 + 角色 → 三份都得在里面，且顺序不能反
  if (ctxRes?.ok) {
    const d = ctxRes.doc;
    const iBase = d.indexOf("共同底座");
    const iDomain = d.indexOf("# 业务域档案");
    const iRole = d.indexOf("# Recorder");
    iBase >= 0 && iDomain > iBase && iRole > iDomain
      ? ok("context 顺序正确：共同底座 → 业务域档案 → 角色")
      : bad("context 三份拼接顺序不对", `base@${iBase} domain@${iDomain} role@${iRole}`);
    d.includes("未备 ≠ 未发") && d.includes("报价单创建日期")
      ? ok("业务域档案的关键业务常识已进入 context")
      : bad("context 里没有业务域档案的实质内容");
  }

  const promptRes = await roleTool.execute({
    action: "prompt",
    role: "maker",
    dir: path.join(TMP_ROOT, "SELFTEST"),
    task: "做导入预算页的页面结构说明",
  });
  promptRes?.ok && promptRes.prompt.includes("做导入预算页")
    ? ok(`pm_role prompt → ${promptRes.prompt.length} 字`)
    : bad("pm_role prompt 不对", JSON.stringify(promptRes).slice(0, 300));
  promptRes?.prompt?.includes("严格四行") ? ok("prompt 带返回四行约束") : bad("prompt 缺返回约束");

  let noDir = false;
  try {
    const r = await roleTool.execute({ action: "prompt", role: "maker", task: "x" });
    noDir = r?.ok === false;
  } catch {}
  noDir ? ok("缺 dir 时正确报错") : bad("缺 dir 没报错");
}

/* ---- 清理 ---- */
fs.rmSync(TMP_ROOT, { recursive: true, force: true });

console.log(failures === 0 ? "\n全部通过 ✓" : `\n${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
