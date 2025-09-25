import { h, clear } from './render.js';

let container;
let handlers = {};
let state = null;

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
  }
  return `${minutes}m`;
}

function renderHistory(sessions) {
  if (!sessions.length) return h('p', {}, 'No sessions logged yet.');
  const list = h('ul', { className: 'session-history' });
  sessions.slice(-10).reverse().forEach((session) => {
    const start = new Date(session.start);
    const end = session.end ? new Date(session.end) : null;
    const duration = session.end ? formatDuration(session.end - session.start) : 'In progress';
    list.appendChild(h('li', {}, `${start.toLocaleString()} — ${end ? end.toLocaleTimeString() : '...'} (${duration})`));
  });
  return list;
}

function renderContent(data) {
  if (!container) return;
  clear(container);
  state = data;
  if (!data?.item) {
    container.appendChild(h('p', {}, 'Select a task to view details.'));
    return;
  }
  const title = h('h3', {}, data.item.title);
  container.appendChild(title);
  if (data.parent && data.item !== data.parent) {
    container.appendChild(h('p', {}, `Parent task: ${data.parent.title}`));
  }
  const notesField = h('div', { className: 'form-field' });
  notesField.appendChild(h('label', { for: 'activeNotes' }, 'Notes'));
  const notes = h('textarea', { id: 'activeNotes', rows: 5, dataset: { targetType: data.type, targetId: data.item.id } }, data.item.notes || '');
  notesField.appendChild(notes);
  container.appendChild(notesField);

  if (data.type === 'task') {
    const awardToggle = h('label', { className: 'toggle-award' });
    const awardInput = h('input', { type: 'checkbox', id: 'activeAward', dataset: { taskId: data.item.id } });
    awardInput.checked = data.item.awardSubtasksSeparately;
    awardToggle.append(awardInput, document.createTextNode('Award subtasks separately'));
    container.appendChild(awardToggle);
  }

  if (data.type === 'task') {
    const soundRow = h('div', { className: 'form-field' });
    soundRow.appendChild(h('label', { for: 'soundStartSelect' }, 'Start sound'));
    const startSelect = h('select', { id: 'soundStartSelect', dataset: { targetType: data.type, targetId: data.item.id, soundType: 'start' } });
    startSelect.appendChild(h('option', { value: '' }, 'Default'));
    data.sounds.forEach((sound) => {
      startSelect.appendChild(h('option', { value: sound.id, selected: sound.id === (data.item.soundStartId ?? '') }, sound.name));
    });
    soundRow.appendChild(startSelect);
    const completeLabel = h('label', { for: 'soundCompleteSelect' }, 'Complete sound');
    const completeSelect = h('select', { id: 'soundCompleteSelect', dataset: { targetType: data.type, targetId: data.item.id, soundType: 'complete' } });
    completeSelect.appendChild(h('option', { value: '' }, 'Default'));
    data.sounds.forEach((sound) => {
      completeSelect.appendChild(h('option', { value: sound.id, selected: sound.id === (data.item.soundCompleteId ?? '') }, sound.name));
    });
    soundRow.appendChild(completeLabel);
    soundRow.appendChild(completeSelect);
    container.appendChild(soundRow);
  }

  container.appendChild(h('h4', {}, 'Recent sessions'));
  container.appendChild(renderHistory(data.sessions));
}

function handleChange(event) {
  if (event.target.id === 'activeNotes') {
    const { targetType, targetId } = event.target.dataset;
    handlers.onUpdateNotes?.(targetType, targetId, event.target.value);
  } else if (event.target.id === 'activeAward') {
    handlers.onToggleAward?.(event.target.dataset.taskId, event.target.checked);
  } else if (event.target.id === 'soundStartSelect' || event.target.id === 'soundCompleteSelect') {
    const { targetType, targetId, soundType } = event.target.dataset;
    const value = event.target.value || null;
    handlers.onUpdateSound?.(targetType, targetId, soundType, value);
  }
}

export function mount(root, callbacks = {}) {
  container = root;
  handlers = callbacks;
  container.addEventListener('change', handleChange);
}

export function unmount() {
  if (!container) return;
  container.removeEventListener('change', handleChange);
  container = null;
}

export function render(containerEl, data, callbacks) {
  if (!container || container !== containerEl) {
    mount(containerEl, callbacks || handlers);
  }
  handlers = callbacks || handlers;
  renderContent(data);
}

