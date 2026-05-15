import test from "node:test";
import assert from "node:assert/strict";

import {
  createIndexedDbEventRepository,
  DB_VERSION,
  STORE_AUDIT_RUNS,
  STORE_EVENTS,
} from "../src/shared/event-repository.js";

test("current repository can read existing IndexedDB v1 data", async () => {
  const idb = createSeededIndexedDb({
    version: DB_VERSION,
    stores: {
      [STORE_EVENTS]: [
        {
          id: "existing-event",
          tabId: "42",
          platform: "Meta",
          pixelId: "123456789",
          eventName: "Purchase",
          eventData: { value: 99, currency: "USD" },
          url: "https://shop.example/thanks",
          method: "GET",
          timestamp: 2000,
          status: "valid",
          isDiagnostic: false,
          issues: [],
          duplicateCount: 0,
          auditRunId: "existing-run",
          source: "network",
        },
      ],
      [STORE_AUDIT_RUNS]: [
        {
          id: "existing-run",
          tabId: "42",
          domain: "shop.example",
          url: "https://shop.example/thanks",
          startedAt: 1000,
          endedAt: null,
          reloadMode: "none",
          expectedPixels: {},
          expectedEvents: [],
        },
      ],
    },
  });
  const repo = createIndexedDbEventRepository(idb);

  await repo.init();
  const events = await repo.getEventsByTab("42");
  const runs = await repo.getAuditRunsMap();

  assert.equal(idb.openCalls[0].version, DB_VERSION);
  assert.equal(idb.upgradeCalled, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "existing-event");
  assert.equal(events[0].eventName, "Purchase");
  assert.equal(runs["existing-run"].domain, "shop.example");
});

function createSeededIndexedDb({ version, stores }) {
  const db = createFakeDb(stores);
  return {
    openCalls: [],
    upgradeCalled: false,
    open(name, requestedVersion) {
      this.openCalls.push({ name, version: requestedVersion });
      const request = {};
      queueMicrotask(() => {
        if (requestedVersion > version) {
          this.upgradeCalled = true;
          request.result = db;
          request.onupgradeneeded?.();
        }
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function createFakeDb(seedStores) {
  const data = new Map(
    Object.entries(seedStores).map(([name, records]) => [
      name,
      new Map(records.map((record) => [record.id, structuredClone(record)])),
    ]),
  );
  const objectStoreNames = {
    contains(name) {
      return data.has(name);
    },
  };

  return {
    objectStoreNames,
    createObjectStore(name) {
      data.set(name, new Map());
      return createObjectStore(data.get(name));
    },
    transaction(storeNames) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const tx = {
        objectStore(name) {
          if (!names.includes(name)) throw new Error(`Unexpected store: ${name}`);
          return createObjectStore(data.get(name));
        },
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
}

function createObjectStore(records) {
  return {
    getAll() {
      return requestWithResult([...records.values()].map((record) => structuredClone(record)));
    },
    put(record) {
      records.set(record.id, structuredClone(record));
      return requestWithResult(record.id);
    },
    delete(id) {
      records.delete(id);
      return requestWithResult(undefined);
    },
    clear() {
      records.clear();
      return requestWithResult(undefined);
    },
    createIndex() {},
    index(indexName) {
      return {
        getAll(query) {
          return requestWithResult(
            [...records.values()]
              .filter((record) => record[indexName] === query)
              .map((record) => structuredClone(record)),
          );
        },
      };
    },
  };
}

function requestWithResult(result) {
  const request = { result };
  queueMicrotask(() => request.onsuccess?.());
  return request;
}
