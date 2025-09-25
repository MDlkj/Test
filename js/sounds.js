import * as db from './db.js';

const emitter = new EventTarget();
let audioUnlocked = false;
let cache = new Map();

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'snd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function ensureUnlocked() {
  if (audioUnlocked) return;
  const audio = new Audio();
  audio.play().catch(() => {
    // expected failure, but gesture unlock triggered
  });
  audioUnlocked = true;
}

export async function list() {
  await db.open();
  const sounds = await db.list('sounds');
  return sounds.map(({ id, name, mime }) => ({ id, name, mime }));
}

export async function get(id) {
  await db.open();
  return db.get('sounds', id);
}

export async function upload(file) {
  await db.open();
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });
  const record = {
    id: uuid(),
    name: file.name,
    mime: file.type,
    blob,
  };
  await db.put('sounds', record);
  emitter.dispatchEvent(new CustomEvent('change'));
  return { id: record.id, name: record.name, mime: record.mime };
}

export async function remove(id) {
  await db.del('sounds', id);
  cache.delete(id);
  emitter.dispatchEvent(new CustomEvent('change'));
}

export function subscribe(handler) {
  emitter.addEventListener('change', handler);
  return () => emitter.removeEventListener('change', handler);
}

export async function play(id) {
  if (!id) return;
  ensureUnlocked();
  let record = cache.get(id);
  if (!record) {
    record = await get(id);
    if (!record) return;
    cache.set(id, record);
  }
  const url = URL.createObjectURL(record.blob);
  const audio = new Audio(url);
  audio.play().finally(() => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

