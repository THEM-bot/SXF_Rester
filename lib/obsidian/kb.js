/**
 * 知识库的目录约定与笔记格式。
 *
 * 为什么要把格式集中在这里：Obsidian 的价值一半在「能被搜到、能互相链」。
 * 所以每篇笔记都必须有统一的 frontmatter（type/tags/requirement/status），
 * 目录也必须固定 —— 否则几个月后就是一堆散落的 md。
 */

export const KB_ROOT = "需求知识库";

export const KB_DIRS = {
    index: `${KB_ROOT}/00-索引`,
    requirements: `${KB_ROOT}/10-需求`,
    experience: `${KB_ROOT}/20-经验`,
    terms: `${KB_ROOT}/30-术语与系统`,
    decisions: `${KB_ROOT}/40-决策记录`,
    people: `${KB_ROOT}/50-人与团队`,
    inbox: `${KB_ROOT}/90-待归档`,
};

/** 经验的六个细分目录（对应用户选的四类 + 领域规则 + 待归类）。 */
export const EXP_DIRS = {
    pitfall: `${KB_DIRS.experience}/踩坑与限制`,
    rule: `${KB_DIRS.experience}/业务口径`,
    dev: `${KB_DIRS.experience}/领域规则`,
    howto: `${KB_DIRS.experience}/写法与流程`,
};

/**
 * 每个经验目录放一篇「这里是放什么的」说明。
 * 作用有两个：让半年后的自己知道该往哪写；也让目录本身不会因为空而被删掉。
 */
export const EXP_GUIDES = [
    {
        dir: EXP_DIRS.pitfall,
        title: "什么算踩坑与限制",
        summary: "工具、平台、流程的硬限制 —— 下次遇到同类事能少走一次弯路。",
        body: [
            "## 放什么",
            "",
            "- 平台/工具的硬限制：「研效通 R01 没有父需求字段」「Obsidian REST 的 PATCH 必须带版本头」",
            "- 环境坑：「沙箱禁止管道捕获子进程输出」「PowerShell 前置赋值不生效」",
            "- 流程坑：「批量建需求前不填生成模式会被整批拦下」",
            "",
            "## 不放什么",
            "",
            "- 一次性的事故复盘（放 40-决策记录）",
            "- 业务规则（放 业务口径）",
            "- 还没搞清楚原因的猜测",
            "",
            "## 写法",
            "",
            "标题就是结论，正文三段：现象 / 为什么 / 下次怎么办。",
            "",
        ].join("\n"),
    },
    {
        dir: EXP_DIRS.rule,
        title: "什么算业务口径",
        summary: "业务方拍板的规则与边界 —— 争论时能拿出依据。",
        body: [
            "## 放什么",
            "",
            "- 字段口径：「变更时间以报价单创建日期为准」",
            "- 范围边界：「本期只做国内订单」",
            "- 例外规则：「+30 天只在盘古供录入时带出，OMS 不计算」",
            "",
            "## 写法",
            "",
            "一条口径一篇，标题写口径本身。正文写：谁定的、什么时候定的、依据是什么、" +
            "有没有适用条件。**口径会变**，所以每次变更都追加一节，别改旧结论。",
            "",
        ].join("\n"),
    },
    {
        dir: EXP_DIRS.dev,
        title: "什么算领域规则",
        summary: "系统怎么运转的常识 —— 不用每次重新翻文档。",
        body: [
            "## 放什么",
            "",
            "- 系统之间的数据流向（OMS → ATP → ERP 各管什么）",
            "- 关键实体与状态机（需求、报价单、订单的状态流转）",
            "- 不得不记住的历史包袱（为什么某个字段名和含义对不上）",
            "",
            "## 写法",
            "",
            "先画一句关系，再列字段。别抄整份 PRD —— 抄了就会过期。",
            "",
        ].join("\n"),
    },
    {
        dir: EXP_DIRS.howto,
        title: "什么算写法与流程",
        summary: "PRD 怎么写、需求怎么推、评审怎么开 —— 手感的沉淀。",
        body: [
            "## 放什么",
            "",
            "- PRD 结构与篇幅的经验（什么需求写几页、哪节最容易写多）",
            "- 评审时开发最爱问的那几类问题，以及怎么提前答掉",
            "- 推需求池/企微文档的步骤与坑",
            "",
            "## 写法",
            "",
            "写成「下次照着做」的清单，不要写成感想。",
            "",
        ].join("\n"),
    },
];

