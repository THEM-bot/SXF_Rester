const $ = (selector) => document.querySelector(selector);
let rows = [];
let selectedDir = null;
let viewedStage = null;
let busy = false;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function request(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}

function showOverview() {
  selectedDir = null;
  viewedStage = null;
  $('#overview').hidden = false;
  $('#detail').hidden = true;
  $('#detail').replaceChildren();
}

function renderProjects() {
  const container = $('#projects');
  container.replaceChildren();
  rows.forEach((item) => {
    const button = el('button', 'project');
    button.type = 'button';
    button.append(el('span', 'project-title', item.title));
    button.append(el('span', 'project-meta', `${item.id} · ${item.stageName} ${item.progress}`));
    button.append(el('span', 'project-meta', `任务 ${item.tasksDone}/${item.tasksTotal} · 待确认 ${item.waitingTotal} · 评审问题 ${item.openReviews}`));
    button.addEventListener('click', () => {
      selectedDir = item.dir;
      viewedStage = null;
      $('#overview').hidden = true;
      $('#detail').hidden = false;
      loadDetail();
    });
    container.append(button);
  });
}

function section(parent, title, values, render) {
  if (!values.length) return;
  const block = el('div', 'block');
  block.append(el('h3', '', title));
  const list = el('ul', 'rows');
  values.forEach((item) => list.append(render(item)));
  block.append(list);
  parent.append(block);
}

async function act(data, action) {
  if (busy) return;
  busy = true;
  $('#detail').setAttribute('aria-busy', 'true');
  $('#detail').querySelectorAll('button,input').forEach((control) => { control.disabled = true; });
  const notice = $('#action-notice');
  notice.textContent = '正在保存…';
  notice.className = 'action-notice';
  try {
    const result = await request('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PM-Flow': 'board' },
      body: JSON.stringify({ dir: selectedDir, stage: data.stage, ...action }),
    });
    if (action.action === 'advance' && !result.advanced) throw new Error('已经是最后阶段');
    if (action.action === 'advance' || action.action === 'back') viewedStage = null;
    await refresh('已保存');
  } catch (error) {
    if (action.action === 'add-task') {
      notice.textContent = error.message;
      notice.className = 'action-notice error';
      $('#detail').querySelectorAll('button,input').forEach((control) => { control.disabled = false; });
    } else {
      await loadDetail(error.message);
    }
  } finally {
    busy = false;
    $('#detail').removeAttribute('aria-busy');
  }
}

function renderDetail(data, message = '') {
  const container = $('#detail');
  container.replaceChildren();
  const back = el('button', 'back', '← 返回全部项目');
  back.type = 'button';
  back.addEventListener('click', showOverview);
  container.append(back);
  const heading = el('div', 'detail-head');
  const title = el('div');
  title.append(el('h2', '', data.title), el('span', 'muted', data.id));
  heading.append(title, el('span', 'badge', data.stageName));
  container.append(heading);
  const [current, total] = String(data.progress || '0/1').split('/').map(Number);
  const progress = el('div', 'progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '阶段进度');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(total || 1));
  progress.setAttribute('aria-valuenow', String(current || 0));
  const bar = el('span');
  bar.style.width = `${Math.min(100, Math.max(0, (current / (total || 1)) * 100))}%`;
  progress.append(bar);
  container.append(progress, el('div', 'muted', `阶段 ${data.progress}`));
  const stages = el('div', 'stage-list');
  if (!data.stages.some((stage) => stage.key === viewedStage)) viewedStage = data.stage;
  const selectedStage = data.stages.find((stage) => stage.key === viewedStage);
  for (const stage of data.stages) {
    const button = el('button', `stage${stage.key === data.stage ? ' current' : ''}`, `${stage.name}${stage.key === data.stage ? ' · 当前' : ''}`);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(stage.key === viewedStage));
    button.addEventListener('click', () => { viewedStage = stage.key; renderDetail(data); });
    stages.append(button);
  }
  const stageBlock = el('div', 'block');
  stageBlock.append(el('h3', '', '阶段'), stages, el('p', 'stage-goal', selectedStage.goal));
  container.append(stageBlock);
  for (const gate of data.gateFailures || []) container.append(el('div', 'warning', `${gate.hint}${gate.actual ? ` · ${gate.actual}` : ''}`));
  const actions = el('div', 'stage-actions');
  const stageIndex = data.stages.findIndex((stage) => stage.key === data.stage);
  if (stageIndex > 0) {
    const previous = el('button', 'secondary', '返回上一阶段');
    previous.type = 'button';
    previous.addEventListener('click', () => act(data, { action: 'back' }));
    actions.append(previous);
  }
  if (data.next) {
    const advance = el('button', 'primary', '进入下一阶段');
    advance.type = 'button';
    advance.addEventListener('click', () => act(data, { action: 'advance' }));
    actions.append(advance);
  }
  container.append(actions);
  const notice = el('div', message === '已保存' ? 'action-notice success' : 'action-notice error', message);
  notice.id = 'action-notice';
  notice.setAttribute('role', 'status');
  container.append(notice);
  const tasks = data.allTasks.filter((task) => task.stage === viewedStage);
  const taskBlock = el('div', 'block');
  taskBlock.append(el('h3', '', `${selectedStage.name} · 任务`));
  const taskList = el('ul', 'rows');
  if (!tasks.length) taskBlock.append(el('p', 'muted', '此阶段暂无任务'));
  tasks.forEach((task) => {
    const item = el('li');
    const label = el('label', 'row-top');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.status === 'done';
    checkbox.setAttribute('aria-label', `${task.title}，标记为${checkbox.checked ? '待处理' : '已完成'}`);
    checkbox.addEventListener('change', () => act(data, {
      action: 'task', id: task.id, previousStatus: task.status, done: checkbox.checked,
    }));
    const text = el('span', 'row-text');
    text.append(el('span', 'row-title', task.title), el('span', 'muted row-meta', `${task.id} · ${task.who || '未指定'} · ${{done:'已完成',doing:'进行中',blocked:'已阻塞',todo:'待处理'}[task.status] || task.status}`));
    label.append(checkbox, text);
    item.append(label);
    taskList.append(item);
  });
  taskBlock.append(taskList, taskForm(data, false));
  container.append(taskBlock);
  const pendingBlock = el('div', 'block');
  pendingBlock.append(el('h3', '', '待确认 · 全部阶段'));
  const pending = data.pendingByWho || [];
  if (!pending.length) pendingBlock.append(el('p', 'muted', '暂无待确认事项'));
  const pendingList = el('ul', 'rows');
  for (const group of pending) {
    for (const entry of group.items) {
      const item = el('li');
      item.append(el('span', 'row-title', entry.text), el('span', 'muted row-meta', `${group.who} · ${entry.ref || '卡点'}`));
      pendingList.append(item);
    }
  }
  pendingBlock.append(pendingList, taskForm(data, true));
  container.append(pendingBlock);
  section(container, '待闭环评审', data.openReviews || [], (review) => {
    const item = el('li');
    const label = el('label', 'row-top');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `闭环评审：${review.text}`);
    checkbox.addEventListener('change', () => act(data, { action: 'review', id: review.id, previousStatus: review.status }));
    const text = el('span', 'row-text');
    text.append(el('span', 'row-title', review.text), el('span', 'muted row-meta', `#${review.id} · ${review.deferredTo || review.owner || '未指定'}`));
    label.append(checkbox, text);
    item.append(label);
    return item;
  });
  section(container, '卡点', data.blockers || [], (blocker) => el('li', '', blocker.text || blocker.title || String(blocker)));
}

