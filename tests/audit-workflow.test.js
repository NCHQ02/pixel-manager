import test from "node:test";
import assert from "node:assert/strict";

import { parseGoogleRequest } from "../src/background/parsers/google.js";
import {
  DEFAULT_EXPECTED_EVENTS,
  EXPECTATION_IMPORT_TEMPLATE,
  ISSUE_CATEGORY_LABELS,
  buildChecklist,
  buildHealthScore,
  buildIssues,
  buildReportHtml,
  buildProfessionalReportHtml,
  buildReportModel,
  buildTimeline,
  getIssueFixSuggestion,
  mergeWorkspaceDraft,
  parseExpectationImportJson,
} from "../src/dashboard/js/audit.js";
import { normalizeSettings } from "../src/shared/settings.js";

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

test("uses TikTok Pageview casing in expected events", () => {
  const tiktokPageview = DEFAULT_EXPECTED_EVENTS.find(
    (event) => event.platform === "TikTok" && event.eventName === "Pageview",
  );

  assert.deepEqual(tiktokPageview, {
    platform: "TikTok",
    eventName: "Pageview",
  });

  const checklist = buildChecklist(
    [
      {
        platform: "TikTok",
        pixelId: "C123",
        eventName: "PageView",
        eventData: { event_id: "evt-1" },
        timestamp: 1,
      },
    ],
    [{ platform: "TikTok", eventName: "PageView" }],
  );

  assert.equal(checklist[0].eventName, "Pageview");
  assert.equal(checklist[0].status, "valid");
});

test("parses bulk expectation JSON import", () => {
  const parsed = parseExpectationImportJson(
    JSON.stringify({
      ...EXPECTATION_IMPORT_TEMPLATE,
      expectedPixels: {
        Meta: "123456",
        TikTok: "",
        googleads: "AW-123",
      },
      expectedEvents: [
        { platform: "facebook", eventName: "Purchase" },
        { platform: "TikTok", eventName: "PageView" },
        { platform: "Unknown", eventName: "Ignored" },
      ],
    }),
  );

  assert.deepEqual(parsed.expectedPixels, {
    Meta: "123456",
    "Google Ads": "AW-123",
  });
  assert.deepEqual(parsed.expectedEvents, [
    { platform: "Meta", eventName: "Purchase" },
    { platform: "TikTok", eventName: "Pageview" },
  ]);
  assert.equal(parsed.skippedEvents, 1);
});

