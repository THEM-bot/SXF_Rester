/**
 * `pmw note`：把工作区里的东西发布到 Obsidian 知识库。
 *
 *   pmw note status                 看知识库连没连上、有哪些目录
 *   pmw note sync                   把当前工作区的材料与需求索引同步进知识库
 *   pmw note sync --docx            连 docx 一起搬（转成 md 后放 原材料/）
 *   pmw note index                  只重建需求索引笔记
 *
 * 为什么单独做个命令而不让 agent 用 obsidian 工具写：
 *   - 需要读工作区里的状态（阶段、子需求、评审台账），工具层看不到；
 *   - 同步是幂等的，可以反复跑；工具层是「写一篇」，语义不同。
 */
import fs from "node:fs";
import path from "node:path";
import { clientFromEnv } from "../obsidian/client.js";
import {
    KB_DIRS,
    safeName,
    buildNote,
    materialBody,
    requirementIndexBody,
    requirementFields,
    hubBody,
    boardBody,
    materialsQueryBlock,
    summarizeText,
    EXP_GUIDES,
} from "../obsidian/kb.js";

const SOURCE_DIR = "原材料";
const OUTPUT_DIR = "产物";

/** 收集工作区里要同步的东西。 */
export function collectWorkspace(dir, { includeDocx = false } = {}) {
    const items = [];
    const push = (file, kind, subdir) => {
        const abs = path.join(dir, file);
        if (!fs.existsSync(abs)) return;
        const rel = subdir ? `${subdir}/${file}` : file;
        items.push({ rel, abs, kind });
    };

    const srcDir = path.join(dir, SOURCE_DIR);
    if (fs.existsSync(srcDir)) {
        for (const f of fs.readdirSync(srcDir).sort()) {
            if (!includeDocx && /\.docx$/i.test(f)) continue;
            if (/\.md$/i.test(f)) items.push({ rel: `${SOURCE_DIR}/${f}`, abs: path.join(srcDir, f), kind: "digest" });
        }
    }

    // 工作区根上的 docx（还没 digest 的原始材料）→ 只在 --docx 时带上
    if (includeDocx) {
        for (const f of fs.readdirSync(dir).sort()) {
            if (!/\.docx$/i.test(f)) continue;
            items.push({ rel: f, abs: path.join(dir, f), kind: "docx" });
        }
    }

    for (const f of ["prd.md", "align.md", "discover.md"]) push(f, "workspace", "");
    push("master/master-prd.md", "workspace", "");

    // 工作区根上随手放的 .md（用户自己丢进来的笔记）——除了上面这些受管理的和账本
    const MANAGED = new Set(["prd.md", "align.md", "discover.md", "changelog.md"]);
    for (const f of fs.readdirSync(dir).sort()) {
        if (!/\.md$/i.test(f) || MANAGED.has(f.toLowerCase())) continue;
        const abs = path.join(dir, f);
        if (!fs.statSync(abs).isFile()) continue;
        items.push({ rel: f, abs, kind: "note" });
    }

    const modsDir = path.join(dir, "modules");
    if (fs.existsSync(modsDir)) {
        for (const mod of fs.readdirSync(modsDir).sort()) {
            const modDir = path.join(modsDir, mod);
            if (!fs.statSync(modDir).isDirectory()) continue;
            for (const f of ["module-prd.md"]) {
                const abs = path.join(modDir, f);
                if (fs.existsSync(abs)) items.push({ rel: `modules/${mod}/${f}`, abs, kind: "module" });
            }
            const subsDir = path.join(modDir, "subs");
            if (fs.existsSync(subsDir)) {
                for (const sub of fs.readdirSync(subsDir).sort()) {
                    const abs = path.join(subsDir, sub, "prd.md");
                    if (fs.existsSync(abs)) items.push({ rel: `modules/${mod}/subs/${sub}/prd.md`, abs, kind: "sub" });
                }
            }
        }
    }

    const outDir = path.join(dir, OUTPUT_DIR);
    if (fs.existsSync(outDir)) {
        for (const f of fs.readdirSync(outDir).sort()) {
            if (/\.docx$/i.test(f)) items.push({ rel: `${OUTPUT_DIR}/${f}`, abs: path.join(outDir, f), kind: "word" });
        }
    }

    return items;
}

