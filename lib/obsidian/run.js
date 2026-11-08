/**
 * `obsidian` 工具的执行逻辑。与 tool.js 分开，方便单测。
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { clientFromEnv, obsidianConfig } from "./client.js";
import { KB_DIRS, EXP_DIRS, buildNote, safeName, today, summarizeText } from "./kb.js";
import { syncWorkspace, workspaceNoteName } from "./sync.js";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PMW = path.join(HERE, "..", "..", "tools", "pmw.mjs");

function kbReady() {
    const cfg = obsidianConfig();
    if (!cfg) {
        return { ok: false, error: "还没配 Obsidian 知识库：需要环境变量 OBSIDIAN_API_KEY（Obsidian → 设置 → Local REST API 的 Key）。" };
    }
    return { ok: true, cfg };
}

/** 找「当前工作区」：优先用传进来的 dir，其次问 pmw。 */
function resolveWorkspaceDir(dir) {
    if (dir) return dir;
    try {
        const txt = execFileSync(process.execPath, [PMW, "status", "--json"], {
            encoding: "utf8",
            env: process.env,
        });
        const j = JSON.parse(txt);
        return j?.result?.dir ?? null;
    } catch {
        return null;
    }
}

export async function runObsidianAction(args) {
    const action = args?.action;
    if (!action) return { ok: false, action: "?", error: "缺少 action" };

    const ready = kbReady();
    if (!ready.ok) return { ok: false, action, error: ready.error };
    const client = clientFromEnv();

    if (action === "status") {
        let vault = null, err = "";
        try { vault = await client.listVault(); } catch (e) { err = e.message; }
        if (err) return { ok: false, action, error: `连不上 Obsidian：${err}（Obsidian 开着吗？Local REST API 插件启用了吗？）` };
        // listVault 只给顶层条目，需求要单独问 10-需求 这一层
        let reqDirs = [];
        try { reqDirs = await client.listDir(KB_DIRS.requirements); } catch { }
        const seg = (f) => String(f).replace(/\/+$/, "").split("/").pop();
        const reqs = reqDirs.map(seg).filter(Boolean);
        // 顺手验证「需求总览」读得到，确认读权限没问题
        let hubOk = false;
        try { await client.read(`${KB_DIRS.index}/需求总览.md`); hubOk = true; } catch { }
        const lines = [
            `知识库已连接：${ready.cfg.protocol}://${ready.cfg.host}:${ready.cfg.port}`,
            `里面已有 ${reqs.length} 个需求${hubOk ? "，需求总览笔记正常" : ""}。`,
        ];
        if (reqs.length) {
            lines.push("", "已同步的需求：");
            for (const r of reqs.slice(-12)) lines.push(`  · ${r}`);
        } else {
            lines.push("", "还没有需求同步进来。在工作区里说「同步到知识库」或用 pmw note sync。");
        }
        return { ok: true, action, text: lines.join("\n"), notes: reqs };
    }

    if (action === "recall") {
        const q = args.query;
        if (!q) return { ok: false, action, error: "recall 需要 query" };
        const hits = await client.search(q, 200);
        const paths = hits.map((h) => h.filename).slice(0, 15);
        if (!paths.length) {
            return { ok: true, action, text: `知识库里没找到「${q}」。这可能是第一次遇到，处理完记得用 remember 记一条。`, hits: [] };
        }
        const lines = [`「${q}」在知识库里找到 ${paths.length} 篇：`];
        for (const h of hits.slice(0, 8)) {
            lines.push("");
            lines.push(`### ${h.filename}`);
            for (const m of (h.matches ?? []).slice(0, 3)) {
                lines.push(`  …${String(m.context ?? "").replace(/\s+/g, " ").trim().slice(0, 220)}…`);
            }
        }
        lines.push("", "要看全文用 action=read + path。");
        return { ok: true, action, text: lines.join("\n"), hits: paths };
    }

    if (action === "read") {
        const p = args.path;
        if (!p) return { ok: false, action, error: "read 需要 path" };
        const body = await client.read(p);
        return { ok: true, action, path: p, text: body };
    }

    if (action === "tree") {
        const p = args.path || KB_DIRS.requirements;
        const files = await client.listDir(p);
        return { ok: true, action, path: p, text: `${p}：\n` + files.map((f) => `  ${f}`).join("\n"), notes: files };
    }

    if (action === "remember") {
        const title = args.title;
        const content = args.content;
        if (!title || !content) return { ok: false, action, error: "remember 需要 title 和 content" };
        const cat = EXP_DIRS[args.category] ?? EXP_DIRS.pitfall;
        const name = safeName(title);
        const notePath = `${cat}/${name}.md`;

        // 同一标题已存在 → 追加一节，而不是覆盖（经验会随次数变厚）
        let existing = null;
        try { existing = await client.read(notePath); } catch { }
        if (existing) {
            const entry = [`## ${today()} 又遇到一次`, "", content.trim(), ""].join("\n");
            await client.append(notePath, "\n" + entry);
            return { ok: true, action, path: notePath, text: `已追加到已有经验「${name}」（${notePath}）` };
        }

        const note = buildNote({
            title: name,
            type: "经验",
            tags: ["经验", ...(args.tags ?? [])],
            requirement: args.requirement || undefined,
            links: args.requirement ? [args.requirement] : [],
            status: "active",
            summary: summarizeText(content, { maxChars: 120 }).summary,
            extra: { category: cat.split("/").pop(), source: args.source || undefined },
            body: content.trim(),
        });
        await client.write(notePath, note);
        return { ok: true, action, path: notePath, text: `已记下「${name}」→ ${notePath}` };
    }

    if (action === "sync") {
        const dir = resolveWorkspaceDir(args.dir);
        if (!dir) return { ok: false, action, error: "找不到当前工作区，用 dir 指定" };
        let status;
        try {
            const txt = execFileSync(process.execPath, [PMW, "status", "--dir", dir, "--json"], { encoding: "utf8", env: process.env });
            status = JSON.parse(txt);
        } catch (e) {
            return { ok: false, action, error: `这个工作区还没初始化（先 pmw init --here）：${String(e.message).slice(0, 120)}` };
        }
        const state = { ...status.result, dir };
        const res = await syncWorkspace(dir, state, { includeDocx: Boolean(args.includeDocx) });
        if (!res.ok) return { ok: false, action, error: res.error };
        const lines = [`已同步「${res.name}」，${res.notes.length} 篇：`];
        for (const n of res.notes) lines.push(`  · ${n.kind} → ${n.path}`);
        if (res.skipped?.length) {
            lines.push("", "跳过：");
            for (const s of res.skipped) lines.push(`  · ${s}`);
        }
        return { ok: true, action, text: lines.join("\n"), notes: res.notes.map((n) => n.path) };
    }

    return { ok: false, action, error: `不认识的 action：${action}` };
}
