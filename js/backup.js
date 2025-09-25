import * as db from './db.js';
import * as models from './models.js';

const VERSION = 1;

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Unable to read sound data'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function exportBackup() {
  await db.open();
  const stores = ['projects', 'tasks', 'subtasks', 'sessions', 'points', 'profile', 'settings', 'quotes'];
  const payload = {};
  for (const store of stores) {
    payload[store] = await db.list(store);
  }
  const sounds = await db.list('sounds');
  payload.sounds = [];
  for (const sound of sounds) {
    const base64 = await blobToBase64(sound.blob);
    payload.sounds.push({ id: sound.id, name: sound.name, mime: sound.mime, data: base64 });
  }
  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    data: payload,
  };
}

export async function importBackup(json) {
  if (!json || json.version !== VERSION) {
    throw new Error('Unsupported backup version');
  }
  const data = json.data || {};
  await models.clearAllStores();
  await db.open();
  const stores = ['projects', 'tasks', 'subtasks', 'sessions', 'points', 'profile', 'settings', 'quotes'];
  for (const store of stores) {
    const records = data[store] || [];
    await db.bulkPut(store, records);
  }
  const sounds = data.sounds || [];
  for (const sound of sounds) {
    const blob = base64ToBlob(sound.data, sound.mime);
    await db.put('sounds', { id: sound.id, name: sound.name, mime: sound.mime, blob });
  }
}

