import test from "node:test";
import assert from "node:assert/strict";

import { parseGoogleRequest } from "../src/background/parsers/google.js";
import {
  DEFAULT_EXPECTED_EVENTS,
  buildChecklist,
  buildIssues,
  buildReportHtml,
} from "../src/dashboard/js/audit.js";

test("parses Google Ads conversion from googleadservices endpoint", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.googleadservices.com/pagead/conversion/AW-123456789/?label=purchase_a&value=199&currency_code=USD",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Google Ads");
  assert.equal(parsed.pixelId, "AW-123456789");
  assert.equal(parsed.eventName, "Conversion (purchase_a)");
});

test("builds checklist with missing expected events", () => {
  const events = [
    {
      platform: "Meta",
      pixelId: "123",
      eventName: "Purchase",
      eventData: { eid: "evt-1", cd: { value: "10", currency: "USD" } },
      timestamp: 1,
    },
  ];
  const checklist = buildChecklist(events, [
    { platform: "Meta", eventName: "Purchase" },
    { platform: "TikTok", eventName: "CompletePayment" },
  ]);

  assert.equal(checklist[0].status, "valid");
  assert.equal(checklist[1].status, "missing");
});

test("classifies observed events with missing required params", () => {
  const checklist = buildChecklist(
    [
      {
        platform: "TikTok",
        pixelId: "C123",
        eventName: "CompletePayment",
        eventData: { properties: { currency: "USD" } },
        timestamp: 1,
      },
    ],
    [{ platform: "TikTok", eventName: "CompletePayment" }],
  );

  assert.equal(checklist[0].status, "missing_params");
  assert.ok(
    checklist[0].issues.some((issue) =>
      issue.includes("Missing required parameter"),
    ),
  );
});

test("groups duplicate and expected-event issues", () => {
  const issues = buildIssues(
    [
      {
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { eid: "evt-1", cd: { value: "10", currency: "USD" } },
        duplicateCount: 2,
        timestamp: 1,
      },
    ],
    DEFAULT_EXPECTED_EVENTS.filter((event) => event.platform === "Meta"),
  );

  assert.ok(issues.some((issue) => issue.message.includes("Duplicate firing")));
  assert.ok(issues.some((issue) => issue.message.includes("Expected event")));
});

test("builds an HTML report with escaped payload", () => {
  const html = buildReportHtml({
    auditRun: { domain: "shop.test" },
    expectedEvents: [{ platform: "Meta", eventName: "Purchase" }],
    expectedPixels: {},
    events: [
      {
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { eid: "evt-1", cd: { value: "<script>", currency: "USD" } },
        timestamp: 1,
      },
    ],
  });

  assert.match(html, /OmniSignal Audit Report/);
  assert.match(html, /&lt;script&gt;/);
});
