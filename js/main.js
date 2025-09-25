import * as models from './models.js';
import * as settingsStore from './settings.js';
import * as timer from './timer.js';
import * as points from './points.js';
import * as quotes from './quotes.js';
import * as sounds from './sounds.js';
import * as analytics from './analytics.js';
import * as backup from './backup.js';

import { render as renderTasks, mount as mountTasks } from './ui/tasks.js';
import * as timerCard from './ui/timerCard.js';
import * as dashboard from './ui/dashboard.js';
import * as activeDetails from './ui/activeDetails.js';
import * as modals from './ui/modals.js';
import * as toasts from './ui/toasts.js';

const state = {
  filter: 'all',
  search: '',
  projects: [],
  tasks: [],
  subtasks: [],
  profile: null,
  settings: null,
  timerState: timer.getState(),
  activeItem: { type: null, id: null },
  todayStats: { points: 0, minutes: 0, tasksDone: 0, subtasksDone: 0 },
  level: { level: 0, percent: 0 },
  history: { days: [], bestDay: null },
  breakdowns: { byProject: [], byDifficulty: [] },
  sounds: [],
  starredTasks: [],
};

const elements = {};

function $(id) {
  return document.getElementById(id);
}

function formatDateInTimezone(date = new Date()) {
  const tz = state.settings?.timezone || 'Europe/London';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

async function init() {
  elements.taskList = $('taskList');
  elements.projectList = $('projectList');
  elements.filterList = $('filterList');
  elements.filterAll = $('filterAll');
  elements.newTaskBtn = $('newTaskBtn');
  elements.searchInput = $('searchInput');
  elements.addProjectBtn = $('addProjectBtn');
  elements.backupBtn = $('backupBtn');
  elements.restoreInput = $('restoreInput');
  elements.settingsBtn = $('settingsBtn');
  elements.darkModeToggle = $('darkModeToggle');
  elements.timerCard = $('timerCard');
  elements.activeDetails = $('activeDetails');
  elements.quotesCard = $('quotesCard');
  elements.dashboard = $('dashboard');
  elements.statTodayPoints = $('statTodayPoints');
  elements.statTodayMinutes = $('statTodayMinutes');
  elements.statStreak = $('statStreak');
  elements.statLevel = $('statLevel');
  elements.levelProgressBar = $('levelProgressBar');

  await models.bootstrap();
  state.settings = await settingsStore.load();
  applyTheme();

  sounds.subscribe(loadSounds);
  await loadSounds();

  mountTasks(elements.taskList, {
    onToggleTask: handleToggleTask,
    onToggleSubtask: handleToggleSubtask,
    onAddSubtask: handleAddSubtask,
    onDeleteTask: handleDeleteTask,
    onDeleteSubtask: handleDeleteSubtask,
    onStartFocus: handleStartFocus,
    onToggleAward: handleToggleAward,
    onToggleStar: handleToggleStar,
  });

  timerCard.mount(elements.timerCard, {
    onStart: handleTimerStart,
    onBreak: handleTimerBreak,
    onStop: handleTimerStop,
    onSelectTarget: handleTimerSelect,
    onAutoResume: handleAutoResume,
  });

  activeDetails.mount(elements.activeDetails, {
    onUpdateNotes: handleUpdateNotes,
    onToggleAward: handleToggleAward,
    onUpdateSound: handleUpdateSound,
  });

  elements.filterAll.addEventListener('click', () => setFilter('all'));
  elements.filterList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    setFilter(button.dataset.filter);
  });
  elements.newTaskBtn.addEventListener('click', openNewTaskModal);
  elements.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.toLowerCase();
    renderTaskList();
  });
  elements.addProjectBtn.addEventListener('click', openProjectModal);
  elements.backupBtn.addEventListener('click', handleBackup);
  elements.restoreInput.addEventListener('change', handleRestore);
  elements.settingsBtn.addEventListener('click', openSettingsModal);
  elements.darkModeToggle.addEventListener('click', toggleTheme);

  models.subscribe(refreshData);
  settingsStore.subscribe(async (event) => {
    state.settings = event.detail;
    applyTheme();
    await updateAnalytics();
    updateTimerCard();
  });
  quotes.subscribe(({ detail }) => showQuote(detail));

  window.addEventListener('keydown', handleKeydown);

  await refreshData();
  await timer.init();
  timer.subscribe(({ detail }) => updateTimerState(detail));
  updateTimerState(timer.getState());
}

async function loadSounds() {
  state.sounds = await sounds.list();
}

