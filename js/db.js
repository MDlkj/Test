const DB_NAME = 'stay-hard-db';
const DB_VERSION = 1;

let dbPromise = null;

function ensureDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('by_name', 'name', { unique: false });

          const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
          tasks.createIndex('by_project', 'projectId', { unique: false });
          tasks.createIndex('by_status', 'status', { unique: false });
          tasks.createIndex('by_due', 'due', { unique: false });

          const subtasks = db.createObjectStore('subtasks', { keyPath: 'id' });
          subtasks.createIndex('by_task', 'taskId', { unique: false });

          const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('by_target', ['targetType', 'targetId'], { unique: false });
          sessions.createIndex('by_end', 'end', { unique: false });
          sessions.createIndex('by_start', 'start', { unique: false });

          const points = db.createObjectStore('points', { keyPath: 'id' });
          points.createIndex('by_date', 'date', { unique: false });

          db.createObjectStore('profile', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'id' });
          db.createObjectStore('sounds', { keyPath: 'id' });
          db.createObjectStore('quotes', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let requestResult;
    let request;
    tx.oncomplete = () => resolve(requestResult);
    tx.onerror = () => reject(tx.error);
    try {
      const value = fn(store, tx);
      if (value && typeof value === 'object' && 'onsuccess' in value) {
        request = value;
        request.onsuccess = () => {
          requestResult = request.result;
        };
        request.onerror = () => reject(request.error);
      } else {
        requestResult = value;
      }
    } catch (err) {
      tx.abort();
      reject(err);
    }
  });
}

export async function open() {
  return ensureDB();
}

export async function get(store, id) {
  return withStore(store, 'readonly', (objectStore) => objectStore.get(id));
}

export async function put(store, value) {
  return withStore(store, 'readwrite', (objectStore) => objectStore.put(value));
}

export async function del(store, id) {
  return withStore(store, 'readwrite', (objectStore) => objectStore.delete(id));
}

export async function list(store, indexName, query) {
  return withStore(store, 'readonly', (objectStore) => {
    if (indexName) {
      const index = objectStore.index(indexName);
      return index.getAll(query);
    }
    return objectStore.getAll();
  });
}

export async function clear(store) {
  return withStore(store, 'readwrite', (objectStore) => objectStore.clear());
}

export async function bulkPut(store, values) {
  return withStore(store, 'readwrite', (objectStore) => {
    for (const value of values) {
      objectStore.put(value);
    }
  });
}

export async function iterate(store, indexName, query, callback) {
  return withStore(store, 'readonly', (objectStore) => {
    const source = indexName ? objectStore.index(indexName) : objectStore;
    source.openCursor(query).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        callback(cursor.value);
        cursor.continue();
      }
    };
  });
}

export async function deleteDatabase() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