/** 一个工作区对应知识库里的一个文件夹名。 */
export function workspaceNoteName(state, dir) {
    const base = state?.title || path.basename(dir);
    const id = state?.id ? `${state.id} ` : "";
    return safeName(`${id}${base}`.trim());
}

async function existsNote(client, p) {
    try { await client.read(p); return true; } catch { return false; }
}

/** 确保知识库的基础骨架存在（索引页 + 经验目录说明）。 */
export async function ensureSkeleton(client) {
    const made = [];
    const put = async (p, note) => {
        const exists = await client.read(p).catch(() => null);
        if (exists !== null) return;
        await client.write(p, note);
        made.push(p);
    };

    await put(`${KB_DIRS.index}/需求总览.md`, buildNote({
        title: "需求总览",
        type: "索引",
        tags: ["索引"],
        status: "active",
        summary: "所有正在跟进的需求，按阶段排序",
        body: hubBody(),
    }));

    await put(`${KB_DIRS.index}/工作台.md`, buildNote({
        title: "工作台",
        type: "索引",
        tags: ["索引"],
        status: "active",
        summary: "等谁、卡点、停滞、经验 —— 一眼看全局",
        body: boardBody(),
    }));

    // 每个经验目录放一篇说明：既告诉人放什么，也让空目录不至于消失
    for (const g of EXP_GUIDES) {
        await put(`${g.dir}/${g.title}.md`, buildNote({
            title: g.title,
            type: "说明",
            tags: ["说明", "经验"],
            status: "active",
            summary: g.summary,
            extra: { category: g.dir.split("/").pop() },
            body: g.body,
        }));
    }

    return made;
}

/**
 * 同步一个工作区到知识库。
 * @returns {Promise<{ok:boolean, error?:string, notes:object[], skipped:string[]}>}
 */