function applyTheme() {
  const theme = localStorage.getItem('stay-hard-theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const current = localStorage.getItem('stay-hard-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('stay-hard-theme', next);
  applyTheme();
}

async function refreshData() {
  const [projects, tasks, subtasks, profile] = await Promise.all([
    models.listProjects(),
    models.listTasks(),
    models.listSubtasks(),
    models.getProfile(),
  ]);
  state.projects = projects;
  state.tasks = tasks.map((task) => ({
    ...task,
    awardSubtasksSeparately: task.awardSubtasksSeparately !== false,
    starred: Boolean(task.starred),
  }));
  state.subtasks = subtasks;
  state.profile = profile;
  state.starredTasks = tasks.filter((task) => task.starred).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  renderProjects();
  await updateAnalytics();
  renderTaskList();
  updateTimerCard();
  updateActiveDetails();
  updateHeaderStats();
}

async function updateAnalytics() {
  const today = formatDateInTimezone();
  state.todayStats = await analytics.totalsForDate(today);
  state.level = await analytics.levelProgress();
  state.history = await analytics.last30Days();
  state.breakdowns = await analytics.breakdowns();
  dashboard.render(elements.dashboard, {
    today: state.todayStats,
    level: state.level,
    history: state.history,
    breakdowns: state.breakdowns,
    profile: state.profile,
  });
}

function renderProjects() {
  elements.projectList.innerHTML = '';
  state.projects.forEach((project) => {
    const button = document.createElement('button');
    button.textContent = project.name;
    button.dataset.projectId = project.id;
    if (state.filter === `project:${project.id}`) {
      button.classList.add('active');
    }
    button.addEventListener('click', () => setFilter(`project:${project.id}`));
    elements.projectList.appendChild(button);
  });
}

function setFilter(filter) {
  state.filter = filter;
  renderTaskList();
  updateFilterUI();
}

function updateFilterUI() {
  if (state.filter === 'all') {
    elements.filterAll.classList.add('active');
  } else {
    elements.filterAll.classList.remove('active');
  }
  elements.filterList.querySelectorAll('button[data-filter]').forEach((button) => {
    if (button.dataset.filter === state.filter) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  elements.projectList.querySelectorAll('button').forEach((button) => {
    if (state.filter === `project:${button.dataset.projectId}`) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
}

function filteredTasks() {
  const today = formatDateInTimezone();
  return state.tasks.filter((task) => {
    if (state.search) {
      const projectName = state.projects.find((p) => p.id === task.projectId)?.name || '';
      const haystack = `${task.title} ${task.notes || ''} ${projectName}`.toLowerCase();
      if (!haystack.includes(state.search)) return false;
    }
    if (state.filter === 'today') {
      return task.due === today;
    }
    if (state.filter === 'overdue') {
      return task.status === 'open' && task.due && task.due < today;
    }
    if (state.filter.startsWith('project:')) {
      const id = state.filter.split(':')[1];
      return task.projectId === id;
    }
    return true;
  });
}

function renderTaskList() {
  const tasks = filteredTasks().sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  const entries = tasks.map((task) => ({
    task,
    project: state.projects.find((p) => p.id === task.projectId) || null,
    subtasks: state.subtasks.filter((sub) => sub.taskId === task.id),
  }));
  renderTasks(elements.taskList, entries, { active: state.activeItem });
  updateFilterUI();
}

function updateHeaderStats() {
  elements.statTodayPoints.textContent = `Today: ${state.todayStats.points} pts`;
  elements.statTodayMinutes.textContent = `Focus: ${state.todayStats.minutes} min`;
  elements.statStreak.textContent = `🔥 Streak: ${state.profile?.streakDays ?? 0} days`;
  elements.statLevel.textContent = `Level ${state.profile?.level ?? 0}`;
  elements.levelProgressBar.style.width = `${state.level.percent}%`;
}

function timerTargets() {
  const targets = [];
  state.tasks
    .filter((task) => task.status === 'open')
    .forEach((task) => {
      const project = state.projects.find((p) => p.id === task.projectId);
      const label = project ? `${project.name} — ${task.title}` : task.title;
      targets.push({ type: 'task', id: task.id, label });
      state.subtasks
        .filter((sub) => sub.taskId === task.id && sub.status === 'open')
        .forEach((sub) => targets.push({ type: 'subtask', id: sub.id, label: `↳ ${sub.title}` }));
    });
  return targets;
}

function updateTimerState(newState) {
  state.timerState = newState;
  const active = {
    type: newState.targetType,
    id: newState.targetId,
  };
  if (active.type !== state.activeItem.type || active.id !== state.activeItem.id) {
    state.activeItem = active;
    renderTaskList();
    updateActiveDetails();
  }
  updateTimerCard();
}

function updateTimerCard() {
  timerCard.updateState(state.timerState, {
    settings: state.settings,
    targets: timerTargets(),
  });
}

async function updateActiveDetails() {
  if (!state.activeItem.type || !state.activeItem.id) {
    activeDetails.render(elements.activeDetails, { item: null });
    return;
  }
  let item = null;
  let parent = null;
  if (state.activeItem.type === 'task') {
    item = state.tasks.find((task) => task.id === state.activeItem.id);
    parent = item;
  } else if (state.activeItem.type === 'subtask') {
    item = state.subtasks.find((sub) => sub.id === state.activeItem.id);
    parent = item ? state.tasks.find((task) => task.id === item.taskId) : null;
  }
  const sessions = await models.getSessionsForTarget(state.activeItem.type, state.activeItem.id);
  activeDetails.render(elements.activeDetails, {
    item,
    parent,
    type: state.activeItem.type,
    sessions,
    sounds: state.sounds,
  });
}

async function handleToggleTask(id, checked) {
  await models.setTaskStatus(id, checked ? 'done' : 'open');
  if (checked) {
    const result = await points.awardOnComplete('task', id);
    if (result.xpAwarded > 0) {
      toasts.showToast(`+${result.xpAwarded} XP`);
      result.badges.forEach((badge) => toasts.showToast(`Badge earned: ${badge}`));
      await quotes.maybeShowAfterCompletion();
      await playCompletionSound('task', id);
    }
  }
  await refreshData();
}

async function handleToggleSubtask(id, checked) {
  await models.setSubtaskStatus(id, checked ? 'done' : 'open');
  if (checked) {
    const result = await points.awardOnComplete('subtask', id);
    if (result.xpAwarded > 0) {
      toasts.showToast(`+${result.xpAwarded} XP`);
      result.badges.forEach((badge) => toasts.showToast(`Badge earned: ${badge}`));
      await quotes.maybeShowAfterCompletion();
      await playCompletionSound('subtask', id);
    }
  }
  await refreshData();
}

async function handleAddSubtask(taskId, title) {
  await models.createSubtask(taskId, { title });
  await refreshData();
}

async function handleDeleteTask(id) {
  modals.confirm({
    title: 'Delete task',
    body: 'Are you sure you want to delete this task and its subtasks?',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      await models.deleteTask(id);
      await refreshData();
    },
  });
}

async function handleDeleteSubtask(id) {
  modals.confirm({
    title: 'Delete subtask',
    body: 'Remove this subtask?',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      await models.deleteSubtask(id);
      await refreshData();
    },
  });
}

async function handleToggleAward(taskId, checked) {
  await models.updateTask(taskId, { awardSubtasksSeparately: checked });
  await refreshData();
}

async function handleToggleStar(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  await models.updateTask(taskId, { starred: !task.starred });
  await refreshData();
}

async function handleStartFocus(type, id) {
  if (type === 'task') {
    await timer.startFocus('task', id);
    await playStartSound('task', id);
  } else if (type === 'subtask') {
    await timer.startFocus('subtask', id);
    await playStartSound('subtask', id);
  }
}

async function handleTimerStart(type, id) {
  if (state.timerState.running && state.timerState.mode === 'focus') {
    await timer.switchTarget(type, id);
  } else {
    await timer.startFocus(type, id);
  }
  if (type !== 'none') {
    await playStartSound(type, id);
  }
}

async function handleTimerBreak() {
  await timer.startBreak();
}

async function handleTimerStop() {
  await timer.stop();
}

function handleTimerSelect(type, id) {
  if (type === 'none') {
    state.activeItem = { type: null, id: null };
    updateActiveDetails();
  }
}

async function handleAutoResume(value) {
  await settingsStore.save({ autoResume: value });
}

async function handleUpdateNotes(targetType, targetId, notes) {
  if (targetType === 'task') {
    await models.updateTask(targetId, { notes });
  } else if (targetType === 'subtask') {
    await models.updateSubtask(targetId, { notes });
  }
  await refreshData();
}

async function handleUpdateSound(targetType, targetId, kind, value) {
  if (targetType !== 'task') return;
  const updates = {};
  if (kind === 'start') updates.soundStartId = value;
  if (kind === 'complete') updates.soundCompleteId = value;
  await models.updateTask(targetId, updates);
  await refreshData();
}

async function playStartSound(targetType, id) {
  if (targetType === 'none') return;
  let soundId = null;
  if (targetType === 'task') {
    const task = state.tasks.find((t) => t.id === id);
    soundId = task?.soundStartId;
  } else if (targetType === 'subtask') {
    const sub = state.subtasks.find((s) => s.id === id);
    const task = sub ? state.tasks.find((t) => t.id === sub.taskId) : null;
    soundId = task?.soundStartId;
  }
  soundId = soundId || state.settings?.audio?.defaultStart;
  if (soundId) {
    sounds.ensureUnlocked();
    await sounds.play(soundId);
  }
}

async function playCompletionSound(targetType, id) {
  let soundId = null;
  if (targetType === 'task') {
    const task = state.tasks.find((t) => t.id === id);
    soundId = task?.soundCompleteId;
  } else if (targetType === 'subtask') {
    const sub = state.subtasks.find((s) => s.id === id);
    const task = sub ? state.tasks.find((t) => t.id === sub.taskId) : null;
    soundId = task?.soundCompleteId;
  }
  soundId = soundId || state.settings?.audio?.defaultComplete;
  if (soundId) {
    sounds.ensureUnlocked();
    await sounds.play(soundId);
  }
}

function showQuote(quote) {
  if (!quote) return;
  elements.quotesCard.classList.remove('hidden');
  elements.quotesCard.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'Accountability Mirror';
  const text = document.createElement('p');
  text.textContent = quote.text;
  const source = document.createElement('p');
  source.className = 'quote-source';
  source.textContent = quote.sourceNote || '';
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.className = 'secondary';
  dismiss.addEventListener('click', () => elements.quotesCard.classList.add('hidden'));
  elements.quotesCard.append(title, text, source, dismiss);
}

async function openNewTaskModal() {
  const projectOptions = state.projects.map((project) => ({ value: project.id, label: project.name }));
  if (!projectOptions.length) {
    toasts.showToast('Create a project first.');
    return;
  }
  modals.promptForm({
    title: 'New task',
    submitLabel: 'Create',
    fields: [
      { id: 'taskTitle', label: 'Title', required: true },
      { id: 'taskProject', label: 'Project', type: 'select', options: projectOptions, value: projectOptions[0].value },
      { id: 'taskDifficulty', label: 'Difficulty (1-5)', type: 'number', value: 3 },
      { id: 'taskDue', label: 'Due date', type: 'date' },
    ],
    onSubmit: async (data) => {
      await models.createTask(data.taskProject, {
        title: data.taskTitle,
        difficulty: Number(data.taskDifficulty),
        due: data.taskDue || null,
      });
      await refreshData();
    },
  });
}

function openProjectModal() {
  modals.promptForm({
    title: 'New project',
    submitLabel: 'Create',
    fields: [
      { id: 'projectName', label: 'Name', required: true },
      { id: 'projectColor', label: 'Color', type: 'color', value: '#4ade80' },
    ],
    onSubmit: async (data) => {
      await models.createProject(data.projectName, data.projectColor);
      await refreshData();
    },
  });
}

async function openSettingsModal() {
  await loadSounds();
  const form = document.createElement('form');
  form.className = 'settings-form';
  const fields = [
    { id: 'pomoMinutes', label: 'Focus minutes', value: state.settings.pomoMinutes },
    { id: 'shortBreakMinutes', label: 'Short break minutes', value: state.settings.shortBreakMinutes },
    { id: 'longBreakMinutes', label: 'Long break minutes', value: state.settings.longBreakMinutes },
    { id: 'longBreakEvery', label: 'Long break every (pomodoros)', value: state.settings.longBreakEvery },
    { id: 'quoteChance', label: 'Quote chance (0-1)', value: state.settings.quoteChance },
    { id: 'quoteCooldownMinutes', label: 'Quote cooldown (minutes)', value: state.settings.quoteCooldownMinutes },
  ];
  fields.forEach((field) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const label = document.createElement('label');
    label.textContent = field.label;
    label.setAttribute('for', field.id);
    const input = document.createElement('input');
    input.type = 'number';
    input.id = field.id;
    input.value = field.value;
    wrapper.append(label, input);
    form.appendChild(wrapper);
  });
  const timezoneWrapper = document.createElement('div');
  timezoneWrapper.className = 'form-field';
  timezoneWrapper.appendChild(Object.assign(document.createElement('label'), { textContent: 'Timezone', htmlFor: 'timezone' }));
  const timezoneInput = document.createElement('input');
  timezoneInput.id = 'timezone';
  timezoneInput.value = state.settings.timezone;
  timezoneWrapper.appendChild(timezoneInput);
  form.appendChild(timezoneWrapper);

  const startSoundWrapper = document.createElement('div');
  startSoundWrapper.className = 'form-field';
  const startLabel = document.createElement('label');
  startLabel.textContent = 'Default start sound';
  startLabel.setAttribute('for', 'defaultStartSound');
  const startSelect = document.createElement('select');
  startSelect.id = 'defaultStartSound';
  startSoundWrapper.append(startLabel, startSelect);
  form.appendChild(startSoundWrapper);

  const completeSoundWrapper = document.createElement('div');
  completeSoundWrapper.className = 'form-field';
  const completeLabel = document.createElement('label');
  completeLabel.textContent = 'Default completion sound';
  completeLabel.setAttribute('for', 'defaultCompleteSound');
  const completeSelect = document.createElement('select');
  completeSelect.id = 'defaultCompleteSound';
  completeSoundWrapper.append(completeLabel, completeSelect);
  form.appendChild(completeSoundWrapper);

  const uploadWrapper = document.createElement('div');
  uploadWrapper.className = 'form-field';
  const uploadLabel = document.createElement('label');
  uploadLabel.textContent = 'Upload sound (MP3/WAV)';
  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'audio/*';
  uploadInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await sounds.upload(file);
    await loadSounds();
    refreshSoundOptions();
    event.target.value = '';
  });
  uploadWrapper.append(uploadLabel, uploadInput);
  form.appendChild(uploadWrapper);

  const soundList = document.createElement('ul');
  soundList.className = 'sound-list';
  form.appendChild(soundList);

  function refreshSoundOptions() {
    const currentStart = startSelect.value || state.settings.audio?.defaultStart || '';
    const currentComplete = completeSelect.value || state.settings.audio?.defaultComplete || '';
    startSelect.innerHTML = '';
    completeSelect.innerHTML = '';
    startSelect.appendChild(new Option('None', '', currentStart === ''));
    completeSelect.appendChild(new Option('None', '', currentComplete === ''));
    state.sounds.forEach((sound) => {
      startSelect.appendChild(new Option(sound.name, sound.id, false, sound.id === currentStart));
      completeSelect.appendChild(new Option(sound.name, sound.id, false, sound.id === currentComplete));
    });
    soundList.innerHTML = '';
    if (!state.sounds.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No custom sounds uploaded yet.';
      soundList.appendChild(empty);
    } else {
      state.sounds.forEach((sound) => {
        const item = document.createElement('li');
        item.textContent = sound.name;
        const remove = document.createElement('button');
        remove.textContent = 'Remove';
        remove.className = 'secondary';
        remove.addEventListener('click', async () => {
          await sounds.remove(sound.id);
          await loadSounds();
          refreshSoundOptions();
        });
        item.appendChild(remove);
        soundList.appendChild(item);
      });
    }
  }

  refreshSoundOptions();

  modals.showModal({
    title: 'Settings',
    content: form,
    actions: [
      { label: 'Cancel', variant: 'secondary', onClick: () => {} },
      {
        label: 'Save',
        onClick: async () => {
          const next = {
            pomoMinutes: Number(form.querySelector('#pomoMinutes').value),
            shortBreakMinutes: Number(form.querySelector('#shortBreakMinutes').value),
            longBreakMinutes: Number(form.querySelector('#longBreakMinutes').value),
            longBreakEvery: Number(form.querySelector('#longBreakEvery').value),
            quoteChance: Number(form.querySelector('#quoteChance').value),
            quoteCooldownMinutes: Number(form.querySelector('#quoteCooldownMinutes').value),
            timezone: timezoneInput.value,
            audio: {
              defaultStart: startSelect.value || null,
              defaultComplete: completeSelect.value || null,
            },
          };
          await settingsStore.save(next);
          await refreshData();
        },
      },
    ],
  });
}

async function handleBackup() {
  const data = await backup.exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stay-hard-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleRestore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const json = JSON.parse(text);
  await backup.importBackup(json);
  await loadSounds();
  await refreshData();
  event.target.value = '';
}

function handleKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    openNewTaskModal();
  } else if (event.key === 's' || event.key === 'S') {
    event.preventDefault();
    if (state.timerState.running && state.timerState.mode === 'focus') {
      timer.stop();
    } else {
      const primary = state.starredTasks[0];
      if (primary) {
        handleStartFocus('task', primary.id);
      }
    }
  } else if (event.key === 'b' || event.key === 'B') {
    event.preventDefault();
    handleTimerBreak();
  } else if (event.key === '/') {
    event.preventDefault();
    elements.searchInput.focus();
  } else if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const task = state.starredTasks[index];
    if (task) {
      event.preventDefault();
      handleStartFocus('task', task.id);
    }
  }
}

init().catch((err) => {
  console.error(err);
  toasts.showToast('Failed to start app');
});

