import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stagesOf } from '../tools/lib/state.mjs';
import { readSettings } from '../tools/lib/settings.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pmw = path.resolve(here, '..', 'tools', 'pmw.mjs');
const root = process.env.PMF_PROJECTS_ROOT || process.env.PMF_ROOT || readSettings().root || '';
const port = Number(process.env.PMF_BOARD_PORT || 47831);
const exec = promisify(execFile);

async function command(args) {
  if (!root) throw new Error('请先配置需求工作区父目录');
  let stdout;
  try {
    ({ stdout } = await exec(process.execPath, [pmw, ...args, '--root', root, '--json'], {
      windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    if (!error.stdout) throw error;
    stdout = error.stdout;
  }
  const result = JSON.parse(stdout);
  if (!result.ok) {
    const failures = result.result?.gateFailures;
    if (failures?.length) {
      throw new Error(failures.map((item) => `${item.hint}${item.actual ? `：${item.actual}` : ''}`).join('；'));
    }
    throw new Error(result.error || '操作失败');
  }
  return result;
}

let writing = false;
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) throw new Error('请求内容过长');
  }
  return JSON.parse(body);
}

async function createProject(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200 || title.startsWith('--') || /[\r\n\0]/.test(title)) {
    throw new Error('请输入有效的需求名称（不超过 200 字）');
  }
  if (!['req', 'project'].includes(input.kind)) throw new Error('请选择需求类型');
  const board = (await command(['board'])).result;
  const existing = new Set([...board.active, ...board.closed].map((item) => String(item.id).toUpperCase()));
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = input.kind === 'req' ? 'REQ' : 'PRJ';
  for (let n = 1; n <= 9999; n += 1) {
    const id = `${prefix}-${day}-${String(n).padStart(2, '0')}`;
    if (existing.has(id)) continue;
    const dir = path.join(root, id);
    try {
      await fs.mkdir(dir);
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      const created = await command(['init', '--here', '--dir', dir, '--kind', input.kind, '--id', id, '--title', title, '--by', 'user']);
      return created.result;
    } catch (error) {
      throw new Error(`创建未完成，请检查目录 ${dir}：${error.message}`);
    }
  }
  throw new Error('当天的编号已用完，请稍后重试');
}

function send(res, status, content, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}` || !['GET', 'POST'].includes(req.method) ||
      (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`)) {
    send(res, 403, JSON.stringify({ error: '请求不被允许' }));
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'POST' && url.pathname === '/api/action') {
      if (req.headers.origin !== `http://127.0.0.1:${port}` ||
          req.headers['content-type'] !== 'application/json' ||
          req.headers['x-pm-flow'] !== 'board') {
        send(res, 403, JSON.stringify({ error: '请求不被允许' }));
        return;
      }
      if (writing) {
        send(res, 409, JSON.stringify({ error: '另一项操作正在进行，请稍后重试' }));
        return;
      }
      writing = true;
      try {
        const input = await readBody(req);
        if (input.action === 'create') {
          send(res, 200, JSON.stringify(await createProject(input)));
          return;
        }
        const board = await command(['board']);
        const selected = board.result.active.find((item) => item.dir === input.dir);
        if (!selected) throw new Error('需求不存在，请刷新看板');
        const current = (await command(['status', '--dir', selected.dir])).result;
        if (current.stage !== input.stage) throw new Error('需求阶段已变化，请刷新后重试');
        let args;
        if (input.action === 'task') {
          const tasks = (await command(['task', 'list', '--all', '--dir', selected.dir])).result.tasks;
          const task = tasks.find((item) => item.id === input.id);
          if (!task || task.status !== input.previousStatus) throw new Error('任务状态已变化，请刷新后重试');
          if (typeof input.done !== 'boolean') throw new Error('无效的任务状态');
          args = ['task', input.done ? 'done' : 'reopen', task.id];
        } else if (input.action === 'add-task') {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          const who = typeof input.who === 'string' ? input.who.trim() : '';
          if (!title || title.length > 500 || title.startsWith('-')) throw new Error('请输入有效的任务内容（不超过 500 字）');
          if (!who || who.length > 80 || who.startsWith('-')) throw new Error('请输入有效的负责人');
          if (!stagesOf(current.kind).some((stage) => stage.key === input.targetStage)) throw new Error('所选阶段不存在');
          args = ['task', 'add', title, '--who', who, '--stage', input.targetStage, '--from', 'user'];
        } else if (input.action === 'review') {
          const review = current.openReviews.find((item) => item.id === input.id);
          if (!review || review.status !== input.previousStatus) throw new Error('评审状态已变化，请刷新后重试');
          args = ['review', 'close', String(review.id)];
        } else if (input.action === 'advance') {
          if (current.gateFailures?.length) {
            throw new Error(current.gateFailures.map((item) => `${item.hint}${item.actual ? `：${item.actual}` : ''}`).join('；'));
          }
          args = ['advance'];
        } else if (input.action === 'back') {
          const stages = stagesOf(current.kind);
          const index = stages.findIndex((stage) => stage.key === current.stage);
          if (index < 1) throw new Error('已经是第一阶段');
          args = ['back', stages[index - 1].key];
        } else {
          throw new Error('不支持的操作');
        }
        const result = await command([...args, '--dir', selected.dir, '--by', 'user']);
        send(res, 200, JSON.stringify(result.result ?? {}));
      } finally {
        writing = false;
      }
    } else if (req.method !== 'GET') {
      send(res, 404, JSON.stringify({ error: '页面不存在' }));
    } else if (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/style.css') {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8'
        : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
      send(res, 200, await fs.readFile(path.join(here, name)), type);
    } else if (url.pathname === '/api/board') {
      const result = await command(['board']);
      send(res, 200, JSON.stringify(result.result));
    } else if (url.pathname === '/api/status') {
      const dir = url.searchParams.get('dir');
      if (!dir) throw new Error('缺少需求目录');
      const board = await command(['board']);
      const selected = board.result.active.find((item) => item.dir === dir);
      if (!selected) throw new Error('需求不存在，请刷新看板');
      const status = await command(['status', '--dir', selected.dir]);
      const tasks = await command(['task', 'list', '--all', '--dir', selected.dir]);
      const stages = stagesOf(status.result.kind).map(({ key, name, goal, do: nextAction }) => ({ key, name, goal, nextAction }));
      send(res, 200, JSON.stringify({ ...status.result, stages, allTasks: tasks.result.tasks }));
    } else {
      send(res, 404, JSON.stringify({ error: '页面不存在' }));
    }
  } catch (error) {
    send(res, 500, JSON.stringify({ error: String(error.message || error) }));
  }
});

server.listen(port, '127.0.0.1', () => console.log(`PM Flow http://127.0.0.1:${port}/`));
