#!/usr/bin/env node
/**
 * P-241 / P-240：description → HTML 单测
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  looksLikeHtml,
  normalizeDescriptionHtml,
  applyDescriptionHtml,
  neutralizeHtmlRiskLiterals,
} = require('./lib/description-to-html.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

test('plain newlines become paragraphs', () => {
  const html = normalizeDescriptionHtml('第一段\n\n第二段');
  assert.match(html, /<p>第一段<\/p>/);
  assert.match(html, /<p>第二段<\/p>/);
});

test('markdown heading and list', () => {
  const html = normalizeDescriptionHtml('# 标题\n\n- 甲\n- 乙');
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<ul><li>甲<\/li><li>乙<\/li><\/ul>/);
});

test('markdown table', () => {
  const html = normalizeDescriptionHtml('| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.match(html, /<table>/);
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td>1<\/td>/);
});

test('fenced code escapes tags', () => {
  const html = normalizeDescriptionHtml('```\n<script>alert(1)</script>\n```');
  assert.match(html, /<pre><code>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
});

test('bare script in plain text is escaped not truncated', () => {
  const html = normalizeDescriptionHtml('验收：禁止裸写 <script> 标签。后续章节还在。');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /后续章节还在/);
});

test('existing html pass-through with neutralize', () => {
  const raw = '<p>hello</p><script>x</script><p>tail</p>';
  const html = normalizeDescriptionHtml(raw);
  assert.match(html, /＜script＞|＜\/script＞/);
  assert.match(html, /tail/);
  assert.equal(looksLikeHtml(raw), true);
});

test('applyDescriptionHtml leaves empty alone', () => {
  assert.deepEqual(applyDescriptionHtml({ title: 't' }), { title: 't' });
  assert.deepEqual(applyDescriptionHtml({ description: '' }), { description: '' });
});

test('applyDescriptionHtml converts description', () => {
  const out = applyDescriptionHtml({ title: 't', description: '一行' });
  assert.equal(out.title, 't');
  assert.match(out.description, /<p>一行<\/p>/);
});

test('neutralize event handlers', () => {
  const { text, hits } = neutralizeHtmlRiskLiterals('<img onerror=alert(1)>');
  assert.ok(hits.includes('event-handler'));
  assert.match(text, /onerror＝/);
});

console.log('test-description-to-html: all passed');
