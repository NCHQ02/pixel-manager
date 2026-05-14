import "./contracts.js";
import { getEvidenceSourceForEvent } from "./tracking-catalog.js";

export const DB_NAME = "omnisignal-audit-db";
export const DB_VERSION = 1;
export const STORE_EVENTS = "events";
export const STORE_AUDIT_RUNS = "auditRuns";
export const LEGACY_MIGRATION_MARKER = "indexedDbMigrationV1Complete";

const LEGACY_KEYS = ["trackedEvents", "auditRuns"];

function byNewest(a, b) {
  return (b.timestamp || 0) - (a.timestamp || 0);
}

function groupEventsByTab(events) {
  return events.reduce((map, event) => {
    const tabId = event.tabId || "unknown";
    if (!map[tabId]) map[tabId] = [];
    map[tabId].push(event);
    return map;
  }, {});
}

function normalizeEvent(event) {
  const normalized = {
    issues: [],
    duplicateCount: 0,
    isDiagnostic: false,
    status: "valid",
    source: "network",
    parserSchemaVersion: 1,
    confidence: "medium",
    diagnostics: {},
    sourceParser: "",
    ...event,
    tabId: String(event.tabId ?? "unknown"),
    timestamp: Number(event.timestamp || Date.now()),
  };
  return {
    ...normalized,
    evidenceSource: getEvidenceSourceForEvent(normalized),
  };
}

function findDuplicateTarget(tabEvents, match) {
  const baseCandidates = tabEvents.filter(
    (event) =>
      event.platform === match.platform &&
      event.pixelId === match.pixelId &&
      event.eventName === match.eventName,
  );
  const methodCandidates = baseCandidates.filter(
    (event) => event.method === match.method,
  );
  const hasServerStyleDedupeKey =
    !!match.dedupeKey && match.dedupeKey !== match.payloadHash;

  const hasExactKey = !!(match.dedupeKey || match.payloadHash);
  if (!hasExactKey) return methodCandidates[0] || null;

  const candidates = hasServerStyleDedupeKey
    ? baseCandidates
    : methodCandidates;
  const exact = candidates.find(
    (event) =>
      (match.dedupeKey && event.dedupeKey === match.dedupeKey) ||
      (match.payloadHash && event.payloadHash === match.payloadHash),
  );
  if (exact) return exact;

  return candidates.every((event) => !event.dedupeKey && !event.payloadHash)
    ? candidates[0] || null
    : null;
}

function storageGet(storageArea, keys) {
  return new Promise((resolve) => {
    storageArea.get(keys, (res) => resolve(res || {}));
  });
}

function storageSet(storageArea, value) {
  return new Promise((resolve) => {
    storageArea.set(value, () => resolve());
  });
}