/** 文件名安全化：去掉 Windows/Obsidian 不接受的字符。 */
export function safeName(s) {
    return String(s ?? "")
        .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
        .replace(/[#^[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "未命名";
}

export function today(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 组装一篇笔记。
 * @param {object} o
 * @param {string} o.title     笔记标题（也是文件名，不带 .md）
 * @param {string} o.type      笔记类型：需求 / 经验 / 术语 / 决策 / 人 / 材料
 * @param {string[]} o.tags    标签（不带 #）
 * @param {string} [o.requirement] 关联的需求工作区名
 * @param {string[]} [o.links] 需要建立双向链接的其它笔记标题
 * @param {string} [o.status]  active / archived / draft
 * @param {string} [o.source]  原始出处（文件路径、会议名等）
 * @param {string} [o.summary] 一句话摘要
 * @param {object} [o.extra]    额外 frontmatter（Dataview 要查询的机器可读字段）
 * @param {string} o.body      正文（Markdown）
 */
export function buildNote(o) {
    const fm = ["---"];
    fm.push(`title: ${yamlStr(o.title)}`);
    fm.push(`type: ${yamlStr(o.type)}`);
    fm.push(`status: ${yamlStr(o.status || "active")}`);
    if (o.requirement) fm.push(`requirement: ${yamlStr(o.requirement)}`);
    if (o.source) fm.push(`source: ${yamlStr(o.source)}`);
    fm.push("tags:");
    for (const t of o.tags ?? []) fm.push(`  - ${yamlStr(t)}`);
    if (o.summary) fm.push(`summary: ${yamlStr(o.summary)}`);
    if (o.extra) {
        for (const [k, v] of Object.entries(o.extra)) {
            if (v === undefined || v === null) continue;
            if (Array.isArray(v)) {
                if (!v.length) continue;
                fm.push(`${k}:`);
                for (const x of v) fm.push(`  - ${yamlScalar(x)}`);
            } else {
                fm.push(`${k}: ${yamlScalar(v)}`);
            }
        }
    }
    fm.push(`created: ${today()}`);
    fm.push(`updated: ${today()}`);
    fm.push("---");
    fm.push("");

    const parts = [`# ${o.title}`, ""];
    if (o.summary) parts.push(`> ${o.summary}`, "");
    parts.push(String(o.body ?? "").trim(), "");
    if (o.links?.length) {
        parts.push("## 相关", "");
        for (const l of o.links) parts.push(`- [[${l}]]`);
        parts.push("");
    }
    return fm.join("\n") + "\n" + parts.join("\n");
}

function yamlStr(v) {
    const s = String(v ?? "");
    if (s === "") return '""';
    // 需要引号的情况：含冒号、井号、引号、前后空格、或长得像数字/布尔
    if (/[:#"'\n]/.test(s) || /^\s|\s$/.test(s) || /^(true|false|null|\d+(\.\d+)?)$/i.test(s)) {
        return JSON.stringify(s);
    }
    return s;
}

/** 标量：数字与布尔不加引号（Dataview 要拿它们做数学比较），其余按字符串处理。 */
function yamlScalar(v) {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return String(v);
    return yamlStr(v);
}

/**
 * 需求笔记的机器可读字段。
 *
 * 为什么值得单独维护：Dataview 只能查 frontmatter 和 inline field，
 * 阶段、进度、在等谁这些如果只写在正文里，就永远只能靠人眼看。
 * 写进 frontmatter 之后，「谁在等谁」「哪些需求停滞了」就变成一条查询。
 */
export function requirementFields(s) {
    const waiting = (() => {
        const out = [];
        for (const r of s?.openReviews ?? []) {
            if (r?.status === "deferred" && r?.owner) out.push(String(r.owner).trim());
        }
        for (const t of s?.tasks?.current ?? []) {
            if (t?.who && t.who !== "我") out.push(String(t.who).trim());
        }
        return [...new Set(out.filter(Boolean))];
    })();

    const openReviews = (s?.openReviews ?? []).filter((r) => r?.status !== "closed").length;
    const blockers = (s?.blockers ?? []).length;
    // 从 progress（"4/9"）取序号即可，调用方已经算好 stageNo 就直接用，别再加一
    const stageNo = Number(s?.stageNo) || Number(String(s?.progress ?? "").split("/")[0]) || 0;

    return {
        kind: s?.kind === "project" ? "大需求" : "小需求",
        stage: s?.stage ?? "",
        stageName: s?.stageName ?? "",
        stageNo,
        progress: s?.progress ?? "",
        nextStage: s?.next ?? "",
        waiting,
        waitingCount: waiting.length,
        openReviews,
        blockers,
        workspace: s?.dir ?? "",
    };
}

/**
 * Dataview 查询里用到的字段白名单。
 *
 * 为什么要把它们写死成一个常量：查询是字符串，拼错一个字段名在 Obsidian 里
 * 只会显示空列，不会报错 —— 那种错可以躺几个月。有了这份清单，自检就能断言
 * 「查询引用的字段，笔记里真的写了」。
 */
export const QUERY_FIELDS = {
    需求: ["type", "status", "kind", "stageName", "stageNo", "progress", "nextStage", "waiting", "waitingCount", "openReviews", "blockers", "updated"],
    经验: ["type", "category", "summary", "updated"],
};

/** 「需求总览」用 Dataview 查询，不再手工维护表格行。 */
export function hubBody() {
    return [
        "工作区里每个需求同步一次，这张表就更新一次 —— 它是 Dataview 实时算出来的，不用手工改。",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "需求",',
        '  kind AS "类型",',
        '  stageName AS "阶段",',
        '  progress AS "进度",',
        '  nextStage AS "下一步",',
        '  updated AS "更新"',
        `FROM "${KB_DIRS.requirements}"`,
        'WHERE type = "需求" AND status != "archived"',
        "SORT stageNo ASC, updated DESC",
        "```",
        "",
        "## 已经完成或归档的",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "需求",',
        '  kind AS "类型",',
        '  stageName AS "阶段",',
        '  updated AS "归档于"',
        `FROM "${KB_DIRS.requirements}"`,
        'WHERE type = "需求" AND status = "archived"',
        "SORT updated DESC",
        "```",
        "",
        "> 详细视图（等谁、卡点、停滞）在 [[工作台]]。",
        "",
    ].join("\n");
}

/** 「工作台」：老板视角 / 自己视角各自要看的几件事。 */
export function boardBody() {
    return [
        "这一页全是 Dataview 查询，打开就是最新状态。数据来自每个需求笔记的 frontmatter。",
        "",
        "## 在等谁（挂在别人手上的事）",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  key AS "等谁",',
        '  length(rows) AS "几条",',
        '  map(rows.file.link, (l) => l) AS "需求"',
        `FROM "${KB_DIRS.requirements}"`,
        'WHERE type = "需求" AND length(waiting) > 0',
        "FLATTEN waiting",
        "GROUP BY waiting",
        "SORT length(rows) DESC",
        "```",
        "",
        "## 有卡点或未闭环评审的",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "需求",',
        '  stageName AS "阶段",',
        '  openReviews AS "未闭环问题",',
        '  blockers AS "卡点",',
        '  waiting AS "等谁"',
        `FROM "${KB_DIRS.requirements}"`,
        'WHERE type = "需求" AND (openReviews > 0 OR blockers > 0)',
        "SORT openReviews DESC, blockers DESC",
        "```",
        "",
        "## 停滞超过 7 天",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "需求",',
        '  stageName AS "阶段",',
        '  progress AS "进度",',
        '  updated AS "最后更新"',
        `FROM "${KB_DIRS.requirements}"`,
        'WHERE type = "需求" AND status != "archived" AND updated < date(today) - dur(7 days)',
        "SORT updated ASC",
        "```",
        "",
        "## 最近沉淀的经验",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "经验",',
        '  summary AS "一句话",',
        '  category AS "类别",',
        '  updated AS "更新"',
        `FROM "${KB_DIRS.experience}"`,
        'WHERE type = "经验"',
        "SORT updated DESC",
        "LIMIT 20",
        "```",
        "",
        "## 全部经验按类别",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  category AS "类别",',
        '  length(rows) AS "篇数"',
        `FROM "${KB_DIRS.experience}"`,
        'WHERE type = "经验"',
        "GROUP BY category",
        "SORT length(rows) DESC",
        "```",
        "",
    ].join("\n");
}

/** 需求笔记里「这次同步了哪些材料」——由 Dataview 按 requirement 字段反查。 */
export function materialsQueryBlock(name) {
    return [
        "## 知识库里的材料",
        "",
        "```dataview",
        "TABLE WITHOUT ID",
        '  file.link AS "材料",',
        '  summary AS "摘要"',
        `FROM "${KB_DIRS.requirements}/${name}"`,
        'WHERE type = "材料"',
        "SORT file.name ASC",
        "```",
        "",
    ].join("\n");
}

/** 从一篇笔记里读回 frontmatter（简易版，够我们自己用）。 */
export function parseFrontmatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) return {};
    const out = {};
    let key = null;
    for (const raw of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
        if (kv) {
            key = kv[1];
            const v = kv[2];
            if (v === "") { out[key] = []; continue; }
            out[key] = unquote(v);
            continue;
        }
        const li = /^\s+-\s+(.*)$/.exec(raw);
        if (li && key) {
            if (!Array.isArray(out[key])) out[key] = [];
            out[key].push(unquote(li[1]));
        }
    }
    return out;
}

function unquote(s) {
    const t = String(s).trim();
    if (t.startsWith('"') && t.endsWith('"')) {
        try { return JSON.parse(t); } catch { return t.slice(1, -1); }
    }
    return t;
}

/**
 * 摘要与要点：从一份 markdown 里抽「最该被记起」的几行。
 * 规则刻意简单 —— 可预测比聪明重要。
 */
export function summarizeText(md, { maxPoints = 6, maxChars = 160 } = {}) {
    const lines = String(md).replace(/\r\n/g, "\n").split("\n");
    const heads = [];
    const points = [];
    let firstPara = "";

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("|")) continue;
        if (/^!?\[/.test(line)) continue;

        const h = /^(#{1,4})\s+(.+)$/.exec(line);
        if (h) {
            heads.push({ level: h[1].length, text: h[2].trim() });
            continue;
        }
        if (!firstPara && !/^[-*+]\s/.test(line) && !/^\d+\.\s/.test(line) && !line.startsWith("```")) {
            firstPara = line.slice(0, maxChars);
        }
        const b = /^[-*+]\s+(.+)$/.exec(line) || /^\d+\.\s+(.+)$/.exec(line);
        if (b && b[1].length >= 2 && points.length < maxPoints) {
            points.push(b[1].replace(/\*\*/g, "").slice(0, maxChars));
        }
    }

    const docTitle = heads.find((h) => h.level === 1)?.text ?? "";
    const summary = (firstPara || docTitle || points[0] || "").slice(0, maxChars);
    return { summary, points, heads };
}

/** 材料镜像笔记的正文骨架。 */
export function materialBody({ summary, points, rawPath, rawChars }) {
    const out = [];
    out.push("## 这份材料讲什么", "", summary || "（没抽出摘要）", "");
    if (points.length) {
        out.push("## 要点", "");
        for (const p of points) out.push(`- ${p}`);
        out.push("");
    }
    out.push("## 出处", "", `- 工作区原文：\`${rawPath}\``);
    out.push(`- 原文长度：${rawChars} 字`);
    out.push("");
    out.push("> 想在原文里搜：用工作区的 `sh` 工具 grep，或直接问 Rester「翻一下 XX 材料」。");
    out.push("");
    return out.join("\n");
}

/** 需求索引笔记的正文骨架。 */
export function requirementIndexBody(s) {
    const out = [];
    out.push("## 现在到哪一步", "");
    out.push(`- 阶段：**${s.stageName ?? "-"}**（${s.progress ?? "-"}）`);
    if (s.next) out.push(`- 下一步：${s.next}`);
    out.push(`- 工作区：\`${s.dir ?? "-"}\``);
    out.push("");
    if (s.blockers?.length) {
        out.push("## 卡点", "");
        for (const b of s.blockers) out.push(`- ${b}`);
        out.push("");
    }
    if (s.subs?.length) {
        out.push("## 子需求", "");
        out.push("| 编号 | 标题 | 阶段 | 研效通 |");
        out.push("| --- | --- | --- | --- |");
        for (const x of s.subs.slice(0, 60)) {
            out.push(`| ${x.id ?? ""} | ${x.title ?? ""} | ${x.stage ?? "-"} | ${x.yxtNo ?? "未推"} |`);
        }
        out.push("");
    }
    out.push("## 材料与产物", "");
    out.push("见本笔记旁边的 `原材料/` 目录；Word 产物留在工作区 `产物/`。");
    out.push("");
    return out.join("\n");
}