test("normalizes legacy TikTok CompletePayment expectation to Purchase", () => {
  const parsed = parseExpectationImportJson(
    JSON.stringify({
      expectedEvents: [{ platform: "TikTok", eventName: "CompletePayment" }],
    }),
  );

  assert.deepEqual(parsed.expectedEvents, [
    { platform: "TikTok", eventName: "Purchase" },
  ]);
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

test("matches legacy TikTok CompletePayment to the current Purchase checklist", () => {
  const checklist = buildChecklist(
    [
      {
        platform: "TikTok",
        pixelId: "C123",
        eventName: "CompletePayment",
        eventData: { properties: { value: 25, currency: "USD" } },
        timestamp: 1,
      },
    ],
    [{ platform: "TikTok", eventName: "Purchase" }],
  );

  assert.equal(checklist[0].found, true);
  assert.equal(checklist[0].status, "warning");
  assert.ok(
    checklist[0].issues.some((issue) => issue.includes("eventData.event_id")),
  );
});

test("does not warn for alternate Google Ads label parameter names", () => {
  const checklist = buildChecklist(
    [
      {
        platform: "Google Ads",
        pixelId: "AW-123",
        eventName: "Conversion (lead_a)",
        eventData: { label: "lead_a", value: "1", currency_code: "USD" },
        timestamp: 1,
      },
    ],
    [{ platform: "Google Ads", eventName: "Conversion" }],
  );

  assert.equal(checklist[0].status, "valid");
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

test("builds central AuditIssue fields with category and evidence", () => {
  const issues = buildIssues(
    [
      {
        id: "purchase-1",
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { cd: { value: "10", currency: "USD" } },
        source: "network",
        parserSchemaVersion: 2,
        timestamp: 1,
      },
    ],
    [{ platform: "Meta", eventName: "Purchase" }],
  );

  const dedupe = issues.find((issue) => issue.category === "deduplication");

  assert.equal(ISSUE_CATEGORY_LABELS.deduplication, "Deduplication");
  assert.equal(dedupe.severity, "warning");
  assert.equal(dedupe.eventId, "purchase-1");
  assert.equal(dedupe.source, "network");
  assert.match(dedupe.evidence, /eventData\.event_id|eventData\.eid/i);
  assert.match(dedupe.suggestion, /event_id/i);
});

test("merges DOM scanner evidence into installation, consent, and Google health issues", () => {
  const scannerEvent = {
    id: "scan-1",
    platform: "Diagnostics",
    pixelId: "Local Scanner",
    eventName: "Tag Scanner Snapshot",
    eventData: {
      platforms: { Meta: false, TikTok: false, Google: true },
      google: {
        firstEventIndex: 1,
        firstConfigIndex: -1,
        eventBeforeConfig: true,
        consentSeen: false,
      },
      cookies: { gclAw: false, gclAu: false },
      scripts: [
        {
          host: "www.googletagmanager.com",
          path: "/gtag/js",
          id: "AW-123",
          inHead: true,
        },
      ],
    },
    source: "scanner",
    isDiagnostic: true,
    parserSchemaVersion: 2,
    timestamp: 10,
  };
  const googleAdsEvent = {
    id: "ads-1",
    platform: "Google Ads",
    pixelId: "AW-123",
    eventName: "Conversion (lead_a)",
    eventData: { label: "lead_a", value: "1", currency_code: "USD" },
    source: "network",
    timestamp: 20,
  };

  const reportModel = buildReportModel({
    events: [scannerEvent, googleAdsEvent],
    expectedEvents: [
      { platform: "Meta", eventName: "PageView" },
      { platform: "Google Ads", eventName: "Conversion" },
    ],
    expectedPixels: { Meta: "123", "Google Ads": "AW-123" },
  });

  assert.equal(reportModel.scannerSummary.observed, true);
  assert.equal(reportModel.parserSchemaVersion, 2);
  assert.ok(
    reportModel.issues.some(
      (issue) =>
        issue.category === "installation" &&
        issue.source === "scanner" &&
        issue.message.includes("Meta tag was expected"),
    ),
  );
  assert.ok(reportModel.issues.some((issue) => issue.category === "consent"));
  assert.ok(
    reportModel.issues.some(
      (issue) =>
        issue.category === "google_tag_health" &&
        issue.message.includes("config command"),
    ),
  );
  assert.ok(
    reportModel.issues.some(
      (issue) =>
        issue.category === "google_tag_health" &&
        issue.message.includes("_gcl_"),
    ),
  );

  const html = buildProfessionalReportHtml(reportModel);
  assert.match(html, /Issue Summary/);
  assert.match(html, /Consent &amp; Tag Health|Consent & Tag Health/);
  assert.match(html, /Dedupe Readiness/);
  assert.match(html, /schema v2/);
});

test("builds health score with capped issue deductions", () => {
  const health = buildHealthScore(
    [
      {
        id: "evt-1",
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { eid: "evt-1", cd: { value: "10", currency: "USD" } },
        duplicateCount: 2,
        timestamp: 1,
      },
    ],
    [
      { platform: "Meta", eventName: "Purchase" },
      { platform: "TikTok", eventName: "CompletePayment" },
    ],
  );

  assert.equal(health.score, 82);
  assert.equal(health.label, "Needs Review");
});

test("builds timeline with missing, duplicate, and out-of-order states", () => {
  const timeline = buildTimeline(
    [
      {
        id: "page",
        platform: "Meta",
        pixelId: "123",
        eventName: "PageView",
        eventData: {},
        timestamp: 200,
      },
      {
        id: "cart",
        platform: "Meta",
        pixelId: "123",
        eventName: "AddToCart",
        eventData: {},
        timestamp: 300,
      },
      {
        id: "purchase",
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: {},
        duplicateCount: 2,
        timestamp: 100,
      },
    ],
    [],
  );

  assert.equal(timeline.find((step) => step.eventName === "ViewContent").status, "missing");
  const purchase = timeline.find((step) => step.eventName === "Purchase");
  assert.equal(purchase.status, "out_of_order");
  assert.equal(purchase.duplicateCount, 2);
});

test("returns concrete quick fix suggestions", () => {
  assert.match(
    getIssueFixSuggestion({
      message: "Missing required parameter: eventData.cd.value.",
      event: { eventName: "Purchase" },
    }),
    /Data Layer variable/,
  );
  assert.match(
    getIssueFixSuggestion({
      message: "Duplicate firing detected 2 time(s).",
      event: { eventName: "Purchase" },
    }),
    /duplicate pixel installs/i,
  );
});

test("merges workspace drafts without dropping nested filters", () => {
  const draft = mergeWorkspaceDraft(
    {
      activeWorkspaceView: "live",
      filters: { searchQuery: "Purchase", statusFilter: "All" },
      expectedPixels: { Meta: "123" },
      expectedEvents: [{ platform: "Meta", eventName: "Purchase" }],
    },
    {
      filters: { statusFilter: "warning" },
      expectedPixels: { TikTok: "C123" },
    },
  );

  assert.equal(draft.filters.searchQuery, "Purchase");
  assert.equal(draft.filters.statusFilter, "warning");
  assert.deepEqual(draft.expectedPixels, { TikTok: "C123" });
});

test("builds professional HTML report without external dependencies", () => {
  const reportModel = buildReportModel({
    auditRun: { domain: "shop.test", startedAt: 1, endedAt: 2 },
    expectedEvents: [{ platform: "Meta", eventName: "Purchase" }],
    expectedPixels: {},
    events: [
      {
        id: "evt-1",
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { eid: "evt-1", cd: { value: "<script>", currency: "USD" } },
        timestamp: 1,
      },
    ],
  });
  const html = buildProfessionalReportHtml(reportModel);

  assert.match(html, /Tracking Health/);
  assert.match(html, /Funnel Timeline/);
  assert.match(html, /Issues &amp; Fixes|Issues & Fixes/);
  assert.match(html, /Generated locally by OmniSignal/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<(script|link)\b/i);
  assert.doesNotMatch(html, /(src|href)=["']https?:/i);
});

test("builds report model for a 5,000 event local session", () => {
  const events = Array.from({ length: 5000 }, (_, index) => ({
    id: `evt-${index}`,
    platform: "Meta",
    pixelId: "123",
    eventName: "PageView",
    eventData: {
      fbp: "fb.1.1.1",
      fbc: "fb.1.1.2",
    },
    source: "network",
    timestamp: index + 1,
  }));

  const reportModel = buildReportModel({
    events,
    expectedEvents: [{ platform: "Meta", eventName: "PageView" }],
    expectedPixels: { Meta: "123" },
  });

  assert.equal(reportModel.summary.total, 5000);
  assert.equal(
    reportModel.issues.filter((issue) => issue.severity !== "info").length,
    0,
  );
  assert.ok(
    reportModel.issues.some((issue) => issue.category === "source_of_truth"),
  );
  assert.equal(reportModel.checklist[0].status, "valid");
});

test("can omit raw payload appendix from professional report", () => {
  const reportModel = buildReportModel({
    auditRun: { domain: "shop.test", startedAt: 1, endedAt: 2 },
    events: [
      {
        id: "evt-1",
        platform: "Meta",
        pixelId: "123",
        eventName: "Purchase",
        eventData: { eid: "evt-1" },
        timestamp: 1,
      },
    ],
    options: { includePayloadAppendix: false },
  });
  const html = buildProfessionalReportHtml(reportModel);

  assert.doesNotMatch(html, /Raw Payload Appendix/);
  assert.doesNotMatch(html, /evt-1/);
});

test("normalizes expanded settings with safe defaults", () => {
  const settings = normalizeSettings({
    maxEvents: "999999",
    sessionWindow: "bad",
    captureNetwork: false,
    captureTagScanner: false,
    defaultView: "issues",
    rawExportScope: "visible",
    expectedPixels: { Meta: " 123 " },
    expectedEvents: [{ platform: "Meta", eventName: "Purchase" }],
  });

  assert.equal(settings.maxEvents, 5000);
  assert.equal(settings.sessionWindow, 1800000);
  assert.equal(settings.captureNetwork, false);
  assert.equal(settings.captureTagScanner, false);
  assert.equal(settings.defaultView, "issues");
  assert.equal(settings.rawExportScope, "visible");
  assert.deepEqual(settings.expectedPixels, { Meta: "123" });
  assert.deepEqual(settings.expectedEvents, [
    { platform: "Meta", eventName: "Purchase" },
  ]);
});

test("report model keeps audited page path in target label", () => {
  const reportModel = buildReportModel({
    auditRun: {
      domain: "shop.test",
      url: "https://shop.test/products/cookie?utm_source=ads",
      startedAt: 1,
      endedAt: 2,
    },
    events: [],
  });
  const html = buildProfessionalReportHtml(reportModel);

  assert.equal(
    reportModel.auditTarget.label,
    "shop.test/products/cookie?utm_source=ads",
  );
  assert.match(html, /shop\.test\/products\/cookie\?utm_source=ads/);
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
