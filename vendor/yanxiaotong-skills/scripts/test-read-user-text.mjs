#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUserTextFromArgs, stripBomText } from '../tools/lib/read-user-text.mjs';

assert.equal(stripBomText('\uFEFF标题'), '标题');
assert.equal(readUserTextFromArgs({ text: '在需求下创建缺陷' }), '在需求下创建缺陷');
assert.equal(readUserTextFromArgs({ _: ['@yanxiaotong-skills'] }, { positional: true }), '@yanxiaotong-skills');

const tmp = path.join(os.tmpdir(), `yxt-text-file-${process.pid}.txt`);
const body = '在需求下创建缺陷，登录按钮无响应，Chrome 点击后页面卡死';
fs.writeFileSync(tmp, `\uFEFF${body}`, 'utf8');
assert.equal(readUserTextFromArgs({ 'text-file': tmp, text: '会被忽略的乱码' }), body);
fs.unlinkSync(tmp);

const packRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = path.join(os.tmpdir(), `yxt-prepare-text-${process.pid}.txt`);
fs.writeFileSync(sample, '在需求 REQ-1 下创建缺陷，登录按钮无响应，Chrome 点击后页面卡死', 'utf8');
const parseIntent = path.join(packRoot, 'packages/defect/tools/parse-intent.mjs');
const out = path.join(os.tmpdir(), `yxt-prepare-out-${process.pid}.json`);
const run = spawnSync(process.execPath, [parseIntent, '--text-file', sample, '--out', out], {
  encoding: 'utf8',
});
assert.equal(run.status, 0, run.stderr || run.stdout);
const intent = JSON.parse(fs.readFileSync(out, 'utf8'));
assert.match(JSON.stringify(intent), /登录按钮无响应/);
fs.unlinkSync(sample);
fs.unlinkSync(out);

console.log('test-read-user-text: all passed');
