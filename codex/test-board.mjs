import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const here = path.dirname(fileURLToPath(import.meta.url));
const pmw = path.join(here, '..', 'tools', 'pmw.mjs');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-flow-board-test-'));
const dir = path.join(root, 'test');
await fs.mkdir(dir);
const run = (...args) => JSON.parse(execFileSync(process.execPath, [pmw, ...args, '--dir', dir, '--root', root, '--json'], { encoding: 'utf8' }));
let server;
try {
  run('init', '--here', '--kind', 'req', '--title', 'Board test', '--id', 'REQ-TEST');
  run('goto', 'S4_DEV_REVIEW');
  run('review', 'add', 'Review test');
  const port = 47832;
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(here, 'server.mjs')], {
    env: { ...process.env, PMF_PROJECTS_ROOT: root, PMF_BOARD_PORT: String(port) },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(() => { throw new Error('Test server failed to start'); }),
  ]);
  const get = async (url) => (await fetch(origin + url)).json();
  const post = async (body, headers = {}) => {
    const response = await fetch(origin + '/api/action', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-PM-Flow': 'board', ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const board = await get('/api/board');
  assert.equal(board.active.length, 1);
  assert.equal((await post({ action: 'create', title: 'No kind' })).status, 500);
  assert.equal((await post({ action: 'create', kind: 'req', title: '  ' })).status, 500);
  assert.equal((await post({ action: 'create', kind: 'req', title: '--root' })).status, 500);
  assert.equal((await post({ action: 'create', kind: 'req', title: 'Unsafe origin' }, { Origin: 'http://evil.test' })).status, 403);
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const reserved = path.join(root, `REQ-${day}-01`);
  await fs.mkdir(reserved);
  const created = await post({ action: 'create', title: '新需求 测试', kind: 'req' });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, `REQ-${day}-02`);
  const newStatus = await get(`/api/status?dir=${encodeURIComponent(created.body.dir)}`);
  assert.equal(newStatus.title, '新需求 测试');
  assert.equal(newStatus.stage, 'S1_INTAKE');
  assert.equal(newStatus.lastBy, 'user');
  const project = await post({ action: 'create', title: 'Large project test', kind: 'project' });
  assert.equal(project.status, 200);
  const projectStatus = await get(`/api/status?dir=${encodeURIComponent(project.body.dir)}`);
  assert.equal(projectStatus.stage, 'P1_INTAKE');
  assert.equal((await get('/api/board')).active.length, 3);
  let status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.stages.find((s) => s.key === 'S1_INTAKE').name, '基础材料收集');
  assert.ok(status.allTasks.some((t) => t.stage === 'S1_INTAKE'));
  const task = status.tasks.current[0];
  assert.ok(task);
  const common = { dir, stage: status.stage };
  const change = { ...common, action: 'task', id: task.id, previousStatus: task.status, done: true };
  assert.equal((await post(change, { Origin: 'http://evil.test' })).status, 403);
  assert.equal((await post({ ...change, dir: path.join(root, 'missing') })).status, 500);
  assert.equal((await post({ ...change, stage: 'stale' })).status, 500);
  assert.equal((await post(change)).status, 200);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.tasks.current.find((t) => t.id === task.id).status, 'done');
  assert.equal((await post(change)).status, 500);
  assert.equal((await post({ ...change, previousStatus: 'done', done: false })).status, 200);
  assert.equal((await post({ ...common, action: 'add-task', targetStage: 'S1_INTAKE', title: 'Earlier task', who: '我' })).status, 200);
  assert.equal((await post({ ...common, action: 'add-task', targetStage: 'S4_DEV_REVIEW', title: 'Pending item', who: '开发' })).status, 200);
  assert.equal((await post({ ...common, action: 'add-task', targetStage: 'invalid', title: 'Invalid', who: '我' })).status, 500);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  const earlier = status.allTasks.find((t) => t.title === 'Earlier task' && t.stage === 'S1_INTAKE');
  assert.ok(earlier);
  assert.equal((await post({ ...common, action: 'task', id: earlier.id, previousStatus: earlier.status, done: true })).status, 200);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.allTasks.find((t) => t.id === earlier.id).status, 'done');
  assert.ok(status.pendingByWho.some((group) => group.who === '开发' && group.items.some((item) => item.text === 'Pending item')));
  assert.ok(run('since', '--all').result.changes.some((change) => change.by === 'user' && change.note.includes('Pending item')));
  const blocked = await post({ ...common, action: 'advance' });
  assert.notEqual(blocked.status, 200);
  assert.match(blocked.body.error, /评审/);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.stage, common.stage);
  const review = status.openReviews[0];
  assert.equal((await post({ ...common, action: 'review', id: review.id, previousStatus: review.status })).status, 200);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.openReviews.length, 0);
  assert.equal((await post({ ...common, action: 'advance' })).status, 200);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.stage, 'S5_FINAL');
  assert.equal((await post({ dir, stage: status.stage, action: 'back' })).status, 200);
  status = await get(`/api/status?dir=${encodeURIComponent(dir)}`);
  assert.equal(status.stage, 'S4_DEV_REVIEW');
  console.log('Board API: task done/reopen, review closure, advance, gate, stale state and origin checks passed.');
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
  await fs.rm(root, { recursive: true, force: true });
}
