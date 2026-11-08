/**
 * 给模型用的 `obsidian` 工具定义。
 *
 * 设计取舍：只暴露「读」和「写一篇结构化笔记」两类动作，不做通用文件操作。
 * 原因是通用 CRUD 很容易让模型把知识库写成一堆无 frontmatter 的散装 md；
 * 结构化的 remember/经验写入会强制带 type/tags/requirement，几个月后还能搜到。
 */

export const OBSIDIAN_TOOL_NAME = "obsidian";

export const OBSIDIAN_DESCRIPTION = `读写用户的 Obsidian 知识库（长期记忆：需求档案、经验、术语、决策）。

什么时候用：
· 想确认「以前是不是踩过这个坑/这个字段的坑」→ action=recall（先搜再下结论，别凭印象）
· 想把一条可复用的经验记下来 → action=remember（写进 20-经验/对应子目录）
· 想把某个需求的材料与 PRD 同步进知识库 → action=sync
· 想知道知识库连没连上 → action=status

什么时候不用：当前需求的正式产物仍在工作区（docx/req.json），知识库是**副本与提炼**，不是真相源。

经验该怎么写（agent 最容易做错的地方）：
· 一条经验只讲一件事，标题就是结论（「研效通 R01 没有父需求字段」而不是「研效通踩坑记录」）
· 必须写「下次怎么办」——只写现象的经验等于没写
· 有出处就写出处（哪个需求、哪次评审、哪个文档），以后能追溯
· 不要把某个需求的具体业务规则写成普适经验：那属于「业务口径」类，要标注适用范围`;

export const OBSIDIAN_PARAMETERS = {
    action: {
        type: "string",
        enum: ["status", "recall", "remember", "sync", "read", "tree"],
        description: "status=连通性与目录；recall=检索；remember=写一条经验；sync=同步当前工作区；read=读一篇；tree=列目录",
    },
    query: { type: "string", description: "recall 的关键词" },
    path: { type: "string", description: "read/tree 的 vault 内相对路径" },
    title: { type: "string", description: "remember 的标题（就是结论，不要用「XX记录」）" },
    content: { type: "string", description: "remember 的正文 Markdown（含「下次怎么办」）" },
    category: {
        type: "string",
        enum: ["pitfall", "rule", "dev", "howto"],
        description: "remember 的分类：pitfall=踩坑与限制 rule=业务口径 dev=领域规则 howto=写法与流程",
    },
    tags: { type: "array", items: { type: "string" }, description: "remember 的标签" },
    requirement: { type: "string", description: "关联的需求名（可选）" },
    dir: { type: "string", description: "sync 的工作区路径；省略则用当前唯一工作区" },
    includeDocx: { type: "boolean", description: "sync 时连 docx 一起（默认只同步 md）" },
};

export const OBSIDIAN_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        ok: { type: "boolean" },
        action: { type: "string" },
        error: { type: "string" },
        text: { type: "string" },
        path: { type: "string" },
        hits: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } },
    },
    required: ["ok", "action"],
    additionalProperties: true,
};

export function renderObsidian(value) {
    const out = [];
    if (!value?.ok) {
        out.push({ type: "text", text: `✗ ${value?.error ?? "知识库操作失败"}` });
        return out;
    }
    if (value.text) out.push({ type: "text", text: value.text });
    else out.push({ type: "text", text: `✓ ${value.action}` });
    return out;
}
