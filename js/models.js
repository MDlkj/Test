import * as db from './db.js';
import { load as loadSettings } from './settings.js';

const emitter = new EventTarget();
const PROFILE_ID = 'profile';

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function subscribe(handler) {
  emitter.addEventListener('change', handler);
  return () => emitter.removeEventListener('change', handler);
}

async function ensureProfile() {
  const profile = await db.get('profile', PROFILE_ID);
  if (profile) return profile;
  const fresh = {
    id: PROFILE_ID,
    xpTotal: 0,
    streakDays: 0,
    lastActiveDate: null,
    level: 0,
    badges: [],
  };
  await db.put('profile', fresh);
  return fresh;
}

async function ensureSettings() {
  await loadSettings();
}

async function seedQuotes() {
  const existing = await db.list('quotes');
  if (existing.length > 0) return;
  const defaults = [
    {
      id: uuid(),
      text: 'You don\'t rise to the occasion; you fall to your standards.',
      sourceNote: 'Add your own source',
    },
    {
      id: uuid(),
      text: 'Discomfort is a training ground.',
      sourceNote: 'Add your own source',
    },
    {
      id: uuid(),
      text: 'One more rep. One more page.',
      sourceNote: 'Add your own source',
    },
  ];
  await db.bulkPut('quotes', defaults);
}

async function seedProjectsAndTasks() {
  const projects = await db.list('projects');
  if (projects.length > 0) return;
  const fitnessId = uuid();
  const workId = uuid();
  const fitnessTaskId = uuid();
  const workTaskId = uuid();
  const fitnessSub1 = uuid();
  const fitnessSub2 = uuid();
  const workSub1 = uuid();

  await db.bulkPut('projects', [
    { id: fitnessId, name: 'Fitness', color: '#2dd4bf' },
    { id: workId, name: 'Deep Work', color: '#a855f7' },
  ]);

  await db.bulkPut('tasks', [
    {
      id: fitnessTaskId,
      projectId: fitnessId,
      title: 'Morning Ruck',
      notes: 'Weighted ruck around the park.',
      difficulty: 3,
      due: new Date().toISOString().slice(0, 10),
      status: 'open',
      awardSubtasksSeparately: true,
      soundStartId: null,
      soundCompleteId: null,
      subtaskIds: [fitnessSub1, fitnessSub2],
      createdAt: Date.now(),
      starred: false,
    },
    {
      id: workTaskId,
      projectId: workId,
      title: 'Deep Work Session',
      notes: 'Focus block on priority problem.',
      difficulty: 4,
      due: null,
      status: 'open',
      awardSubtasksSeparately: false,
      soundStartId: null,
      soundCompleteId: null,
      subtaskIds: [workSub1],
      createdAt: Date.now(),
      starred: false,
    },
  ]);

  await db.bulkPut('subtasks', [
    { id: fitnessSub1, taskId: fitnessTaskId, title: 'Warm-up mobility', notes: '', difficulty: 2, status: 'open' },
    { id: fitnessSub2, taskId: fitnessTaskId, title: '5km ruck', notes: '', difficulty: 4, status: 'open' },
    { id: workSub1, taskId: workTaskId, title: 'Outline research plan', notes: '', difficulty: 3, status: 'open' },
  ]);
}

export async function bootstrap() {
  await db.open();
  await ensureSettings();
  await ensureProfile();
  await seedQuotes();
  await seedProjectsAndTasks();
}

async function notify(store, payload) {
  emitter.dispatchEvent(new CustomEvent('change', { detail: { store, payload } }));
}

export async function listProjects() {
  await bootstrap();
  return db.list('projects');
}

export async function getProject(id) {
  return db.get('projects', id);
}

export async function createProject(name, color) {
  const project = { id: uuid(), name, color };
  await db.put('projects', project);
  await notify('projects', { type: 'create', project });
  return project;
}

export async function updateProject(id, updates) {
  const project = await getProject(id);
  if (!project) throw new Error('Project not found');
  Object.assign(project, updates);
  await db.put('projects', project);
  await notify('projects', { type: 'update', project });
  return project;
}

export async function deleteProject(id) {
  const tasks = await listTasksByProject(id);
  for (const task of tasks) {
    await deleteTask(task.id);
  }
  await db.del('projects', id);
  await notify('projects', { type: 'delete', id });
}

export async function listTasks(filter = {}) {
  await bootstrap();
  const tasks = await db.list('tasks');
  if (!filter || Object.keys(filter).length === 0) return tasks;
  return tasks.filter((task) => {
    if (filter.projectId && task.projectId !== filter.projectId) return false;
    if (filter.status && task.status !== filter.status) return false;
    return true;
  });
}

export async function listTasksByProject(projectId) {
  return listTasks({ projectId });
}

export async function getTask(id) {
  return db.get('tasks', id);
}

export async function createTask(projectId, data) {
  const id = uuid();
  const task = {
    id,
    projectId,
    title: data.title ?? 'Untitled Task',
    notes: data.notes ?? '',
    difficulty: clampDifficulty(data.difficulty ?? 3),
    due: data.due ?? null,
    status: data.status ?? 'open',
    awardSubtasksSeparately: data.awardSubtasksSeparately ?? true,
    soundStartId: data.soundStartId ?? null,
    soundCompleteId: data.soundCompleteId ?? null,
    subtaskIds: data.subtaskIds ?? [],
    createdAt: Date.now(),
    starred: data.starred ?? false,
  };
  await db.put('tasks', task);
  await notify('tasks', { type: 'create', task });
  return task;
}

