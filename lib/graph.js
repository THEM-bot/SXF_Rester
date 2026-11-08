/**
 * archify 渲染：把 pm-flow 的状态变成一张 archify 图（独立 HTML）
 *
 * 为什么要走「现场调用 archify 命令行」而不是在面板里重画：
 *   archify 的排版（泳道路由、标签避让、主路径高亮、legend、节点索引）是它自己的
 *   渲染器算出来的，照着 CSS 手抄只能抄到形，抄不到排布。这里直接把规格喂给它的
 *   renderer，拿回一份完整 HTML —— 面板里用新窗口打开，效果和 archify 官方样例一致。
 *
 * 关键约束（踩过坑）：
 *   · archify 校验 mainPath 必须是一条真实存在、列号严格递增的边链
 *   · col 只能 0..5，所以阶段多了要折行；折行边必须是 return，且不进 mainPath
 *   · id 只能是 ASCII，中文负责人名要编码，否则泳道 id 撞车
 *   · 渲染大约 0.5~1.5 秒，所以结果缓存到内存，键 = 工作区 + 图类型 + 状态文件 mtime
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { specFlow, specTasks } from "./archify/spec.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(HERE, "..");

/** 内置的 archify 渲染器（4.2MB 子集：bin + renderers + assets + schemas + locales + 许可文件） */
export const ARCHIFY_DIR = path.join(PACKAGE_ROOT, "vendor", "archify");
const ARCHIFY_BIN = path.join(ARCHIFY_DIR, "bin", "archify.mjs");

/** 渲染结果缓存：键是 工作区|类型|mtime，值是 HTML 字符串 */
const cache = new Map();
const CACHE_MAX = 6;

export function archifyAvailable() {
  try {
    return fs.statSync(ARCHIFY_BIN).isFile();
  } catch {
    return false;
  }
}

function stateMtime(dir) {
  for (const f of ["req.json", "project.json"]) {
    try {
      return fs.statSync(path.join(dir, f)).mtimeMs;
    } catch {
      /* 换下一个 */
    }
  }
  return 0;
}

function runArchify(spec, workDir) {
  return new Promise((resolve, reject) => {
    const specFile = path.join(workDir, "spec.json");
    const outFile = path.join(workDir, "out.html");
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 2), "utf8");
    execFile(
      process.execPath,
      [ARCHIFY_BIN, "render", "workflow", specFile, outFile],
      { cwd: workDir, timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`archify 渲染失败：${String(stderr || stdout || err.message).slice(0, 800)}`));
          return;
        }
        try {
          resolve(fs.readFileSync(outFile, "utf8"));
        } catch (e) {
          reject(new Error(`archify 没产出 HTML：${String(e?.message ?? e)}`));
        }
      },
    );
  });
}

/**
 * 渲染一张图
 * @param {{kind:'flow'|'tasks', dir:string, status:object, title?:string, stages?:Array, tasks?:Array}} opts
 * @returns {Promise<string>} 完整 HTML
 */
export async function renderGraph({ kind, dir, status, title, stages, tasks }) {
  const key = `${dir}|${kind}|${stateMtime(dir)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const spec =
    kind === "tasks"
      ? specTasks({ title: title ?? status?.title, stageName: status?.stageName, stage: status?.stage, tasks: tasks ?? [] })
      : specFlow({ title: title ?? status?.title, kind: status?.kind, stageName: status?.stageName, stages: stages ?? [] });

  if (!spec) throw new Error(kind === "tasks" ? "这个阶段还没有任务，没什么可画的。" : "读不到阶段信息。");

  // 在系统临时目录里渲染，别污染用户工作区
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || ".", "pmf-graph-"));
  try {
    const html = await runArchify(spec, tmp);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, html);
    return html;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* 临时目录删不掉就算了 */
    }
  }
}
