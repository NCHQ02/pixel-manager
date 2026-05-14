import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { parseTrackingRequest } from "../src/background/parser-harness.js";
import { TRACKING_URL_PATTERNS as BACKGROUND_TRACKING_URL_PATTERNS } from "../src/background/constants.js";
import {
  AUDIT_RULES,
  EVIDENCE_SOURCES,
  HOST_PERMISSIONS,
  PARSER_SCHEMA_VERSION,
  PLATFORM_DEFINITIONS,
  PLATFORM_FILTERS,
  PLATFORM_UI_META,
  SUPPORTED_EXPECTATION_PLATFORMS,
  TRACKING_URL_PATTERNS,
} from "../src/shared/tracking-catalog.js";
import {
  buildProfessionalReportHtml,
  buildReportModel,
} from "../src/dashboard/js/audit.js";
import { selectEvents } from "../src/dashboard/js/state/selectors.js";

test("tracking catalog is the shared source of truth for platform coverage", () => {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  assert.deepEqual(manifest.host_permissions, HOST_PERMISSIONS);
  assert.deepEqual(BACKGROUND_TRACKING_URL_PATTERNS, TRACKING_URL_PATTERNS);
  assert.ok(PLATFORM_FILTERS.includes("Google"));
  assert.ok(PLATFORM_UI_META.Diagnostics);

  for (const platform of SUPPORTED_EXPECTATION_PLATFORMS) {
    assert.ok(PLATFORM_DEFINITIONS[platform], `${platform} definition missing`);
    assert.ok(PLATFORM_UI_META[platform], `${platform} UI metadata missing`);
    assert.ok(
      AUDIT_RULES.some((rule) => rule.platform === platform),
      `${platform} audit rule missing`,
    );
  }
});

test("parser harness validates normalized ParsedSignal fields", () => {
  const signals = parseTrackingRequest(
    new URL(
      "https://www.facebook.com/tr/?id=123456&ev=Purchase&eid=evt-1&cd%5Bvalue%5D=50&cd%5Bcurrency%5D=USD",
    ),
    { method: "GET" },
  );

  assert.equal(signals.length, 1);
  assert.equal(signals[0].platform, "Meta");
  assert.equal(signals[0].eventName, "Purchase");
  assert.equal(signals[0].confidence, "high");
  assert.equal(signals[0].sourceParser, "meta");
  assert.equal(signals[0].parserSchemaVersion, PARSER_SCHEMA_VERSION);
  assert.deepEqual(signals[0].diagnostics.validationIssues, []);
});

test("tag isolation filters independently from the search query", () => {
  const events = [
    {
      id: "ga4",
      platform: "GA4",
      pixelId: "G-TEST123",
      eventName: "page_view",
      timestamp: 2,
      isDiagnostic: false,
      status: "valid",
      source: "network",
      url: "https://shop.test/",
    },
    {
      id: "meta",
      platform: "Meta",
      pixelId: "123456",
      eventName: "PageView",
      timestamp: 1,
      isDiagnostic: false,
      status: "valid",
      source: "network",
      url: "https://shop.test/",
    },
  ];
  const store = {
    events: { "1": events },
    getAllEvents: () => events,
  };
  const dashboardState = {
    selectedTabId: "all",
    platformFilter: "All",
    statusFilter: "All",
    searchQuery: "",
    selectedTagFilter: { platform: "GA4", pixelId: "G-TEST123" },
  };

  assert.deepEqual(
    selectEvents(store, dashboardState).map((event) => event.id),
    ["ga4"],
  );
  assert.deepEqual(
    selectEvents(store, dashboardState, { applyTag: false }).map(
      (event) => event.id,
    ),
    ["ga4", "meta"],
  );
  assert.equal(dashboardState.searchQuery, "");
});

test("report model labels Hybrid Evidence and external account gap", () => {
  const reportModel = buildReportModel({
    events: [
      {
        id: "network-1",
        platform: "Meta",
        pixelId: "123456",
        eventName: "Purchase",
        eventData: { eid: "evt-1", cd: { value: "50", currency: "USD" } },
        source: "network",
        evidenceSource: EVIDENCE_SOURCES.LOCAL_NETWORK,
        timestamp: 1,
      },
      {
        id: "datalayer-1",
        platform: "DataLayer",
        pixelId: "GTM / DOM",
        eventName: "purchase",
        eventData: { event: "purchase" },
        source: "datalayer",
        evidenceSource: EVIDENCE_SOURCES.LOCAL_DATALAYER,
        timestamp: 2,
      },
      {
        id: "scanner-1",
        platform: "Diagnostics",
        pixelId: "Local Scanner",
        eventName: "Tag Scanner Snapshot",
        eventData: { platforms: { Meta: true }, scripts: [] },
        source: "scanner",
        evidenceSource: EVIDENCE_SOURCES.LOCAL_SCANNER,
        isDiagnostic: true,
        timestamp: 3,
      },
    ],
    expectedEvents: [{ platform: "Meta", eventName: "Purchase" }],
  });

  const external = reportModel.evidenceSources.find(
    (item) => item.key === EVIDENCE_SOURCES.EXTERNAL_ACCOUNT,
  );
  assert.equal(external.status, "not_connected");
  assert.ok(
    reportModel.issues.some(
      (issue) =>
        issue.category === "source_of_truth" &&
        issue.evidenceSource === EVIDENCE_SOURCES.EXTERNAL_ACCOUNT,
    ),
  );

  const html = buildProfessionalReportHtml(reportModel);
  assert.match(html, /Source of Truth/);
  assert.match(html, /Not connected/);
  assert.match(html, /local-first v1/);
});
