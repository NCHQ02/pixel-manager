import test from "node:test";
import assert from "node:assert/strict";

import { AuditSessionManager } from "../src/background/session.js";
import { createMemoryEventRepository } from "../src/shared/event-repository.js";

function createMockChrome(options = {}) {
  const sessionData = options.sessionData || {};
  const localData = options.localData || {};
  const executed = [];
  const sentMessages = [];
  const getStorageResult = (data, keys) => {
    if (!keys) return { ...data };
    const keyList = Array.isArray(keys) ? keys : [keys];
    const result = {};
    keyList.forEach((key) => {
      result[key] = data[key];
    });
    return result;
  };
  return {
    __executed: executed,
    __sentMessages: sentMessages,
    __sessionData: sessionData,
    __localData: localData,
    storage: {
      session: {
        get(keys, cb) {
          cb(getStorageResult(sessionData, keys));
        },
        set(value, cb) {
          Object.assign(sessionData, value);
          cb?.();
        },
      },
      local: {
        get(keys, cb) {
          cb(getStorageResult(localData, keys));
        },
        set(value, cb) {
          Object.assign(localData, value);
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
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
      },
      reload() {},
    },
    scripting: {
      async executeScript(args) {
        if (options.failMainWorld && args.world === "MAIN") {
          throw new Error("main world blocked");
        }
        if (options.failContent && args.files.includes("src/content/content.js")) {
          throw new Error("content blocked");
        }
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

test("page loading preserves very recent network hits captured before loading event", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: () => {},
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
  await repository.addEvent({
    ...event,
    id: "old-page-view",
    timestamp: 1,
    auditRunId: context.auditRunId,
  });
  await repository.addEvent({
    ...event,
    id: "early-ga4-page-view",
    platform: "GA4",
    pixelId: "G-TEST123",
    eventName: "page_view",
    timestamp: Date.now(),
    auditRunId: context.auditRunId,
  });

  const cleared = await manager.handleTabLoading(7, {
    id: 7,
    url: "https://shop.test/products",
    status: "loading",
  });

  const events = await repository.getEventsByTab("7");

  assert.equal(cleared, true);
  assert.deepEqual(
    events.map((item) => item.id),
    ["early-ga4-page-view"],
  );
});

test("navigation start clears the current tab canvas before new GA hits", async () => {
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
  await repository.addEvent({
    ...event,
    id: "previous-page-view",
    auditRunId: context.auditRunId,
  });

  const cleared = await manager.handleNavigationStarted(
    7,
    "https://shop.test/",
  );

  assert.equal(cleared, true);
  assert.deepEqual(await repository.getEventsByTab("7"), []);
});

test("tab loading after navigation start does not clear current navigation hits", async () => {
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

  await manager.handleNavigationStarted(7, "https://shop.test/");
  await repository.addEvent({
    ...event,
    id: "current-ga4-page-view",
    platform: "GA4",
    pixelId: "G-TEST123",
    eventName: "page_view",
    timestamp: Date.now(),
    auditRunId: context.auditRunId,
  });

  const cleared = await manager.handleTabLoading(7, {
    id: 7,
    url: "https://shop.test/",
    status: "loading",
  });
  const events = await repository.getEventsByTab("7");

  assert.equal(cleared, false);
  assert.deepEqual(
    events.map((item) => item.id),
    ["current-ga4-page-view"],
  );
});

test("navigation committed clears stale tab events when beforeNavigate was missed", async () => {
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
  await repository.addEvent({
    ...event,
    id: "previous-page-event",
    timestamp: 1000,
    auditRunId: context.auditRunId,
  });

  const cleared = await manager.handleNavigationCommitted(
    7,
    "https://shop.test/new-page",
    2500,
  );

  assert.equal(cleared, true);
  assert.deepEqual(await repository.getEventsByTab("7"), []);
});

test("navigation committed clears persisted workspace events after session wake", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  await repository.addEvent({
    ...event,
    id: "stored-event-without-live-session",
    timestamp: 1000,
  });
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: () => {},
  });
  await manager.hydrate();

  const cleared = await manager.handleNavigationCommitted(
    7,
    "https://shop.test/reloaded",
    2500,
  );

  assert.equal(cleared, true);
  assert.deepEqual(await repository.getEventsByTab("7"), []);
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

test("resume audit without reload preserves existing tab events after restart", async () => {
  const localData = {};
  const firstChrome = createMockChrome({ localData });
  const repository = createMemoryEventRepository();
  const manager = new AuditSessionManager({
    chromeApi: firstChrome,
    repository,
    clearFingerprints: () => {},
  });
  await manager.hydrate();
  const context = await manager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { createNewRun: true },
  );
  await repository.addEvent({ ...event, auditRunId: context.auditRunId });

  const restartedChrome = createMockChrome({ localData });
  const restartedManager = new AuditSessionManager({
    chromeApi: restartedChrome,
    repository,
    clearFingerprints: () => {},
  });
  await restartedManager.hydrate();
  const resumedContext = await restartedManager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { resumeExistingEvents: true },
  );

  const events = await repository.getEventsByTab("7");
  assert.equal(restartedManager.isAuditedTab(7), true);
  assert.equal(resumedContext.auditRunId, context.auditRunId);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "evt-1");
});

test("activation reports network-only mode when main-world injection fails", async () => {
  const chromeApi = createMockChrome({ failMainWorld: true });
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

  assert.equal(context.activationMode, "network_only");
  assert.equal(context.contentInjected, true);
  assert.equal(context.mainWorldInjected, false);
  assert.match(context.activationWarnings[0], /main world blocked/);
});

test("clearAuditState clears active tabs, run id, and deactivates content scripts", async () => {
  const chromeApi = createMockChrome();
  const repository = createMemoryEventRepository();
  const clearedFingerprints = [];
  const manager = new AuditSessionManager({
    chromeApi,
    repository,
    clearFingerprints: (tabId) => clearedFingerprints.push(tabId),
  });
  await manager.hydrate();

  await manager.enableAuditingForTab(
    { id: 7, url: "https://shop.test/", status: "complete" },
    { createNewRun: true },
  );
  clearedFingerprints.length = 0;
  const clearedTabIds = await manager.clearAuditState();

  const state = await manager.getStateResponse();
  assert.deepEqual(state.auditTabs, {});
  assert.equal(state.activeAuditRunId, null);
  assert.deepEqual(clearedTabIds, [7]);
  assert.deepEqual(clearedFingerprints, ["7"]);
  assert.deepEqual(chromeApi.__sentMessages, [
    { tabId: 7, message: { type: "AUDIT_DEACTIVATED" } },
  ]);
});
