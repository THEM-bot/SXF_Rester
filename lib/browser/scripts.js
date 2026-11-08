/**
 * 注入页面执行的脚本（以字符串形式交给 CDP）。
 * 拆出来单独放，改这里就是在改「模型怎么看见页面」。
 */

/** 生成页面快照：可见可交互元素打 @eN 标号 + 页面正文 */
export const SNAPSHOT_JS = String.raw`
(() => {
  const SEL = [
    'a[href]','button','input','textarea','select','summary',
    '[role=button]','[role=link]','[role=tab]','[role=menuitem]','[role=checkbox]','[role=radio]','[role=switch]','[role=option]',
    '[contenteditable=true]','[onclick]','[tabindex]:not([tabindex="-1"])'
  ].join(',');
  document.querySelectorAll('[data-pmf-ref]').forEach(el => el.removeAttribute('data-pmf-ref'));
  const nodes = Array.from(document.querySelectorAll(SEL));
  const out = [];
  let i = 0;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return true;
  };
  const labelOf = (el) => {
    // 优先拿「人看到的名字」：aria-label > title > 关联 <label> > placeholder > 自身文字
    const aria = el.getAttribute('aria-label') || el.getAttribute('title');
    if (aria && aria.trim()) return aria.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (el.labels && el.labels.length) {
      const t = (el.labels[0].innerText || '').trim();
      if (t) return t.replace(/\s+/g, ' ').slice(0, 100);
    }
    const own = (el.innerText || '').trim();
    const ph = (el.getAttribute('placeholder') || '').trim();
    if (own) return own.replace(/\s+/g, ' ').slice(0, 100);
    if (ph) return ph.slice(0, 100);
    if (el.value) return String(el.value).slice(0, 100);
    return '';
  };
  for (const el of nodes) {
    if (!visible(el)) continue;
    i += 1;
    const tag = el.tagName.toLowerCase();
    let role = tag;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'a') role = 'link';
    else if (tag === 'button' || el.getAttribute('role') === 'button') role = 'button';
    else if (tag === 'input') {
      role = type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : (type === 'submit' || type === 'button') ? 'button' : 'input';
    } else if (tag === 'textarea') role = 'textarea';
    else if (tag === 'select') role = 'select';
    else if (el.getAttribute('contenteditable') === 'true') role = 'editable';
    const item = { ref: '@e' + i, role, name: labelOf(el) };
    el.setAttribute('data-pmf-ref', 'e' + i);
    if (type === 'checkbox' || type === 'radio') item.checked = !!el.checked;
    else if (el.value && tag !== 'select') item.value = String(el.value).slice(0, 60);
    if (tag === 'select') {
      const opt = el.selectedOptions && el.selectedOptions[0];
      if (opt) item.value = (opt.textContent || '').trim().slice(0, 40);
    }
    if (tag === 'a' && el.href) item.href = el.href.slice(0, 160);
    if (el.disabled) item.disabled = true;
    out.push(item);
  }
  const bodyText = (document.body && document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
  return { url: location.href, title: document.title, text: bodyText, elements: out };
})()
`;

/** 把 @eN 对应的 DOM 元素解析成 backendNodeId（给 CDP DOM.resolveNode 用） */
export const RESOLVE_REF_JS = (refName) => String.raw`
(() => {
  const el = document.querySelector('[data-pmf-ref="${refName}"]');
  return el ? true : false;
})()
`;

/** 点击：优先派发真实事件序列 */
export const CLICK_JS = (refName) => String.raw`
(() => {
  const el = document.querySelector('[data-pmf-ref="${refName}"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = el.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
  for (const type of ['pointerover','pointerenter','pointerdown','mousedown','pointerup','mouseup','click']) {
    try {
      const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, opts));
    } catch (e) {}
  }
  return true;
})()
`;

