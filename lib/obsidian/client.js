/**
 * Obsidian Local REST API 客户端（零依赖）。
 *
 * 走的是 Obsidian 社区插件 "Local REST API with MCP"：
 *   https 默认端口 27124（自签证书，需忽略校验）
 *   http  默认端口 27123（需在插件设置里打开 insecure server）
 *
 * 端点（与 mcp-obsidian 的实现一致）：
 *   GET    /vault/                       列 vault 根
 *   GET    /vault/<path>/                列目录
 *   GET    /vault/<path>                 读文件
 *   PUT    /vault/<path>                 整篇覆写
 *   POST   /vault/<path>                 追加
 *   PATCH  /vault/<path>                按 heading / block / frontmatter 局部插入
 *   DELETE /vault/<path>                 删除
 *   POST   /search/simple/?query=&contextLength=  全文检索
 *   POST   /search/  (Content-Type: application/vnd.olrapi.jsonlogic+json)  JSON Logic 检索
 *   GET    /vault/<path>  (Accept: application/vnd.olrapi.note+json)       拿 frontmatter
 */
import http from "node:http";
import https from "node:https";
import { readSettings } from "../../tools/lib/settings.mjs";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_SECURE_PORT = 27124;
export const DEFAULT_INSECURE_PORT = 27123;

/** 读取环境变量里的连接信息；key 缺失时返回 null（表示没配置）。 */
export function obsidianConfig(overrides = {}) {
    if (readSettings().obsidian === false) return null;
    const key = overrides.apiKey ?? process.env.OBSIDIAN_API_KEY ?? "";
    if (!key) return null;
    const protocol = (overrides.protocol ?? process.env.OBSIDIAN_PROTOCOL ?? "https").toLowerCase();
    const host = overrides.host ?? process.env.OBSIDIAN_HOST ?? DEFAULT_HOST;
    const port = Number(
        overrides.port ??
        process.env.OBSIDIAN_PORT ??
        (protocol === "http" ? DEFAULT_INSECURE_PORT : DEFAULT_SECURE_PORT),
    );
    return { apiKey: key, protocol: protocol === "http" ? "http" : "https", host, port };
}

function encodePath(p) {
    return String(p)
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
}

/** 极简 request：不发包体（GET/DELETE）或发文本/JSON 包体。 */
function request(cfg, method, urlPath, { body, contentType, accept, timeoutMs = 15000 } = {}) {
    const mod = cfg.protocol === "http" ? http : https;
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
    const headers = { Authorization: `Bearer ${cfg.apiKey}` };
    if (contentType) headers["Content-Type"] = contentType;
    if (accept) headers.Accept = accept;
    if (payload) headers["Content-Length"] = payload.length;

    return new Promise((resolve, reject) => {
        const req = mod.request(
            {
                protocol: `${cfg.protocol}:`,
                host: cfg.host,
                port: cfg.port,
                method,
                path: urlPath,
                headers,
                timeout: timeoutMs,
                rejectUnauthorized: false,
            },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const text = Buffer.concat(chunks).toString("utf8");
                    let json;
                    try { json = text ? JSON.parse(text) : null; } catch { /* 不是 JSON */ }
                    resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
                });
            },
        );
        req.on("timeout", () => { req.destroy(new Error(`请求超时（${timeoutMs}ms）`)); });
        req.on("error", (e) => {
            const hint = e.code === "ECONNREFUSED"
                ? "  → Obsidian 没开，或 Local REST API 插件没启用。"
                : "";
            reject(new Error(`${method} ${urlPath} 失败：${e.message}${hint}`));
        });
        if (payload) req.write(payload);
        req.end();
    });
}

function unwrap(res, what) {
    if (res.status >= 400) {
        const msg = res.json?.message || res.text?.slice(0, 300) || "";
        throw new Error(`${what} 失败：HTTP ${res.status}${msg ? ` ${msg}` : ""}`);
    }
    return res;
}

