import { h, clear } from './render.js';

let container;
let handlers = {};
let settings = null;
let targets = [];
let lastState = null;

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function currentSelection(state) {
  if (state?.targetType && state.targetId) {
    return `${state.targetType}:${state.targetId}`;
  }
  return 'none:none';
}

function createOption(value, label, selected) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  if (selected) option.selected = true;
  return option;
}

function renderCard(state) {
  if (!container || !settings) return;
  clear(container);
  const card = h('div', { className: 'timer-inner' });
  const modeLabel = state.mode === 'break' ? (state.breakType === 'long' ? 'Long Break' : 'Break') : 'Focus';
  const elapsed = state.running ? Date.now() - state.startTs : 0;
  const planned = state.running ? state.plannedDurationMs : state.mode === 'break'
    ? (state.breakType === 'long' ? settings.longBreakMinutes : settings.shortBreakMinutes) * 60000
    : settings.pomoMinutes * 60000;
  const remaining = state.running ? Math.max(0, planned - elapsed) : planned;
  const display = state.mode === 'focus' ? remaining : remaining;
  const displayText = formatMs(display);
  card.appendChild(h('div', { className: 'timer-mode' }, modeLabel));
  card.appendChild(h('div', { className: 'timer-display' }, displayText));
  const progress = h('div', { className: 'timer-progress' });
  const fill = h('div', { className: 'fill' });
  const percent = planned ? Math.min(100, Math.round(((planned - remaining) / planned) * 100)) : 0;
  fill.style.width = `${percent}%`;
  progress.appendChild(fill);
  card.appendChild(progress);

  const controls = h('div', { className: 'timer-controls' });
  const startBtn = h('button', { id: 'timerStart', className: state.running && state.mode === 'focus' ? 'secondary' : '' }, state.running && state.mode === 'focus' ? 'Switch' : 'Start');
  const breakBtn = h('button', { id: 'timerBreak', className: state.mode === 'break' ? 'secondary' : '' }, 'Break');
  const stopBtn = h('button', { id: 'timerStop', className: 'secondary' }, 'Stop');
  controls.append(startBtn, breakBtn, stopBtn);
  card.appendChild(controls);

  const selectWrapper = h('div', { className: 'timer-select' });
  selectWrapper.appendChild(h('label', { for: 'timerTargetSelect' }, 'Active item'));
  const select = h('select', { id: 'timerTargetSelect' });
  const value = currentSelection(state);
  select.appendChild(createOption('none:none', 'No Task', value === 'none:none'));
  targets.forEach((target) => {
    const key = `${target.type}:${target.id}`;
    select.appendChild(createOption(key, target.label, key === value));
  });
  selectWrapper.appendChild(select);
  card.appendChild(selectWrapper);

  const meta = h('div', { className: 'timer-meta' });
  meta.appendChild(h('div', { className: 'pomo-count' }, `Pomodoro #${state.pomo || 0}`));
  const autoResumeLabel = h('label', { className: 'auto-resume-toggle' });
  const autoResume = h('input', { type: 'checkbox', id: 'timerAutoResume' });
  autoResume.checked = settings.autoResume;
  autoResumeLabel.append(autoResume, document.createTextNode('Auto-resume after break'));
  meta.appendChild(autoResumeLabel);
  card.appendChild(meta);

  container.appendChild(card);
}

function handleClick(event) {
  const btn = event.target.closest('button');
  if (!btn) return;
  if (btn.id === 'timerStart') {
    const select = container.querySelector('#timerTargetSelect');
    const [type, id] = select.value.split(':');
    handlers.onStart?.(type, id === 'none' ? null : id);
  } else if (btn.id === 'timerBreak') {
    handlers.onBreak?.();
  } else if (btn.id === 'timerStop') {
    handlers.onStop?.();
  }
}

function handleChange(event) {
  if (event.target.id === 'timerTargetSelect') {
    const [type, id] = event.target.value.split(':');
    handlers.onSelectTarget?.(type, id === 'none' ? null : id);
  } else if (event.target.id === 'timerAutoResume') {
    handlers.onAutoResume?.(event.target.checked);
  }
}

export function mount(root, options = {}) {
  container = root;
  handlers = options;
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
}

export function unmount() {
  if (!container) return;
  container.removeEventListener('click', handleClick);
  container.removeEventListener('change', handleChange);
  container = null;
}

export function updateState(state, context) {
  lastState = state;
  targets = context.targets || [];
  settings = context.settings;
  renderCard(state);
}