function clampDifficulty(value) {
  const n = Number(value) || 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function updateTask(id, updates) {
  const task = await getTask(id);
  if (!task) throw new Error('Task not found');
  const next = { ...task, ...updates };
  next.difficulty = clampDifficulty(next.difficulty);
  if (!Array.isArray(next.subtaskIds)) next.subtaskIds = [];
  next.starred = Boolean(next.starred);
  await db.put('tasks', next);
  await notify('tasks', { type: 'update', task: next });
  return next;
}

export async function setTaskStatus(id, status) {
  const task = await getTask(id);
  if (!task) return null;
  task.status = status;
  if (status === 'open') {
    // reopen subtasks
    const subtasks = await listSubtasks(id);
    for (const sub of subtasks) {
      if (sub.status === 'done') {
        sub.status = 'open';
        await db.put('subtasks', sub);
      }
    }
  }
  await db.put('tasks', task);
  await notify('tasks', { type: 'status', id, status });
  return task;
}

export async function deleteTask(id) {
  const task = await getTask(id);
  if (!task) return;
  const subtasks = await listSubtasks(id);
  for (const sub of subtasks) {
    await deleteSubtask(sub.id, { silent: true });
  }
  await db.del('tasks', id);
  await notify('tasks', { type: 'delete', id });
}

export async function listSubtasks(taskId) {
  await bootstrap();
  const all = await db.list('subtasks');
  if (!taskId) return all;
  return all.filter((sub) => sub.taskId === taskId);
}

export async function getSubtask(id) {
  return db.get('subtasks', id);
}

export async function createSubtask(taskId, data) {
  const id = uuid();
  const subtask = {
    id,
    taskId,
    title: data.title ?? 'Subtask',
    notes: data.notes ?? '',
    difficulty: clampDifficulty(data.difficulty ?? 2),
    status: data.status ?? 'open',
  };
  await db.put('subtasks', subtask);
  const task = await getTask(taskId);
  if (task) {
    const ids = Array.isArray(task.subtaskIds) ? task.subtaskIds : [];
    if (!ids.includes(id)) ids.push(id);
    await db.put('tasks', { ...task, subtaskIds: ids });
  }
  await notify('subtasks', { type: 'create', subtask });
  await notify('tasks', { type: 'update-subtasks', taskId });
  return subtask;
}

export async function updateSubtask(id, updates) {
  const subtask = await getSubtask(id);
  if (!subtask) throw new Error('Subtask not found');
  const next = { ...subtask, ...updates };
  next.difficulty = clampDifficulty(next.difficulty);
  await db.put('subtasks', next);
  await notify('subtasks', { type: 'update', subtask: next });
  return next;
}

export async function setSubtaskStatus(id, status) {
  const subtask = await getSubtask(id);
  if (!subtask) return null;
  subtask.status = status;
  await db.put('subtasks', subtask);
  await notify('subtasks', { type: 'status', id, status });
  return subtask;
}

export async function deleteSubtask(id, options = {}) {
  const subtask = await getSubtask(id);
  if (!subtask) return;
  await db.del('subtasks', id);
  const task = await getTask(subtask.taskId);
  if (task) {
    const ids = (task.subtaskIds || []).filter((sid) => sid !== id);
    await db.put('tasks', { ...task, subtaskIds: ids });
  }
  if (!options.silent) {
    await notify('subtasks', { type: 'delete', id });
    await notify('tasks', { type: 'update-subtasks', taskId: subtask.taskId });
  }
}

export async function listSessions() {
  await bootstrap();
  return db.list('sessions');
}

export async function getSessionsForTarget(targetType, targetId) {
  const sessions = await listSessions();
  return sessions.filter((s) => s.targetType === targetType && s.targetId === targetId);
}

export async function createSession(session) {
  const record = { ...session, id: session.id ?? uuid() };
  await db.put('sessions', record);
  await notify('sessions', { type: 'create', session: record });
  return record;
}

export async function closeSession(id, endTs) {
  const session = await db.get('sessions', id);
  if (!session) return null;
  session.end = endTs;
  await db.put('sessions', session);
  await notify('sessions', { type: 'update', session });
  return session;
}

export async function listPoints() {
  await bootstrap();
  return db.list('points');
}

export async function addPoints(record) {
  const entry = { ...record, id: record.id ?? uuid() };
  await db.put('points', entry);
  await notify('points', { type: 'create', points: entry });
  return entry;
}

export async function listQuotes() {
  await bootstrap();
  return db.list('quotes');
}

export async function updateQuote(id, updates) {
  const quote = await db.get('quotes', id);
  if (!quote) throw new Error('Quote not found');
  const next = { ...quote, ...updates };
  await db.put('quotes', next);
  await notify('quotes', { type: 'update', quote: next });
  return next;
}

export async function createQuote(data) {
  const quote = { id: uuid(), text: data.text, sourceNote: data.sourceNote ?? '' };
  await db.put('quotes', quote);
  await notify('quotes', { type: 'create', quote });
  return quote;
}

export async function deleteQuote(id) {
  await db.del('quotes', id);
  await notify('quotes', { type: 'delete', id });
}

export async function getProfile() {
  await bootstrap();
  return db.get('profile', PROFILE_ID);
}

export async function updateProfile(updates) {
  const profile = await getProfile();
  const next = { ...profile, ...updates };
  await db.put('profile', next);
  await notify('profile', { type: 'update', profile: next });
  return next;
}

export async function clearAllStores() {
  const stores = ['projects', 'tasks', 'subtasks', 'sessions', 'points', 'profile', 'settings', 'sounds', 'quotes'];
  for (const store of stores) {
    await db.clear(store);
  }
  emitter.dispatchEvent(new CustomEvent('reset'));
}