/** 发一个 PATCH（header 驱动格式，需 Markdown-Patch-Version: 1）。 */
async function patchRaw(cfg, filepath, { operation, targetType, target, content }) {
    const headers = {
        "Content-Type": "text/markdown",
        "Markdown-Patch-Version": "1",
        Operation: operation,
        "Target-Type": targetType,
        Target: encodeURIComponent(target),
    };
    const mod = cfg.protocol === "http" ? http : https;
    const payload = Buffer.from(String(content), "utf8");
    const res = await new Promise((resolve, reject) => {
        const req = mod.request(
            {
                protocol: `${cfg.protocol}:`,
                host: cfg.host,
                port: cfg.port,
                method: "PATCH",
                path: `/vault/${encodePath(filepath)}`,
                headers: { ...headers, Authorization: `Bearer ${cfg.apiKey}`, "Content-Length": payload.length },
                timeout: 15000,
                rejectUnauthorized: false,
            },
            (r) => {
                const chunks = [];
                r.on("data", (c) => chunks.push(c));
                r.on("end", () => resolve({ status: r.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
            },
        );
        req.on("timeout", () => req.destroy(new Error("请求超时")));
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
    if (res.status >= 400) {
        const hint = res.text.includes("40080")
            ? targetType === "frontmatter"
                ? `  → frontmatter 里还没有 "${target}" 这个字段。先用 write 整篇写一遍（带 frontmatter）再 patch。`
                : ""
            : "";
        const err = new Error(`patch ${filepath} 失败：HTTP ${res.status}${hint}`);
        err.status = res.status;
        err.body = res.text;
        throw err;
    }
    return true;
}

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** 找出所有以 target 结尾的标题路径，返回 "父::子" 形式的全限定名。忽略代码块里的伪标题。 */
export function findHeadingPaths(content, target) {
    const want = String(target).trim().toLowerCase();
    let inFence = false;
    const stack = [];
    const hits = [];
    for (const line of String(content ?? "").split("\n")) {
        if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        const m = HEADING_RE.exec(line);
        if (!m) continue;
        const level = m[1].length;
        const text = m[2].replace(/\s+#+\s*$/, "").trim();
        while (stack.length && stack[stack.length - 1][0] >= level) stack.pop();
        stack.push([level, text]);
        if (text.toLowerCase() === want) hits.push(stack.map(([, t]) => t).join("::"));
    }
    return hits;
}

/** 建一个绑定到某套配置的客户端。 */
export function createClient(cfg) {
    if (!cfg) throw new Error("没有配置 Obsidian API Key（OBSIDIAN_API_KEY）");
    const base = `${cfg.protocol}://${cfg.host}:${cfg.port}`;

    return {
        base,
        /** 列 vault 根，返回相对路径数组。 */
        async listVault() {
            const r = unwrap(await request(cfg, "GET", "/vault/"), "列出 vault");
            return r.json?.files ?? [];
        },
        /** 列某个目录，返回相对路径数组。 */
        async listDir(dirpath) {
            const r = unwrap(await request(cfg, "GET", `/vault/${encodePath(dirpath)}/`), `列出目录 ${dirpath}`);
            return r.json?.files ?? [];
        },
        /** 读单个文件正文。 */
        async read(filepath) {
            const r = unwrap(await request(cfg, "GET", `/vault/${encodePath(filepath)}`), `读 ${filepath}`);
            return r.text;
        },
        /** 读 frontmatter（服务端解析 YAML）。无 frontmatter 返回 {}。 */
        async frontmatter(filepath) {
            const r = unwrap(
                await request(cfg, "GET", `/vault/${encodePath(filepath)}`, {
                    accept: "application/vnd.olrapi.note+json",
                }),
                `读 ${filepath} 的 frontmatter`,
            );
            return r.json?.frontmatter ?? {};
        },
        /** 整篇覆写（不存在则创建）。 */
        async write(filepath, content) {
            unwrap(
                await request(cfg, "PUT", `/vault/${encodePath(filepath)}`, {
                    body: content,
                    contentType: "text/markdown; charset=utf-8",
                }),
                `写 ${filepath}`,
            );
            return true;
        },
        /** 追加到末尾（不存在则创建）。 */
        async append(filepath, content) {
            unwrap(
                await request(cfg, "POST", `/vault/${encodePath(filepath)}`, {
                    body: content,
                    contentType: "text/markdown; charset=utf-8",
                }),
                `追加 ${filepath}`,
            );
            return true;
        },
        /**
         * 局部插入。operation: append | prepend | replace
         * targetType: heading | block | frontmatter
         * target: heading 名（可用 "父::子" 全限定，也可只给短名——会自动补全）
         *
         * 注意：插件 5.x 有两种 PATCH 格式，必须显式带 Markdown-Patch-Version: 1
         * 才走 header 驱动的那套（实测缺这个头一律 400，报 "ambiguous between the
         * two patch formats"）。
         */
        async patch(filepath, { operation = "append", targetType = "heading", target, content }) {
            try {
                return await patchRaw(cfg, filepath, { operation, targetType, target, content });
            } catch (e) {
                // 只给了短标题（如 "下次怎么办"）而文件里它嵌在 "# 标题" 之下 →
                // 自动补成 "标题::下次怎么办" 再试一次。
                if (targetType !== "heading" || String(target).includes("::")) {
                    throw e;
                }
                // 40080 = target 无效。heading 短名几乎必然是这个问题，直接试补全；
                // 其它情况也容错再试一次（服务端措辞可能变）。
                let body;
                try { body = await this.read(filepath); } catch { throw e; }
                const candidates = findHeadingPaths(body, target);
                if (candidates.length === 1) {
                    return await patchRaw(cfg, filepath, {
                        operation, targetType, target: candidates[0], content,
                    });
                }
                if (candidates.length > 1) {
                    throw new Error(
                        `标题「${target}」有歧义，候选：${candidates.join(" / ")}。请用 "父::子" 形式的全限定路径。`,
                    );
                }
                throw e;
            }
        },
        /** 删除文件或目录。 */
        async remove(filepath) {
            unwrap(await request(cfg, "DELETE", `/vault/${encodePath(filepath)}`), `删除 ${filepath}`);
            return true;
        },
        /** 全文检索，返回 [{filename, score, matches:[{context}]}]。 */
        async search(query, contextLength = 120) {
            const qs = new URLSearchParams({ query, contextLength: String(contextLength) });
            const r = unwrap(await request(cfg, "POST", `/search/simple/?${qs}`), "检索");
            return Array.isArray(r.json) ? r.json : [];
        },
        /** 按标签找笔记（精确匹配 frontmatter tags 或正文 #tag）。 */
        async byTag(tag, dirpath) {
            const expr = { in: [tag, { var: "tags" }] };
            const query = dirpath
                ? { and: [expr, { glob: [`${dirpath.replace(/\/+$/, "")}/*`, { var: "path" }] }] }
                : expr;
            const r = unwrap(
                await request(cfg, "POST", "/search/", {
                    body: JSON.stringify(query),
                    contentType: "application/vnd.olrapi.jsonlogic+json",
                }),
                "按标签检索",
            );
            return (r.json ?? []).map((x) => x.filename).filter(Boolean);
        },
        /** 健康检查：能列根就说明通了。 */
        async ping() {
            try {
                const files = await this.listVault();
                return { ok: true, files: files.length };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        },
    };
}

/** 便捷：直接用环境变量建客户端。 */
export function clientFromEnv(overrides) {
    const cfg = obsidianConfig(overrides);
    return cfg ? createClient(cfg) : null;
}
