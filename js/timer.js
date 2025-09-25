import * as models from './models.js';
import { load as loadSettings } from './settings.js';

const emitter = new EventTarget();

const state = {
  running: false,
  mode: 'focus',
  startTs: null,
  targetType: null,
  targetId: null,
  pomo: 0,
  plannedDurationMs: 0,
  sessionId: null,
  mirrorSessionId: null,
  resumeTarget: null,
  breakType: 'short',
};

let tickInterval = null;
let initialized = false;

function emit() {
  emitter.dispatchEvent(new CustomEvent('tick', { detail: { ...state } }));
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (!state.running) return;
    emit();
    handleAutoTransitions();
  }, 250);
}

export function subscribe(handler) {
  emitter.addEventListener('tick', handler);
  return () => emitter.removeEventListener('tick', handler);
}

export function getState() {
  return { ...state };
}

function elapsedMs(now = Date.now()) {
  if (!state.startTs) return 0;
  return Math.max(0, now - state.startTs);
}

function plannedRemainingMs() {
  return Math.max(0, state.plannedDurationMs - elapsedMs());
}

async function handleAutoTransitions() {
  if (!state.running) return;
  const settings = await loadSettings();
  const remaining = plannedRemainingMs();
  if (remaining > 0) return;
  if (state.mode === 'focus') {
    await startBreak();
  } else if (state.mode === 'break') {
    const resume = state.resumeTarget;
    const shouldReset = state.breakType === 'long';
    await stop();
    if (resume && settings.autoResume) {
      if (shouldReset) state.pomo = 0;
      await startFocus(resume.targetType, resume.targetId);
    }
  }
}

async function loadOpenSession() {
  const sessions = await models.listSessions();
  const open = sessions.filter((s) => !s.end).sort((a, b) => b.start - a.start)[0];
  if (!open) return;
  const settings = await loadSettings();
  state.running = true;
  state.mode = open.type;
  state.startTs = open.start;
  state.plannedDurationMs = open.plannedDurationMs ?? (open.type === 'focus' ? settings.pomoMinutes * 60000 : settings.shortBreakMinutes * 60000);
  state.sessionId = open.id;
  state.targetType = open.targetType ?? null;
  state.targetId = open.targetId ?? null;
  state.pomo = open.pomo ?? state.pomo;
  state.breakType = open.type === 'break' ? (open.breakType ?? 'short') : 'short';
  if (open.type === 'focus') {
    if (state.targetType === 'none') {
      state.resumeTarget = null;
    } else {
      state.resumeTarget = { targetType: state.targetType, targetId: state.targetId };
    }
    const mirror = sessions.find((s) => s.mirrorOf === open.id && !s.end);
    if (mirror) state.mirrorSessionId = mirror.id;
  } else {
    state.resumeTarget = open.resumeTarget ?? null;
  }
  ensureTicker();
  emit();
}

export async function init() {
  if (initialized) return;
  initialized = true;
  await models.bootstrap();
  await loadOpenSession();
}

async function createFocusSessions(targetType, targetId, startTs, plannedDuration, preservePomo = false) {
  const settings = await loadSettings();
  if (!preservePomo) {
    const step = settings.longBreakEvery || 4;
    if (state.pomo >= step) {
      state.pomo = 1;
    } else {
      state.pomo = state.pomo + 1;
      if (state.pomo === 0) state.pomo = 1;
    }
    if (state.pomo <= 0) state.pomo = 1;
  }
  state.running = true;
  state.mode = 'focus';
  state.startTs = startTs;
  state.targetType = targetType;
  state.targetId = targetId;
  state.plannedDurationMs = plannedDuration ?? settings.pomoMinutes * 60000;
  state.breakType = 'short';
  state.resumeTarget = targetType === 'none' ? null : { targetType, targetId };

  const session = await models.createSession({
    targetType,
    targetId,
    start: startTs,
    end: null,
    type: 'focus',
    pomo: state.pomo,
    plannedDurationMs: state.plannedDurationMs,
  });
  state.sessionId = session.id;
  state.mirrorSessionId = null;
  if (targetType === 'subtask') {
    const sub = await models.getSubtask(targetId);
    if (sub) {
      const mirror = await models.createSession({
        targetType: 'task',
        targetId: sub.taskId,
        start: startTs,
        end: null,
        type: 'focus',
        pomo: state.pomo,
        plannedDurationMs: state.plannedDurationMs,
        mirrorOf: session.id,
      });
      state.mirrorSessionId = mirror.id;
    }
  }
  ensureTicker();
  emit();
}

async function closeCurrentSessions(endTs) {
  if (state.sessionId) {
    await models.closeSession(state.sessionId, endTs);
  }
  if (state.mirrorSessionId) {
    await models.closeSession(state.mirrorSessionId, endTs);
    state.mirrorSessionId = null;
  }
}

export async function startFocus(targetType, targetId) {
  if (!targetType) {
    throw new Error('Target required to start focus');
  }
  if (targetType !== 'none' && !targetId) {
    throw new Error('Target requires id');
  }
  const now = Date.now();
  if (state.running && state.mode === 'focus') {
    if (state.targetType === targetType && state.targetId === targetId) {
      return getState();
    }
    await switchTarget(targetType, targetId);
    return getState();
  }
  if (state.running) {
    await stop();
  }
  const settings = await loadSettings();
  await createFocusSessions(targetType, targetId, now, settings.pomoMinutes * 60000, false);
  return getState();
}

export async function switchTarget(targetType, targetId) {
  if (!state.running || state.mode !== 'focus') {
    return getState();
  }
  if (!targetType) return getState();
  if (state.targetType === targetType && state.targetId === targetId) {
    return getState();
  }
  const now = Date.now();
  await closeCurrentSessions(now);
  const settings = await loadSettings();
  await createFocusSessions(targetType, targetId, now, settings.pomoMinutes * 60000, true);
  emit();
  return getState();
}

export async function startBreak() {
  const settings = await loadSettings();
  const now = Date.now();
  if (state.mode === 'focus' && state.sessionId) {
    await closeCurrentSessions(now);
  }
  const isLong = state.pomo > 0 && state.pomo % settings.longBreakEvery === 0;
  state.running = true;
  state.mode = 'break';
  state.startTs = now;
  state.plannedDurationMs = (isLong ? settings.longBreakMinutes : settings.shortBreakMinutes) * 60000;
  state.breakType = isLong ? 'long' : 'short';
  const resume = state.resumeTarget;
  const session = await models.createSession({
    targetType: null,
    targetId: null,
    start: now,
    end: null,
    type: 'break',
    pomo: state.pomo,
    plannedDurationMs: state.plannedDurationMs,
    breakType: state.breakType,
    resumeTarget: resume,
  });
  state.sessionId = session.id;
  state.mirrorSessionId = null;
  ensureTicker();
  emit();
  return getState();
}

export async function stop() {
  if (!state.running) return getState();
  const now = Date.now();
  await closeCurrentSessions(now);
  state.running = false;
  state.startTs = null;
  state.sessionId = null;
  state.plannedDurationMs = 0;
  if (state.mode === 'break' && state.breakType === 'long') {
    state.pomo = 0;
  }
  state.mode = 'focus';
  emit();
  return getState();
}

export function elapsed() {
  return elapsedMs();
}

export function remaining() {
  return plannedRemainingMs();
}