function taskForm(data, pending) {
  const details = el('details', 'add-details');
  details.append(el('summary', '', pending ? '+ 新增待确认' : '+ 新增任务'));
  const form = el('form', 'add-form');
  const titleLabel = el('label', '', pending ? '待确认内容' : '任务内容');
  const title = document.createElement('input');
  title.type = 'text';
  title.required = true;
  title.maxLength = 500;
  titleLabel.append(title);
  const whoLabel = el('label', '', '负责人');
  const who = document.createElement('input');
  who.type = 'text';
  who.required = true;
  who.maxLength = 80;
  who.value = pending ? '' : '我';
  whoLabel.append(who);
  const submit = el('button', 'secondary', pending ? '添加待确认' : '添加任务');
  submit.type = 'submit';
  form.append(titleLabel, whoLabel, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const owner = who.value.trim();
    if (pending && owner === '我') {
      who.setCustomValidity('待确认事项请填写其他负责人');
      who.reportValidity();
      return;
    }
    act(data, { action: 'add-task', title: title.value, who: owner, targetStage: viewedStage });
  });
  who.addEventListener('input', () => who.setCustomValidity(''));
  details.append(form);
  return details;
}

async function loadDetail(message = '') {
  const dir = selectedDir;
  if (!dir) return;
  $('#detail').replaceChildren(el('p', 'muted', '正在读取需求…'));
  try {
    const data = await request(`/api/status?dir=${encodeURIComponent(dir)}`);
    if (selectedDir === dir) renderDetail(data, message);
  } catch (error) {
    if (selectedDir === dir) {
      showOverview();
      $('#notice').className = 'error';
      $('#notice').textContent = error.message;
    }
  }
}

async function refresh(message = '') {
  const button = $('#refresh');
  button.disabled = true;
  $('#notice').textContent = '正在读取…';
  $('#notice').className = '';
  try {
    const board = await request('/api/board');
    rows = board.active || [];
    $('#count').textContent = String(rows.length);
    $('#notice').textContent = rows.length ? '' : '暂无正在跟进的需求';
    renderProjects();
    if (selectedDir && rows.some((item) => item.dir === selectedDir)) await loadDetail(message);
    else if (selectedDir) showOverview();
  } catch (error) {
    $('#notice').className = 'error';
    $('#notice').textContent = error.message;
    if (selectedDir) await loadDetail(error.message);
  } finally { button.disabled = false; }
}

$('#refresh').addEventListener('click', () => refresh());
$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  if (!title) {
    form.elements.title.setCustomValidity('请填写需求名称');
    form.elements.title.reportValidity();
    return;
  }
  const kind = form.elements.kind.value;
  const notice = $('#create-notice');
  busy = true;
  form.querySelectorAll('input,button').forEach((control) => { control.disabled = true; });
  notice.className = '';
  notice.textContent = '正在创建…';
  try {
    const created = await request('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PM-Flow': 'board' },
      body: JSON.stringify({ action: 'create', title, kind }),
    });
    form.reset();
    $('#create-details').open = false;
    await refresh();
    $('#notice').textContent = `已创建 ${created.id} · ${created.title}`;
    $('#notice').className = 'success';
  } catch (error) {
    notice.className = 'error';
    notice.textContent = error.message;
  } finally {
    busy = false;
    form.querySelectorAll('input,button').forEach((control) => { control.disabled = false; });
  }
});
$('#create-form').elements.title.addEventListener('input', (event) => event.target.setCustomValidity(''));
refresh();