export async function syncWorkspace(dir, state, { includeDocx = false, overwrite = true, limit = 60 } = {}) {
    const client = clientFromEnv();
    if (!client) {
        return { ok: false, error: "没有配置 Obsidian（OBSIDIAN_API_KEY）", notes: [], skipped: [] };
    }

    const name = workspaceNoteName(state, dir);
    const reqDir = `${KB_DIRS.requirements}/${name}`;
    const matDir = `${reqDir}/${SOURCE_DIR === "原材料" ? "原材料" : SOURCE_DIR}`;
    const notes = [];
    const skipped = [];

    // 1. 需求索引笔记
    const indexPath = `${reqDir}/${name}.md`;
    const stageNo = Number(String(state?.progress ?? "").split("/")[0]) || 0;    const indexBody = requirementIndexBody({
        id: state?.id,
        title: state?.title,
        kind: state?.kind,
        stage: state?.stage,
        stageName: state?.stageName,
        progress: state?.progress,
        next: state?.next,
        blockers: (state?.blockers ?? []).map((b) => b.text ?? b.reason ?? String(b)),
        subs: state?.subs ?? [],
        dir,
    }) + materialsQueryBlock(name);
    const indexNote = buildNote({
        title: name,
        type: "需求",
        tags: ["需求", state?.kind === "project" ? "需求/大需求" : "需求/小需求"],
        requirement: name,
        links: (state?.subs ?? []).slice(0, 20).map((s) => s.title).filter(Boolean),
        status: state?.stage === "DONE" ? "archived" : "active",
        summary: `${state?.kind === "project" ? "大需求" : "小需求"} · ${state?.stageName ?? "-"} · ${state?.progress ?? "-"}`,
        extra: requirementFields({ ...state, dir, stageNo }),
        body: indexBody,
    });
    await client.write(indexPath, indexNote);
    notes.push({ path: indexPath, kind: "index", chars: indexNote.length });

    // 2. 材料镜像
    const items = collectWorkspace(dir, { includeDocx });
    for (const it of items.slice(0, limit)) {
        if (it.kind === "docx" || it.kind === "word") {
            skipped.push(`${it.rel}（Word 不进知识库正文，用 pmw doc 出 md 再同步）`);
            continue;
        }
        const raw = fs.readFileSync(it.abs, "utf8");
        const base = it.rel
            .replace(/^原材料\//, "")
            .replace(/^modules\//, "模块-")
            .replace(/^master\//, "总-")
            .replace(/\.md$/i, "")
            .replace(/\//g, "-");
        const notePath = `${matDir}/${safeName(base)}.md`;
        const { summary, points } = summarizeText(raw);
        // 正文里挂原文（用 Obsidian 的代码块，避免被当成 note 解析）
        const body = [
            materialBody({ summary, points, rawPath: it.abs, rawChars: raw.length }),
            "<details>",
            "<summary>原文（点开）</summary>",
            "",
            raw.slice(0, 20000),
            raw.length > 20000 ? "\n\n…（原文更长，完整版见工作区）" : "",
            "",
            "</details>",
        ].join("\n");
        const note = buildNote({
            title: base,
            type: "材料",
            tags: ["材料", `材料/${it.kind}`],
            requirement: name,
            links: [name],
            source: path.basename(it.rel),
            status: "active",
            summary,
            body,
        });
        await client.write(notePath, note);
        notes.push({ path: notePath, kind: it.kind, chars: note.length });
    }

    // 3. 两个索引页：需求总览 + 工作台。
    //    内容是 Dataview 查询，不需要逐行维护 —— 少了一整类「行重复/行残留」的 bug。
    const hubPath = `${KB_DIRS.index}/需求总览.md`;
    const hubTxt = await client.read(hubPath).catch(() => null);
    if (hubTxt === null || !hubTxt.includes("```dataview")) {
        const hub = buildNote({
            title: "需求总览",
            type: "索引",
            tags: ["索引"],
            status: "active",
            summary: "所有正在跟进的需求，按阶段排序",
            body: hubBody(),
        });
        await client.write(hubPath, hub);
        notes.push({ path: hubPath, kind: "hub", chars: hub.length, rewritten: hubTxt !== null });
    }

    const boardPath = `${KB_DIRS.index}/工作台.md`;
    const boardTxt = await client.read(boardPath).catch(() => null);
    if (boardTxt === null) {
        const board = buildNote({
            title: "工作台",
            type: "索引",
            tags: ["索引"],
            status: "active",
            summary: "等谁、卡点、停滞、经验 —— 一眼看全局",
            body: boardBody(),
        });
        await client.write(boardPath, board);
        notes.push({ path: boardPath, kind: "board", chars: board.length });
    }

    return { ok: true, name, notes, skipped };
}

/**
 * 把一个需求从知识库里摘掉（删目录 + 删总览那一行）。
 * 自检与「归档/作废」都走这里，避免总览里留死链。
 */
export async function forgetWorkspace(name) {
    const client = clientFromEnv();
    if (!client) return { ok: false, error: "没有配置 Obsidian" };
    const reqDir = `${KB_DIRS.requirements}/${safeName(name)}`;
    try { await client.remove(reqDir); } catch { }

    const hubPath = `${KB_DIRS.index}/需求总览.md`;
    let removed = false;
    try {
        const txt = await client.read(hubPath);
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const next = txt.replace(new RegExp(`^\\|\\s*\\[\\[${esc}\\]\\][^\\n]*\\n?`, "gm"), "");
        if (next !== txt) {
            await client.write(hubPath, next);
            removed = true;
        }
    } catch { }
    return { ok: true, removedRow: removed, dir: reqDir };
}
