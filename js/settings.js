import * as db from './db.js';

const SETTINGS_ID = 'settings';
const emitter = new EventTarget();

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULTS = {
  pomoMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  quoteChance: 0.2,
  quoteCooldownMinutes: 15,
  timezone: 'Europe/London',
  audio: { defaultStart: null, defaultComplete: null },
  autoResume: true,
};

let cache = null;

export async function load() {
  if (cache) return cache;
  await db.open();
  const stored = await db.get('settings', SETTINGS_ID);
  if (stored) {
    cache = normalize(stored);
  } else {
    cache = { id: SETTINGS_ID, ...deepClone(DEFAULTS) };
    await db.put('settings', cache);
  }
  return cache;
}

function normalize(data) {
  const merged = { ...deepClone(DEFAULTS), ...data };
  if (!merged.audio) merged.audio = { ...DEFAULTS.audio };
  if (merged.audio && typeof merged.audio !== 'object') {
    merged.audio = { ...DEFAULTS.audio };
  } else {
    merged.audio = { ...DEFAULTS.audio, ...merged.audio };
  }
  merged.id = SETTINGS_ID;
  if (typeof merged.autoResume !== 'boolean') merged.autoResume = true;
  return merged;
}

export async function save(partial) {
  const current = await load();
  const next = normalize({ ...current, ...partial });
  cache = next;
  await db.put('settings', next);
  emitter.dispatchEvent(new CustomEvent('change', { detail: next }));
  return next;
}

export function subscribe(handler) {
  emitter.addEventListener('change', handler);
  return () => emitter.removeEventListener('change', handler);
}
