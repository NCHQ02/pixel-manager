import test from "node:test";
import assert from "node:assert/strict";

import { AuditSessionManager } from "../src/background/session.js";
import { createMemoryEventRepository } from "../src/shared/event-repository.js";

function createMockChrome() {
  const sessionData = {};
  const executed = [];
  return {
    __executed: executed,
    storage: {
      session: {
        get(keys, cb) {
          const result = {};
          keys.forEach((key) => {
            result[key] = sessionData[key];
          });
          cb(result);
        },
        set(value, cb) {
          Object.assign(sessionData, value);
          cb?.();
        },
      },
    },
    tabs: {
      async get() {
        throw new Error("no last tab");
      },
      async query() {
        return [];
      },
      reload() {},
    },
    scripting: {
      async executeScript(args) {
        executed.push(args);
      },
    },
  };
}

const event = {
  id: "evt-1",
  tabId: "7",
  platform: "Meta",
  pixelId: "123",
  eventName: "PageView",
  eventData: {},
  url: "https://shop.test/",
  method: "GET",
  timestamp: 1,
  status: "valid",
  isDiagnostic: false,
  issues: [],
  duplicateCount: 0,
  auditRunId: "run",
  source: "network",
};

test("page loading clears current tab canvas before reinjection", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  const clearedFingerprints = [];
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: (tabId) => clearedFingerprints.push(tabId),
  });
  await manager.hydrate();

  const context = await manager.enableAuditingForTab(
    {
      id: 7,
      url: "https://shop.test/products",
      status: "complete",
    },
    { createNewRun: true },
  );
  await repository.addEvent({ ...event, auditRunId: context.auditRunId });

  const cleared = await manager.handleTabLoading(7, {
    id: 7,
    url: "https://shop.test/checkout",
    status: "loading",
  });

  await manager.handleTabComplete(7, {
    id: 7,
    url: "https://shop.test/checkout",
    status: "complete",
  });

  const events = await repository.getEventsByTab("7");
  const state = await manager.getStateResponse();

  assert.equal(cleared, true);
  assert.equal(events.length, 0);
  assert.equal(state.auditTabs["7"].url, "https://shop.test/checkout");
  assert.equal(clearedFingerprints.length, 2);
  assert.ok(
    chromeApi.__executed.some((call) => call.files.includes("src/content/inject.js")),
  );
  assert.ok(
    chromeApi.__executed.some((call) => call.world === "MAIN"),
  );
});

test("tab close removes session context but preserves audit data", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: () => {},
  });
  await manager.hydrate();
  const context = await manager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { createNewRun: true },
  );
  await repository.addEvent({ ...event, auditRunId: context.auditRunId });

  await manager.handleTabRemoved(7);

  const events = await repository.getEventsByTab("7");
  const state = await manager.getStateResponse();

  assert.equal(events.length, 1);
  assert.equal(state.auditTabs["7"], undefined);
});

test("new audit run clears only the current tab event scope", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: () => {},
  });
  await manager.hydrate();
  await manager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { createNewRun: true },
  );
  await repository.addEvent(event);
  await repository.addEvent({ ...event, id: "other", tabId: "8" });

  await manager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { createNewRun: true },
  );

  assert.equal((await repository.getEventsByTab("7")).length, 0);
  assert.equal((await repository.getEventsByTab("8")).length, 1);
});
