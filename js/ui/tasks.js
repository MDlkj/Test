import { h, clear, iconDot } from './render.js';

let containerEl = null;
let handlers = {};

function difficultyDots(difficulty) {
  const wrapper = h('div', { className: 'task-difficulty', aria: { label: `Difficulty ${difficulty}` } });
  for (let i = 1; i <= 5; i++) {
    const dot = h('span', { className: i <= difficulty ? 'active' : '' });
    wrapper.appendChild(dot);
  }
  return wrapper;
}

function subtaskItem(subtask, active) {
  const item = h('li', { className: 'subtask-item', dataset: { subtaskId: subtask.id } });
  const checkbox = h('input', {
    type: 'checkbox',
    checked: subtask.status === 'done',
    dataset: { subtaskId: subtask.id },
    aria: { label: `Toggle ${subtask.title}` },
  });
  checkbox.checked = subtask.status === 'done';
  const label = h('span', {}, subtask.title);
  const difficulty = difficultyDots(subtask.difficulty || 1);
  const focusBtn = h('button', {
    className: 'icon secondary start-focus-subtask',
    dataset: { subtaskId: subtask.id },
    aria: { label: 'Focus on subtask' },
  }, '▶');
  const deleteBtn = h('button', {
    className: 'icon secondary delete-subtask',
    dataset: { subtaskId: subtask.id },
    aria: { label: 'Delete subtask' },
  }, '×');
  item.append(checkbox, label, difficulty, focusBtn, deleteBtn);
  if (active && active.type === 'subtask' && active.id === subtask.id) {
    item.classList.add('active');
  }
  return item;
}

function taskCard(task, { project, subtasks }, active) {
  const card = h('div', { className: 'task-card', dataset: { taskId: task.id } });
  if (task.status === 'done') {
    card.classList.add('completed');
  }
  if (active && active.type === 'task' && active.id === task.id) {
    card.classList.add('active');
  }
  const header = h('div', { className: 'task-header' });
  const checkbox = h('input', {
    type: 'checkbox',
    dataset: { taskId: task.id },
    aria: { label: `Toggle ${task.title}` },
  });
  checkbox.checked = task.status === 'done';
  const info = h('div', { className: 'task-info' });
  const title = h('div', { className: 'task-title' });
  if (project) {
    title.appendChild(iconDot(project.color));
  }
  const titleText = h('span', {}, task.title);
  title.appendChild(titleText);
  if (task.due) {
    const due = h('span', { className: 'due' }, `Due ${task.due}`);
    title.appendChild(due);
  }
  info.appendChild(title);
  info.appendChild(h('div', { className: 'notes' }, task.notes || ''));
  const actions = h('div', { className: 'task-actions' });
  const starBtn = h('button', {
    className: 'icon secondary star-task',
    dataset: { taskId: task.id },
    aria: { label: task.starred ? 'Unstar task' : 'Star task' },
  }, task.starred ? '★' : '☆');
  const focusBtn = h('button', {
    className: 'secondary start-focus',
    dataset: { taskId: task.id },
  }, 'Focus');
  const expandBtn = h('button', { className: 'secondary toggle-subtasks', dataset: { taskId: task.id } }, 'Expand');
  const deleteBtn = h('button', { className: 'icon secondary delete-task', dataset: { taskId: task.id }, aria: { label: 'Delete task' } }, '×');
  actions.append(starBtn, focusBtn, expandBtn, deleteBtn);
  header.append(checkbox, info, difficultyDots(task.difficulty || 1), actions);
  card.appendChild(header);

  const subList = h('ul', { className: 'subtask-list' });
  subtasks.forEach((sub) => {
    subList.appendChild(subtaskItem(sub, active));
  });
  const quickAdd = h('li', { className: 'subtask-item quick-add' });
  const quickInput = h('input', {
    type: 'text',
    placeholder: 'Add subtask and press Enter',
    dataset: { taskId: task.id },
    className: 'quick-add-input',
  });
  quickAdd.append(quickInput);
  subList.appendChild(quickAdd);
  card.appendChild(subList);

  const footer = h('div', { className: 'task-footer' });
  const toggleAward = h('label', { className: 'toggle-award' });
  const awardToggle = h('input', { type: 'checkbox', dataset: { taskId: task.id, action: 'toggle-award' } });
  awardToggle.checked = task.awardSubtasksSeparately;
  toggleAward.append(awardToggle, document.createTextNode('Award subtasks separately'));
  footer.appendChild(toggleAward);
  card.appendChild(footer);
  return card;
}

export function render(container, list, { active }) {
  containerEl = container;
  clear(container);
  if (!list.length) {
    container.appendChild(h('div', { className: 'empty-state' }, 'Add a task. Pick a hard one.'));
    return;
  }
  list.forEach((entry) => {
    const card = taskCard(entry.task, { project: entry.project, subtasks: entry.subtasks }, active);
    container.appendChild(card);
  });
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('input[type="checkbox"][data-task-id]')) {
    handlers.onToggleTask?.(target.dataset.taskId, target.checked);
  } else if (target.matches('input[type="checkbox"][data-subtask-id]')) {
    handlers.onToggleSubtask?.(target.dataset.subtaskId, target.checked);
  } else if (target.dataset.action === 'toggle-award') {
    handlers.onToggleAward?.(target.dataset.taskId, target.checked);
  }
}

function handleClick(event) {
  const btn = event.target.closest('button');
  if (!btn) return;
  if (btn.classList.contains('start-focus')) {
    handlers.onStartFocus?.('task', btn.dataset.taskId);
  } else if (btn.classList.contains('toggle-subtasks')) {
    const card = btn.closest('.task-card');
    card?.classList.toggle('collapsed');
  } else if (btn.classList.contains('delete-task')) {
    handlers.onDeleteTask?.(btn.dataset.taskId);
  } else if (btn.classList.contains('delete-subtask')) {
    handlers.onDeleteSubtask?.(btn.dataset.subtaskId);
  } else if (btn.classList.contains('start-focus-subtask')) {
    handlers.onStartFocus?.('subtask', btn.dataset.subtaskId);
  } else if (btn.classList.contains('star-task')) {
    handlers.onToggleStar?.(btn.dataset.taskId);
  }
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && event.target.classList.contains('quick-add-input')) {
    event.preventDefault();
    const value = event.target.value.trim();
    if (!value) return;
    handlers.onAddSubtask?.(event.target.dataset.taskId, value);
    event.target.value = '';
  }
}

export function mount(container, callbacks) {
  containerEl = container;
  handlers = callbacks;
  container.addEventListener('change', handleChange);
  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeyDown);
}

export function unmount() {
  if (!containerEl) return;
  containerEl.removeEventListener('change', handleChange);
  containerEl.removeEventListener('click', handleClick);
  containerEl.removeEventListener('keydown', handleKeyDown);
  containerEl = null;
}

