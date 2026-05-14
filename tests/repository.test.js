import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryEventRepository } from "../src/shared/event-repository.js";

const makeEvent = (patch = {}) => ({
  id: patch.id || `event-${Math.random()}`,
  tabId: patch.tabId || "1",
  platform: patch.platform || "Meta",
  pixelId: patch.pixelId || "123",
  eventName: patch.eventName || "PageView",
  eventData: patch.eventData || {},
  url: patch.url || "https://shop.test/",
  method: patch.method || "GET",
  timestamp: patch.timestamp || Date.now(),
  status: patch.status || "valid",
  isDiagnostic: patch.isDiagnostic || false,
  issues: [],
  duplicateCount: patch.duplicateCount || 0,
  auditRunId: patch.auditRunId || "run-1",
  source: patch.source || "network",
  dedupeKey: patch.dedupeKey,
  payloadHash: patch.payloadHash,
});

test("memory repository groups events by tab and trims newest per tab", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(makeEvent({ id: "old", tabId: "1", timestamp: 1 }));
  await repo.addEvent(makeEvent({ id: "new", tabId: "1", timestamp: 2 }));
  await repo.addEvent(makeEvent({ id: "other", tabId: "2", timestamp: 3 }));

  const changed = await repo.trimEventsToMax(1);
  const eventsMap = await repo.getEventsMap();

  assert.equal(changed, true);
  assert.deepEqual(
    eventsMap["1"].map((event) => event.id),
    ["new"],
  );
  assert.deepEqual(
    eventsMap["2"].map((event) => event.id),
    ["other"],
  );
});

test("memory repository batches addEvents and trims per touched tab", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvents(
    [
      makeEvent({ id: "old", tabId: "1", timestamp: 1 }),
      makeEvent({ id: "mid", tabId: "1", timestamp: 2 }),
      makeEvent({ id: "new", tabId: "1", timestamp: 3 }),
      makeEvent({ id: "other", tabId: "2", timestamp: 4 }),
    ],
    { maxEvents: 2 },
  );

  const eventsMap = await repo.getEventsMap();

  assert.deepEqual(
    eventsMap["1"].map((event) => event.id),
    ["new", "mid"],
  );
  assert.deepEqual(
    eventsMap["2"].map((event) => event.id),
    ["other"],
  );
  assert.equal(eventsMap["1"][0].parserSchemaVersion, 1);
});

test("memory repository increments duplicate event without adding UI noise", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(
    makeEvent({
      id: "purchase",
      eventName: "Purchase",
      eventData: { cd: { value: "10", currency: "USD" } },
    }),
  );

  const updated = await repo.incrementDuplicateEvent(
    {
      tabId: "1",
      platform: "Meta",
      pixelId: "123",
      eventName: "Purchase",
      method: "GET",
    },
    { cd: { value: "10", currency: "USD" } },
  );
  const [event] = await repo.getEventsByTab("1");

  assert.equal(updated.id, "purchase");
  assert.equal(event.status, "duplicate");
  assert.equal(event.duplicateCount, 1);
  assert.equal(event.eventData._duplicateWarning, true);
});

test("memory repository increments only the exact duplicate key", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(
    makeEvent({
      id: "purchase-a",
      eventName: "Purchase",
      eventData: { eid: "A" },
      dedupeKey: "A",
      payloadHash: "hash-a",
      timestamp: 1,
    }),
  );
  await repo.addEvent(
    makeEvent({
      id: "purchase-b",
      eventName: "Purchase",
      eventData: { eid: "B" },
      dedupeKey: "B",
      payloadHash: "hash-b",
      timestamp: 2,
    }),
  );

  const updated = await repo.incrementDuplicateEvent(
    {
      tabId: "1",
      platform: "Meta",
      pixelId: "123",
      eventName: "Purchase",
      method: "GET",
      dedupeKey: "A",
      payloadHash: "hash-a",
    },
    { eid: "A" },
  );
  const events = await repo.getEventsByTab("1");

  assert.equal(updated.id, "purchase-a");
  assert.equal(events.find((item) => item.id === "purchase-a").duplicateCount, 1);
  assert.equal(events.find((item) => item.id === "purchase-b").duplicateCount, 0);
});

test("memory repository avoids legacy fallback when keyed events do not match", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(
    makeEvent({
      id: "purchase-b",
      eventName: "Purchase",
      eventData: { eid: "B" },
      dedupeKey: "B",
      payloadHash: "hash-b",
      timestamp: 2,
    }),
  );

  const updated = await repo.incrementDuplicateEvent(
    {
      tabId: "1",
      platform: "Meta",
      pixelId: "123",
      eventName: "Purchase",
      method: "GET",
      dedupeKey: "A",
      payloadHash: "hash-a",
    },
    { eid: "A" },
  );

  assert.equal(updated, null);
});

test("memory repository clears only stale tab events before a reload cutoff", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(makeEvent({ id: "old", tabId: "1", timestamp: 1000 }));
  await repo.addEvent(makeEvent({ id: "recent", tabId: "1", timestamp: 5000 }));
  await repo.addEvent(makeEvent({ id: "other-tab", tabId: "2", timestamp: 1000 }));

  await repo.clearEventsForTabBefore("1", 3000);

  assert.deepEqual(
    (await repo.getEventsByTab("1")).map((event) => event.id),
    ["recent"],
  );
  assert.deepEqual(
    (await repo.getEventsByTab("2")).map((event) => event.id),
    ["other-tab"],
  );
});

test("memory repository clears audit runs and events together", async () => {
  const repo = createMemoryEventRepository();
  await repo.addEvent(makeEvent({ id: "evt" }));
  await repo.putAuditRun({
    id: "run-1",
    tabId: "1",
    domain: "shop.test",
    url: "https://shop.test/",
    startedAt: 1,
    endedAt: null,
    reloadMode: "none",
    expectedPixels: {},
    expectedEvents: [],
  });

  await repo.clearAll();

  assert.deepEqual(await repo.getEventsMap(), {});
  assert.deepEqual(await repo.getAuditRunsMap(), {});
});