/** 填值：input/textarea 走 value setter + input/change；contenteditable 走 execCommand */
export const FILL_JS = (refName, textJson, { clear = true, submit = false } = {}) => String.raw`
(() => {
  const el = document.querySelector('[data-pmf-ref="${refName}"]');
  if (!el) return { ok: false, reason: 'not found' };
  const text = ${textJson};
  el.scrollIntoView({ block: 'center' });
  if (el.isContentEditable) {
    el.focus();
    if (${clear}) document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  } else {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (${clear}) el.focus();
    if (setter) setter.call(el, ${clear} ? text : (el.value || '') + text);
    else el.value = ${clear} ? text : (el.value || '') + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (${submit}) {
    const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    const form = el.form;
    if (form && form.requestSubmit) { try { form.requestSubmit(); } catch (e) {} }
  }
  return { ok: true, value: (el.value !== undefined ? el.value : el.innerText || '').slice(0, 80) };
})()
`;

/** 选择下拉项：按文字或值匹配 */
export const SELECT_JS = (refName, wantJson) => String.raw`
(() => {
  const el = document.querySelector('[data-pmf-ref="${refName}"]');
  if (!el) return { ok: false, reason: 'not found' };
  const want = String(${wantJson});
  const opts = Array.from(el.options || []);
  const hit = opts.find(o => (o.textContent || '').trim() === want) || opts.find(o => o.value === want) || opts.find(o => (o.textContent || '').includes(want));
  if (!hit) return { ok: false, reason: '没找到这个选项', options: opts.slice(0, 20).map(o => (o.textContent || '').trim()) };
  el.value = hit.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: (hit.textContent || '').trim() };
})()
`;

/** 按文字找元素并点（不需要先 snapshot 的快捷方式） */
export const CLICK_TEXT_JS = (textJson, { nth = 0 } = {}) => String.raw`
(() => {
  const want = String(${textJson}).trim();
  const SEL = 'a,button,[role=button],[role=tab],[role=menuitem],input[type=submit],input[type=button],label,span,div';
  const cands = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const t = ((el.innerText || el.value || el.getAttribute('aria-label') || '') + '').trim();
    if (!t || !t.includes(want)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  // 取「最内层」的那个，避免点到包裹 div
  const target = cands.filter(el => !cands.some(o => o !== el && el.contains(o)))[Number(${nth}) || 0];
  if (!target) return { ok: false, candidates: cands.slice(0, 8).map(e => (e.innerText || '').trim().slice(0, 60)) };
  target.scrollIntoView({ block: 'center' });
  target.click();
  const r2 = target.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r2.x + r2.width / 2, clientY: r2.y + r2.height / 2, view: window };
  for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
    try { target.dispatchEvent(new MouseEvent(type, o)); } catch (e) {}
  }
  return { ok: true, tag: target.tagName.toLowerCase(), text: (target.innerText || '').trim().slice(0, 60) };
})()
`;

/** 提取表格 / 列表为结构化数据 */
export const EXTRACT_JS = ({ selector, kind = "auto" } = {}) => String.raw`
(() => {
  const sel = ${JSON.stringify(selector || null)};
  const kind = ${JSON.stringify(kind)};
  const root = sel ? (document.querySelector(sel) || document) : document;
  const tables = Array.from(root.querySelectorAll('table')).map((t, ti) => {
    const rows = Array.from(t.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th,td')).map(td => (td.innerText || '').replace(/\s+/g, ' ').trim())
    ).filter(r => r.length);
    const headers = rows.length ? rows[0] : [];
    return { index: ti, headers, rows: rows.slice(rows.length > 1 ? 1 : 0), total: rows.length };
  }).filter(t => t.rows.length || t.headers.length);
  const lists = Array.from(root.querySelectorAll('ul,ol')).slice(0, 20).map((ul, li) => ({
    index: li,
    items: Array.from(ul.querySelectorAll('li')).map(x => (x.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 200),
  })).filter(l => l.items.length);
  return { url: location.href, title: document.title, tables, lists };
})()
`;
