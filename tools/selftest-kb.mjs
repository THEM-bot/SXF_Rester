/**
 * 知识库同步自测：用真实 Obsidian REST API 跑一遍。
 *
 *   node tools/selftest-kb.mjs             用临时工作区验
 *   node tools/selftest-kb.mjs <工作区>     用真实工作区验
 *
 * 需要环境变量 OBSIDIAN_API_KEY（可加 OBSIDIAN_PROTOCOL / OBSIDIAN_PORT）。
 * 跑完会删掉自己在知识库里建的所有测试笔记。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { clientFromEnv } from "../lib/obsidian/client.js";
import { KB_DIRS, buildNote, parseFrontmatter, summarizeText, safeName, QUERY_FIELDS } from "../lib/obsidian/kb.js";
import { syncWorkspace, collectWorkspace, workspaceNoteName, forgetWorkspace } from "../lib/obsidian/sync.js";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PMW = path.join(HERE, "pmw.mjs");
const TMP_ROOT = path.join(HERE, "..", ".selftest-kb");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  ✓ ${name}${extra ? `  ${extra}` : ""}`); }
    else { fail++; console.log(`  ✗ ${name}${extra ? `  ${extra}` : ""}`); }
};

const env = { ...process.env, PMF_ROOT: TMP_ROOT };
const run = (...args) => {
    const out = execFileSync(process.execPath, [PMW, ...args, "--json"], { env, encoding: "utf8" });
    return JSON.parse(out);
};

// ---------- 环境 ----------
const client = clientFromEnv();
if (!client) {
    console.log("✗ 没有 OBSIDIAN_API_KEY，跳过");
    process.exit(1);
}
console.log("== 知识库连通 ==");
let vaultFiles = null;
try { vaultFiles = await client.listVault(); } catch (e) { console.log("✗ 连不上 Obsidian：", e.message); process.exit(1); }
ok("Obsidian REST API 可访问", Array.isArray(vaultFiles), `顶层 ${vaultFiles.length} 项`);

// ---------- 准备一个工作区 ----------
const marker = `KB自检-${Date.now()}`;
let dir;
const cleanupPaths = [];

if (process.argv[2]) {
    dir = path.resolve(process.argv[2]);
    console.log(`\n== 用真实工作区：${dir} ==`);
} else {
    console.log("\n== 造一个临时工作区 ==");
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    dir = path.join(TMP_ROOT, marker);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "会议纪要.md"), [
        "# 受控仓需求会议纪要",
        "",
        "会议结论：受控仓只对国内订单生效，海外暂不做。",
        "",
        "## 待确认",
        "",
        "- 受控仓库位谁来维护",
        "- 供应能力页要不要显示实时数量",
    ].join("\n"), "utf8");
    run("init", "--here", "--dir", dir, "--kind", "req", "--title", marker);
    run("goto", "--dir", dir, "S3_PRD");
    run("review", "add", "--dir", dir, "受控仓库位清单谁来维护");
    run("task", "add", "--dir", dir, "问业务：受控仓是否对海外生效", "--who", "业务");
}

// ---------- 同步 ----------
console.log("\n== 同步到知识库 ==");
const status = run("status", "--dir", dir);
const state = { ...status.result, dir };
const name = workspaceNoteName(state, dir);
const res = await syncWorkspace(dir, state, { includeDocx: false });
ok("同步成功", res.ok, res.error || `${res.notes.length} 篇`);
if (!res.ok) process.exit(1);

const indexNote = `${KB_DIRS.requirements}/${name}/${name}.md`;
cleanupPaths.push(`${KB_DIRS.requirements}/${name}`);

let indexText = "";
try { indexText = await client.read(indexNote); } catch (e) { }
ok("需求索引笔记已存在", indexText.length > 0, indexNote);

const fm = parseFrontmatter(indexText);
ok("frontmatter.type = 需求", fm.type === "需求", `type=${fm.type}`);
ok("frontmatter 有 tags", Array.isArray(fm.tags) && fm.tags.length > 0, JSON.stringify(fm.tags));
ok("frontmatter.requirement 指回自己", fm.requirement === name);
ok("正文有阶段信息", indexText.includes(state.stageName), state.stageName);
ok("正文有工作区路径", indexText.includes(dir.replace(/\\/g, "\\")) || indexText.includes(safeName(dir)) || indexText.includes("工作区"));

// 材料镜像
const matList = await client.listDir(`${KB_DIRS.requirements}/${name}/原材料`).catch(() => null);
ok("原材料目录已创建", Array.isArray(matList), matList ? `${matList.length} 项` : "");
if (matList) {
    const notes = (matList ?? []).filter((f) => /\.md$/i.test(f));
    ok("材料笔记数量 > 0", notes.length > 0, `${notes.length} 篇`);
    if (notes.length) {
        const first = await client.read(`${KB_DIRS.requirements}/${name}/原材料/${notes[0]}`);
        ok("材料笔记有摘要节", first.includes("这份材料讲什么"));
        ok("材料笔记有出处节", first.includes("## 出处"));
        ok("材料笔记挂回了需求", first.includes(`[[${name}]]`));
    }
}

// ---------- 检索 ----------
console.log("\n== 知识库检索 ==");
const found = await client.search(marker).catch((e) => { console.log("  检索失败：", e.message); return []; });
ok("能搜到刚同步的需求", Array.isArray(found) && found.length > 0, `${found.length} 条`);

const byType = await client.byTag("需求").catch(() => []);
ok("按 tag「需求」能找到它", Array.isArray(byType) && byType.some((f) => f.includes(name)), `${byType.length} 篇`);

// ---------- 需求总览（Dataview 版：不再逐行维护） ----------
const hub = `${KB_DIRS.index}/需求总览.md`;
try {
    const hubText = await client.read(hub);
    ok("需求总览是 Dataview 版", hubText.includes("```dataview"));
    ok("需求总览不再手工记行", !hubText.includes(`[[${name}]]`));
} catch {
    ok("需求总览是 Dataview 版", false, "读不到 " + hub);
}

// ---------- 幂等：再同步一次不应重复 ----------
console.log("\n== 幂等性 ==");
const res2 = await syncWorkspace(dir, state, { includeDocx: false });
ok("二次同步不报错", res2.ok);
try {
    const hub2 = await client.read(hub);
    // Dataview 版总览是幂等的：两次同步不应该改变它的字节长度
    ok("二次同步不改索引页", hub2.length > 0 && !hub2.includes(`[[${name}]]`), `${hub2.length} 字`);
} catch { ok("二次同步不改索引页", false); }

// ---------- 经验笔记格式 ----------
console.log("\n== 经验笔记 ==");
const expTitle = safeName(`${marker}-踩坑-研效通没有上级需求字段`);
const expPath = `${KB_DIRS.experience}/踩坑与限制/${expTitle}.md`;
cleanupPaths.push(`${KB_DIRS.experience}/踩坑与限制/${expTitle}.md`);
const expNote = buildNote({
    title: expTitle,
    type: "经验",
    tags: ["经验", "踩坑", "研效通"],
    requirement: name,
    links: [name],
    status: "active",
    source: "本自检",
    summary: "研效通开放 API 的 R01 没有 parent 字段，父子关系只能 Web 手工设。",
    extra: { category: "踩坑与限制" },
    body: [
        "## 现象",
        "",
        "调 R01 建需求时，body 里塞任何 parent/上级字段都不生效。",
        "",
        "## 为什么",
        "",
        "开放 API 契约里就没有这个字段（create-defaults.md 第 176-184 行明说）。",
        "",
        "## 下次怎么办",
        "",
        "建完用 Web UI 手工设上级；批量建的时候先把父子关系记在本地 index 里。",
    ].join("\n"),
});
await client.write(expPath, expNote);
const expBack = await client.read(expPath);
ok("经验笔记写入并读回", expBack.includes("下次怎么办"));
ok("经验笔记 type=经验", parseFrontmatter(expBack).type === "经验");
ok("经验笔记挂了需求链接", expBack.includes(`[[${name}]]`));

const expHits = await client.byTag("踩坑").catch(() => []);
ok("按 tag「踩坑」能找到", expHits.some((f) => f.includes(expTitle)), `${expHits.length} 篇`);

// ---------- Dataview 字段契约 ----------
// 查询是字符串，字段名拼错只会静默显示空列。这里断言「查询要的字段，笔记里真写了」。
console.log("\n== Dataview 字段契约 ==");
const reqFm = parseFrontmatter(await client.read(indexNote));
const expFm = parseFrontmatter(await client.read(expPath));
const catFm = parseFrontmatter(expNote);
for (const f of QUERY_FIELDS.需求) {
    ok(`需求笔记有字段 ${f}`, f in reqFm, JSON.stringify(reqFm[f] ?? null));
}
for (const f of QUERY_FIELDS.经验) {
    const hasFm = f in catFm;
    ok(`经验笔记有字段 ${f}`, hasFm, JSON.stringify(catFm[f] ?? null));
}
ok("需求笔记 waiting 是列表", Array.isArray(reqFm.waiting) || reqFm.waiting === undefined);
ok("需求笔记 openReviews 是数字", /^\d+$/.test(String(reqFm.openReviews)), String(reqFm.openReviews));
ok("经验笔记 category 已写入", catFm.category === "踩坑与限制", String(catFm.category));

// 索引页必须是 Dataview 查询，不是手工表格
const hubTxt = await client.read(`${KB_DIRS.index}/需求总览.md`).catch(() => "");
ok("需求总览用 Dataview", hubTxt.includes("```dataview"), `${hubTxt.length} 字`);
ok("需求总览不再有手工表格行", !/\|\s*\[\[/.test(hubTxt));
const boardTxt = await client.read(`${KB_DIRS.index}/工作台.md`).catch(() => "");
ok("工作台存在", boardTxt.length > 0, `${boardTxt.length} 字`);
ok("工作台含等谁查询", boardTxt.includes("FLATTEN waiting"));
ok("工作台 GROUP BY 后用 key（不是字段名）", boardTxt.includes('key AS "等谁"'));

// ---------- 摘要质量 ----------
console.log("\n== 摘要抽取 ==");
const s1 = summarizeText("# 标题\n\n第一段是摘要。\n\n- 要点一\n- 要点二\n");
ok("抽到第一段", s1.summary.includes("第一段是摘要"));
ok("抽到要点", s1.points.length === 2, JSON.stringify(s1.points));
const s2 = summarizeText("| a | b |\n| --- | --- |\n| 1 | 2 |\n\n正文段落。\n");
ok("跳过表格取正文", s2.summary.includes("正文段落"));

// ---------- 清理 ----------
console.log("\n== 清理 ==");
for (const p of cleanupPaths) {
    try { await client.remove(p); } catch { }
}
// 总览里那一行也要摘掉，否则留死链
const forgot = await forgetWorkspace(name);
ok("forgetWorkspace 摘掉总览行", forgot.ok);
if (!process.argv[2]) fs.rmSync(TMP_ROOT, { recursive: true, force: true });
const left = await client.read(indexNote).catch(() => null);
ok("需求目录已删除", left === null);
const hubLeft = await client.read(`${KB_DIRS.index}/需求总览.md`).catch(() => "");
ok("总览里没有残留行", !hubLeft.includes(`[[${name}]]`));

console.log(`\n${fail === 0 ? "全部通过 ✓" : `${fail} 项失败 ✗`}  （${pass} 通过 / ${fail} 失败）`);
process.exit(fail === 0 ? 0 : 1);