function storageRemove(storageArea, keys) {
  return new Promise((resolve) => {
    storageArea.remove(keys, () => resolve());
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

function allFromIndex(store, indexName, query) {
  const index = store.index(indexName);
  if (typeof index.getAll === "function") {
    return requestToPromise(index.getAll(query));
  }

  return new Promise((resolve, reject) => {
    const items = [];
    const request = index.openCursor(query);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(items);
        return;
      }
      items.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {"readonly"|"readwrite"} mode
 */
function txStore(db, storeName, mode = "readonly") {
  const tx = db.transaction(storeName, mode);
  return { tx, store: tx.objectStore(storeName) };
}

/**
 * @param {IDBFactory} idb
 * @returns {import("./contracts.js").EventRepository}
 */
export function createIndexedDbEventRepository(idb = globalThis.indexedDB) {
  let dbPromise = null;

  async function init() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!idb) {
          reject(new Error("IndexedDB is not available in this context."));
          return;
        }
        const request = idb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            const events = db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
            events.createIndex("auditRunId", "auditRunId", { unique: false });
            events.createIndex("tabId", "tabId", { unique: false });
            events.createIndex("timestamp", "timestamp", { unique: false });
            events.createIndex("platform", "platform", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_AUDIT_RUNS)) {
            db.createObjectStore(STORE_AUDIT_RUNS, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    await dbPromise;
  }

  async function getDb() {
    await init();
    return dbPromise;
  }

  async function getAllEvents() {
    const db = await getDb();
    const { store } = txStore(db, STORE_EVENTS);
    const events = await requestToPromise(store.getAll());
    return events.sort(byNewest);
  }

  async function getEventsByTab(tabId) {
    const db = await getDb();
    const { store } = txStore(db, STORE_EVENTS);
    const events = await allFromIndex(store, "tabId", String(tabId));
    return events.sort(byNewest);
  }

  async function pruneTab(tabId, maxEvents) {
    if (!maxEvents) return;
    const events = await getEventsByTab(tabId);
    const stale = events.slice(maxEvents);
    if (stale.length === 0) return;

    const db = await getDb();
    const { tx, store } = txStore(db, STORE_EVENTS, "readwrite");
    stale.forEach((event) => store.delete(event.id));
    await transactionDone(tx);
  }

  async function addEvent(event, options = {}) {
    await addEvents([event], options);
  }

  async function addEvents(events, options = {}) {
    const normalizedEvents = (Array.isArray(events) ? events : [])
      .filter(Boolean)
      .map(normalizeEvent);
    if (normalizedEvents.length === 0) return;

    const db = await getDb();
    const { tx, store } = txStore(db, STORE_EVENTS, "readwrite");
    normalizedEvents.forEach((event) => store.put(event));
    await transactionDone(tx);
    await Promise.all(
      [...new Set(normalizedEvents.map((event) => event.tabId))].map((tabId) =>
        pruneTab(tabId, options.maxEvents),
      ),
    );
  }

  async function incrementDuplicateEvent(match, eventData = {}) {
    const tabEvents = await getEventsByTab(String(match.tabId || ""));
    const target = findDuplicateTarget(tabEvents, match);

    if (!target) return null;
    const updated = {
      ...target,
      status: "duplicate",
      duplicateCount: (target.duplicateCount || 0) + 1,
      eventData: {
        ...(target.eventData || eventData || {}),
        _duplicateWarning: true,
      },
    };

    const db = await getDb();
    const { tx, store } = txStore(db, STORE_EVENTS, "readwrite");
    store.put(updated);
    await transactionDone(tx);
    return updated;
  }

  async function getEventsMap() {
    const events = await getAllEvents();
    return groupEventsByTab(events);
  }

  async function countEventsForTab(tabId, options = {}) {
    const events = await getEventsByTab(tabId);
    return events.filter(
      (event) => options.includeDiagnostics || !event.isDiagnostic,
    ).length;
  }

  async function clearEventsForTab(tabId) {
    const events = await getEventsByTab(tabId);
    if (events.length === 0) return;
    const db = await getDb();
    const { tx, store } = txStore(db, STORE_EVENTS, "readwrite");
    events.forEach((event) => store.delete(event.id));
    await transactionDone(tx);
  }

  async function clearEventsForTabBefore(tabId, cutoffTimestamp) {
    const cutoff = Number(cutoffTimestamp);
    if (!Number.isFinite(cutoff)) {
      await clearEventsForTab(tabId);
      return;
    }
    const events = await getEventsByTab(tabId);
    const stale = events.filter((event) => (event.timestamp || 0) < cutoff);
    if (stale.length === 0) return;
    const db = await getDb();
    const { tx, store } = txStore(db, STORE_EVENTS, "readwrite");
    stale.forEach((event) => store.delete(event.id));
    await transactionDone(tx);
  }

  async function trimEventsToMax(maxEvents) {
    const eventsMap = await getEventsMap();
    let changed = false;
    await Promise.all(
      Object.entries(eventsMap).map(async ([tabId, events]) => {
        if (events.length > maxEvents) {
          changed = true;
          await pruneTab(tabId, maxEvents);
        }
      }),
    );
    return changed;
  }

  async function putAuditRun(run) {
    const db = await getDb();
    const { tx, store } = txStore(db, STORE_AUDIT_RUNS, "readwrite");
    store.put(run);
    await transactionDone(tx);
  }

  async function patchAuditRun(id, patch) {
    const auditRuns = await getAuditRunsMap();
    await putAuditRun({ ...(auditRuns[id] || { id }), ...patch });
  }

  async function getAuditRunsMap() {
    const db = await getDb();
    const { store } = txStore(db, STORE_AUDIT_RUNS);
    const runs = await requestToPromise(store.getAll());
    return Object.fromEntries(runs.map((run) => [run.id, run]));
  }

  async function clearAll() {
    const db = await getDb();
    const tx = db.transaction([STORE_EVENTS, STORE_AUDIT_RUNS], "readwrite");
    tx.objectStore(STORE_EVENTS).clear();
    tx.objectStore(STORE_AUDIT_RUNS).clear();
    await transactionDone(tx);
  }

  async function migrateLegacyStorage(storageArea) {
    const res = await storageGet(storageArea, [
      ...LEGACY_KEYS,
      LEGACY_MIGRATION_MARKER,
    ]);
    if (res[LEGACY_MIGRATION_MARKER]) return;

    const legacyEventsMap = res.trackedEvents || {};
    const legacyRuns = res.auditRuns || {};
    const legacyEvents = Object.values(legacyEventsMap).flatMap((events) =>
      Array.isArray(events) ? events : [],
    );

    for (const event of legacyEvents) {
      await addEvent(event);
    }
    for (const run of Object.values(legacyRuns)) {
      await putAuditRun(run);
    }

    const eventsAfterMigration = await getAllEvents();
    const runsAfterMigration = await getAuditRunsMap();
    if (
      eventsAfterMigration.length >= legacyEvents.length &&
      Object.keys(runsAfterMigration).length >= Object.keys(legacyRuns).length
    ) {
      await storageSet(storageArea, { [LEGACY_MIGRATION_MARKER]: true });
      await storageRemove(storageArea, LEGACY_KEYS);
    }
  }

  return {
    init,
    addEvent,
    addEvents,
    incrementDuplicateEvent,
    getEventsMap,
    getAllEvents,
    getEventsByTab,
    countEventsForTab,
    clearEventsForTab,
    clearEventsForTabBefore,
    trimEventsToMax,
    putAuditRun,
    patchAuditRun,
    getAuditRunsMap,
    clearAll,
    migrateLegacyStorage,
  };
}

/**
 * In-memory repository for fast unit tests and pure lifecycle verification.
 * @returns {import("./contracts.js").EventRepository}
 */
export function createMemoryEventRepository() {
  /** @type {Map<string, import("./contracts.js").TrackedEvent>} */
  const events = new Map();
  /** @type {Map<string, import("./contracts.js").AuditRun>} */
  const auditRuns = new Map();

  async function getAllEvents() {
    return [...events.values()].sort(byNewest);
  }

  async function getEventsByTab(tabId) {
    return [...events.values()]
      .filter((event) => event.tabId === String(tabId))
      .sort(byNewest);
  }

  async function addEvent(event, options = {}) {
    await addEvents([event], options);
  }

  async function addEvents(batch, options = {}) {
    const normalizedEvents = (Array.isArray(batch) ? batch : [])
      .filter(Boolean)
      .map(normalizeEvent);
    normalizedEvents.forEach((normalized) => {
      events.set(normalized.id, normalized);
    });

    if (options.maxEvents) {
      const tabIds = [...new Set(normalizedEvents.map((item) => item.tabId))];
      for (const tabId of tabIds) {
        const stale = (await getEventsByTab(tabId)).slice(options.maxEvents);
        stale.forEach((item) => events.delete(item.id));
      }
    }
  }

  async function incrementDuplicateEvent(match, eventData = {}) {
    const target = findDuplicateTarget(
      await getEventsByTab(String(match.tabId || "")),
      match,
    );
    if (!target) return null;
    const updated = {
      ...target,
      status: "duplicate",
      duplicateCount: (target.duplicateCount || 0) + 1,
      eventData: {
        ...(target.eventData || eventData || {}),
        _duplicateWarning: true,
      },
    };
    events.set(updated.id, updated);
    return updated;
  }

  async function getEventsMap() {
    return groupEventsByTab(await getAllEvents());
  }

  async function countEventsForTab(tabId, options = {}) {
    const tabEvents = await getEventsByTab(tabId);
    return tabEvents.filter(
      (event) => options.includeDiagnostics || !event.isDiagnostic,
    ).length;
  }

  async function clearEventsForTab(tabId) {
    (await getEventsByTab(tabId)).forEach((event) => events.delete(event.id));
  }

  async function clearEventsForTabBefore(tabId, cutoffTimestamp) {
    const cutoff = Number(cutoffTimestamp);
    if (!Number.isFinite(cutoff)) {
      await clearEventsForTab(tabId);
      return;
    }
    (await getEventsByTab(tabId))
      .filter((event) => (event.timestamp || 0) < cutoff)
      .forEach((event) => events.delete(event.id));
  }

  async function trimEventsToMax(maxEvents) {
    let changed = false;
    const eventsMap = await getEventsMap();
    Object.values(eventsMap).forEach((tabEvents) => {
      tabEvents.slice(maxEvents).forEach((event) => {
        changed = true;
        events.delete(event.id);
      });
    });
    return changed;
  }

  async function putAuditRun(run) {
    auditRuns.set(run.id, run);
  }

  async function patchAuditRun(id, patch) {
    auditRuns.set(id, { ...(auditRuns.get(id) || { id }), ...patch });
  }

  async function getAuditRunsMap() {
    return Object.fromEntries(auditRuns);
  }

  async function clearAll() {
    events.clear();
    auditRuns.clear();
  }

  async function migrateLegacyStorage() {}

  return {
    init: async () => {},
    addEvent,
    addEvents,
    incrementDuplicateEvent,
    getEventsMap,
    getAllEvents,
    getEventsByTab,
    countEventsForTab,
    clearEventsForTab,
    clearEventsForTabBefore,
    trimEventsToMax,
    putAuditRun,
    patchAuditRun,
    getAuditRunsMap,
    clearAll,
    migrateLegacyStorage,
  };
}

export const eventRepository = createIndexedDbEventRepository();
