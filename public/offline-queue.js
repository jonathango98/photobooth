// IndexedDB-backed queue for sessions that fail to upload while offline.
const DB_NAME = "photoboothOffline";
const STORE   = "pendingSessions";
const VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

function idbAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(store, record) {
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

window.OfflineQueue = {
  async enqueueSession({ sessionId, eventId, rawBlobs, collageBlob }) {
    const store = await tx("readwrite");
    await idbPut(store, { sessionId, eventId, rawBlobs, collageBlob, createdAt: Date.now() });
    console.log("[OfflineQueue] queued session", sessionId);
  },

  async getQueueDepth() {
    const store = await tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  async peekQueue() {
    const store = await tx("readonly");
    return idbAll(store);
  },

  async drainQueue(serverUrl) {
    const depth = await this.getQueueDepth();
    if (depth === 0) return;

    // Ping health endpoint first
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const hRes = await fetch(`${serverUrl}/health`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!hRes.ok) return;
    } catch {
      return; // server unreachable
    }

    const store = await tx("readonly");
    const sessions = await idbAll(store);
    console.log(`[OfflineQueue] draining ${sessions.length} session(s)`);

    for (const session of sessions) {
      try {
        const formData = new FormData();
        formData.append("sessionId", session.sessionId);
        if (session.eventId) formData.append("eventId", session.eventId);

        (session.rawBlobs || []).forEach((blob, i) => {
          if (blob) formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
        });
        if (session.collageBlob) formData.append("collage", session.collageBlob, "collage.jpg");

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 30000);
        const res = await fetch(`${serverUrl}/api/save`, { method: "POST", body: formData, signal: ctrl.signal });
        clearTimeout(tid);

        if (res.ok) {
          const wStore = await tx("readwrite");
          await idbDelete(wStore, session.sessionId);
          console.log("[OfflineQueue] uploaded and removed", session.sessionId);
        }
      } catch (err) {
        console.warn("[OfflineQueue] failed to upload", session.sessionId, err);
      }
    }
  },
};
