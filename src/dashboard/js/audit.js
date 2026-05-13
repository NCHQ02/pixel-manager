import {
  auditEvent,
  classifyEventStatus,
  escapeHtml,
  formatTime,
  getPlatformMeta,
} from "./utils.js";

const BASE_AUDIT_RULES = [
  {
    platform: "Meta",
    eventName: "PageView",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.fbp", "eventData.fbc"],
  },
  {
    platform: "Meta",
    eventName: "ViewContent",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "Meta",
    eventName: "AddToCart",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.event_id|eventData.eid",
      "eventData.cd.value",
      "eventData.cd.currency",
    ],
  },
  {
    platform: "Meta",
    eventName: "Lead",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "Meta",
    eventName: "Purchase",
    requiredParams: ["pixelId", "eventData.cd.value", "eventData.cd.currency"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "TikTok",
    eventName: "Pageview",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id"],
  },
  {
    platform: "TikTok",
    eventName: "ViewContent",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.properties.content_id"],
  },
  {
    platform: "TikTok",
    eventName: "AddToCart",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.properties.value",
      "eventData.properties.currency",
    ],
  },
  {
    platform: "TikTok",
    eventName: "CompletePayment",
    requiredParams: [
      "pixelId",
      "eventData.properties.value",
      "eventData.properties.currency",
    ],
    recommendedParams: ["eventData.event_id"],
  },
  {
    platform: "GA4",
    eventName: "page_view",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.dl"],
  },
  {
    platform: "GA4",
    eventName: "add_to_cart",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.ep.currency", "eventData.epn.value"],
  },
  {
    platform: "GA4",
    eventName: "begin_checkout",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.ep.currency", "eventData.epn.value"],
  },
  {
    platform: "GA4",
    eventName: "purchase",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: [
      "eventData.ep.transaction_id",
      "eventData.ep.currency",
      "eventData.epn.value",
    ],
  },
  {
    platform: "Google Ads",
    eventName: "Conversion",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.label",
      "eventData.lbl",
      "eventData.value",
      "eventData.currency_code",
    ],
    matchMode: "prefix",
  },
  {
    platform: "Floodlight",
    eventName: "Floodlight",
    requiredParams: ["eventData.src", "eventData.type", "eventData.cat"],
    recommendedParams: ["eventData.ord"],
    matchMode: "any",
  },
];

const FALLBACK_TIMELINE = [
  { platform: "Any", eventName: "PageView", label: "Page View" },
  { platform: "Any", eventName: "ViewContent", label: "View Content" },
  { platform: "Any", eventName: "AddToCart", label: "Add To Cart" },
  { platform: "Any", eventName: "Lead", label: "Lead / Checkout" },
  { platform: "Any", eventName: "Purchase", label: "Purchase / Conversion" },
];

const FUNNEL_RANKS = new Map([
  ["pageview", 10],
  ["page_view", 10],
  ["page view", 10],
  ["viewcontent", 20],
  ["view_content", 20],
  ["view content", 20],
  ["addtocart", 30],
  ["add_to_cart", 30],
  ["add to cart", 30],
  ["lead", 40],
  ["begin_checkout", 45],
  ["checkout", 45],
  ["purchase", 60],
  ["completepayment", 60],
  ["conversion", 60],
  ["floodlight", 65],
]);

export const AUDIT_RULES = BASE_AUDIT_RULES.map((rule) => ({
  severity: rule.severity || "warning",
  message:
    rule.message ||
    `${rule.platform} ${rule.eventName} should match the pre-launch tracking checklist.`,
  ...rule,
}));

export const DEFAULT_EXPECTED_EVENTS = AUDIT_RULES.map((rule) => ({
  platform: rule.platform,
  eventName: rule.eventName,
}));

export function normalizeExpectedEvent(event) {
  return {
    ...event,
    eventName: canonicalEventName(event.platform, event.eventName),
  };
}

export function normalizeExpectedEvents(events = []) {
  return events.map(normalizeExpectedEvent);
}

export function formatAuditTargetLabel(url, fallback = "Not available") {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}${parsed.hash}` || fallback;
  } catch (_e) {
    return fallback || String(url);
  }
}

export function buildAuditSummary(events) {
  const summary = {
    total: events.length,
    valid: 0,
    warnings: 0,
    diagnostics: 0,
    duplicates: 0,
    missing: 0,
    redactions: 0,
  };

  events.forEach((event) => {
    const warnings = auditEvent(event);
    const status = classifyEventStatus(event, warnings);
    if (status.key === "valid") summary.valid++;
    else if (status.key === "diagnostic") summary.diagnostics++;
    else if (status.key === "duplicate") summary.duplicates++;
    else if (status.key === "missing") summary.missing++;
    else summary.warnings++;
    summary.redactions += event.eventData?._privacyRedactions?.length || 0;
  });

  return summary;
}

export function buildChecklist(
  events,
  expectedEvents = DEFAULT_EXPECTED_EVENTS,
  expectedPixels = {},
) {
  return normalizeExpectedEvents(expectedEvents).map((expected) => {
    const rule = findRule(expected.platform, expected.eventName);
    const matches = events.filter((event) =>
      eventMatchesExpected(event, expected.platform, expected.eventName),
    );
    const sortedMatches = [...matches].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );
    const best = sortedMatches[0] || null;
    const issues = best ? collectRuleIssues(best, rule, expectedPixels) : [];
    const hasRequiredIssue = issues.some((issue) =>
      issue.startsWith("Missing required parameter:"),
    );

    return {
      platform: expected.platform,
      eventName: expected.eventName,
      found: matches.length > 0,
      count: matches.length,
      status:
        matches.length === 0
          ? "missing"
          : hasRequiredIssue
            ? "missing_params"
            : issues.length > 0
              ? "warning"
              : "valid",
      issues,
      latestEvent: best,
      firstEvent: sortedMatches.at(-1) || null,
    };
  });
}

export function buildIssues(
  events,
  expectedEvents = DEFAULT_EXPECTED_EVENTS,
  expectedPixels = {},
) {
  const issues = [];

  events.forEach((event) => {
    const warnings = auditEvent(event);
    const status = classifyEventStatus(event, warnings);
    const rule = findRule(event.platform, event.eventName);
    const ruleIssues = collectRuleIssues(event, rule, expectedPixels);

    [...warnings, ...ruleIssues].forEach((message) => {
      const isRequiredParamIssue = String(message).startsWith(
        "Missing required parameter:",
      );
      issues.push({
        severity:
          status.key === "missing" || isRequiredParamIssue ? "error" : "warning",
        platform: event.platform,
        eventName: event.eventName,
        pixelId: event.pixelId,
        message,
        suggestion: getIssueFixSuggestion({ message, event }),
        timestamp: event.timestamp,
        eventId: event.id,
      });
    });

    if (event.duplicateCount > 0) {
      const message = `Duplicate firing detected ${event.duplicateCount} time(s).`;
      issues.push({
        severity: "warning",
        platform: event.platform,
        eventName: event.eventName,
        pixelId: event.pixelId,
        message,
        suggestion: getIssueFixSuggestion({ message, event }),
        timestamp: event.timestamp,
        eventId: event.id,
      });
    }
  });

  buildChecklist(events, expectedEvents, expectedPixels)
    .filter((item) => !item.found)
    .forEach((item) => {
      const message = "Expected event was not observed in this audit session.";
      issues.push({
        severity: "error",
        platform: item.platform,
        eventName: item.eventName,
        pixelId: "",
        message,
        suggestion: getIssueFixSuggestion({
          message,
          event: item,
        }),
        timestamp: Date.now(),
        eventId: null,
      });
    });

  return issues.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildHealthScore(
  events,
  expectedEvents = DEFAULT_EXPECTED_EVENTS,
  expectedPixels = {},
) {
  const checklist = buildChecklist(events, expectedEvents, expectedPixels);
  const issues = buildIssues(events, expectedEvents, expectedPixels);
  const summary = buildAuditSummary(events);

  const missingExpected = checklist.filter((item) => !item.found).length;
  const missingRequired = issues.filter((issue) =>
    issue.message.includes("Missing required parameter"),
  ).length;
  const duplicateFiring = issues.filter((issue) =>
    issue.message.includes("Duplicate firing"),
  ).length;
  const warnings = issues.filter(
    (issue) =>
      issue.severity === "warning" &&
      !issue.message.includes("Duplicate firing") &&
      !issue.message.includes("Missing required parameter"),
  ).length;
  const redactions = summary.redactions;

  const deductions = [
    Math.min(missingExpected * 12, 36),
    Math.min(missingRequired * 10, 30),
    Math.min(duplicateFiring * 6, 18),
    Math.min(warnings * 3, 15),
    Math.min(redactions * 5, 15),
  ];
  const score = clamp(100 - deductions.reduce((sum, value) => sum + value, 0));
  const verdict = healthVerdict(score);

  return {
    score,
    label: verdict.label,
    tone: verdict.tone,
    deductions: {
      missingExpected,
      missingRequired,
      duplicateFiring,
      warnings,
      redactions,
    },
  };
}

export function buildTimeline(events, expectedEvents = []) {
  const timelinePlan =
    Array.isArray(expectedEvents) && expectedEvents.length > 0
      ? normalizeExpectedEvents(expectedEvents).map((event) => ({
          platform: event.platform,
          eventName: event.eventName,
          label: event.eventName,
        }))
      : FALLBACK_TIMELINE;
  const orderedPlan = [...timelinePlan].sort((a, b) => {
    const rankDiff = eventRank(a.eventName) - eventRank(b.eventName);
    return rankDiff || a.platform.localeCompare(b.platform);
  });

  let lastObservedAt = 0;
  return orderedPlan.map((step, index) => {
    const matches = events
      .filter((event) => timelineMatches(event, step))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const first = matches[0] || null;
    const duplicateCount = matches.reduce(
      (total, event) => total + (event.duplicateCount || 0),
      0,
    );
    const outOfOrder = !!first && !!lastObservedAt && first.timestamp < lastObservedAt;
    if (first && first.timestamp > lastObservedAt) {
      lastObservedAt = first.timestamp;
    }

    return {
      index,
      platform: step.platform,
      eventName: step.eventName,
      label: step.label || step.eventName,
      status: !first ? "missing" : outOfOrder ? "out_of_order" : "observed",
      count: matches.length,
      duplicateCount,
      timestamp: first?.timestamp || null,
      eventId: first?.id || null,
      latestEventId: matches.at(-1)?.id || null,
    };
  });
}

export function getIssueFixSuggestion(issueOrInput, maybeEvent) {
  const message = String(issueOrInput?.message || issueOrInput || "");
  const event = issueOrInput?.event || maybeEvent || {};
  const lowered = message.toLowerCase();
  const eventName = String(event.eventName || "").toLowerCase();

  if (lowered.includes("duplicate firing")) {
    return "Check duplicate pixel installs, GTM triggers, or theme/app overlap.";
  }
  if (lowered.includes("pixel id mismatch")) {
    return "Compare the expected pixel ID with the active tag or container configuration.";
  }
  if (lowered.includes("privacy") || lowered.includes("plaintext")) {
    return "Hash or remove plaintext user data before sending it to ad platforms.";
  }
  if (lowered.includes("value")) {
    return "Check your Data Layer variable or GTM tag configuration for the conversion value.";
  }
  if (lowered.includes("currency")) {
    return "Send a 3-letter ISO currency such as USD or VND with the conversion event.";
  }
  if (
    lowered.includes("event_id") ||
    lowered.includes("eventdata.eid") ||
    lowered.includes("deduplication")
  ) {
    return "Add event_id to the browser event so it can deduplicate against server or CAPI events.";
  }
  if (lowered.includes("expected event") || lowered.includes("not observed")) {
    return `Trigger the ${event.eventName || "expected"} step again and confirm the GTM trigger or platform tag fires.`;
  }
  if (eventName.includes("purchase") || eventName.includes("completepayment")) {
    return "Review checkout success-page triggers and confirm value, currency, and transaction identifiers are mapped.";
  }
  return "Review the related GTM tag, trigger conditions, and platform pixel configuration.";
}

export function buildReportModel({
  events,
  auditRun,
  expectedEvents = DEFAULT_EXPECTED_EVENTS,
  expectedPixels = {},
  filters = null,
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  const summary = buildAuditSummary(safeEvents);
  const checklist = buildChecklist(safeEvents, expectedEvents, expectedPixels);
  const issues = buildIssues(safeEvents, expectedEvents, expectedPixels);
  const health = buildHealthScore(safeEvents, expectedEvents, expectedPixels);
  const timeline = buildTimeline(safeEvents, expectedEvents);
  const platformBreakdown = buildPlatformBreakdown(safeEvents);
  const generatedAt = Date.now();

  return {
    auditRun: auditRun || null,
    auditTarget: {
      label: formatAuditTargetLabel(
        auditRun?.url,
        auditRun?.domain || "Not available",
      ),
      url: auditRun?.url || "",
    },
    generatedAt,
    filters,
    events: safeEvents,
    expectedEvents,
    expectedPixels,
    summary,
    checklist,
    issues,
    health,
    timeline,
    platformBreakdown,
    auditWindow: {
      startedAt: auditRun?.startedAt || null,
      endedAt: auditRun?.endedAt || generatedAt,
    },
  };
}

export function buildProfessionalReportHtml(reportModel) {
  const model = reportModel?.summary
    ? reportModel
    : buildReportModel(reportModel || {});
  const auditTarget = model.auditTarget?.label || "Not available";
  const generatedAt = formatReportDate(model.generatedAt);
  const startedAt = formatReportDate(model.auditWindow.startedAt);
  const endedAt = formatReportDate(model.auditWindow.endedAt);
  const platforms =
    model.platformBreakdown.map((item) => item.platform).join(", ") || "None";
  const pixelIds =
    [
      ...new Set(
        model.platformBreakdown.flatMap((item) => item.pixelIds || []),
      ),
    ].join(", ") || "None";
  const passCount = model.checklist.filter((item) => item.status === "valid").length;
  const failCount = model.checklist.length - passCount;
  const duplicateCount = model.issues.filter((issue) =>
    issue.message.includes("Duplicate firing"),
  ).length;
  const redactions = model.summary.redactions;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OmniSignal Audit Report - ${escapeHtml(auditTarget)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #000000;
        --paper: #ffffff;
        --hairline: #e5e5e5;
        --soft: #f9f9f9;
        --cream: #fbf7f1;
        --lilac: #d7ccf5;
        --mint: #d9f99d;
        --coral: #ff7f6e;
        --pink: #fce7f3;
        --navy: #171a3a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 1.45;
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 48px 32px;
      }
      .eyebrow {
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 0;
        font-size: 64px;
        font-weight: 340;
        letter-spacing: -0.96px;
        line-height: 1.02;
      }
      h2 {
        margin: 0 0 20px;
        font-size: 28px;
        font-weight: 540;
        letter-spacing: -0.26px;
      }
      .cover {
        background: var(--lilac);
        border-radius: 24px;
        padding: 48px;
        margin-bottom: 32px;
      }
      .cover-top,
      .score-grid,
      .summary-grid,
      .timeline-grid {
        display: grid;
        gap: 16px;
      }
      .cover-top {
        grid-template-columns: 1fr auto;
        align-items: start;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 620;
      }
      .brand-mark {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: #000;
        color: #fff;
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 6px 12px;
        background: #000;
        color: #fff;
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        letter-spacing: .04em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .pill-soft { background: #fff; color: #000; border: 1px solid var(--hairline); }
      .pill-warning { background: #b45309; }
      .pill-error { background: #c53030; }
      .pill-valid { background: #0b7f4f; }
      .meta {
        margin-top: 32px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .metric {
        background: rgba(255,255,255,.54);
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 16px;
        padding: 16px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
        letter-spacing: -0.2px;
      }
      .score-card {
        background: var(--cream);
        border: 1px solid var(--hairline);
        border-radius: 24px;
        padding: 32px;
        margin: 32px 0;
      }
      .score-grid {
        grid-template-columns: minmax(220px, 320px) 1fr;
        align-items: center;
      }
      .score-number {
        font-size: 86px;
        line-height: .9;
        font-weight: 340;
        letter-spacing: -1.72px;
      }
      .section {
        margin: 32px 0;
        page-break-inside: avoid;
      }
      .summary-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      .summary-tile {
        border: 1px solid var(--hairline);
        border-radius: 16px;
        padding: 18px;
        background: #fff;
      }
      .summary-tile strong {
        display: block;
        font-size: 26px;
        letter-spacing: -0.3px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid var(--hairline);
        border-radius: 16px;
        overflow: hidden;
      }
      th,
      td {
        text-align: left;
        padding: 13px 14px;
        border-bottom: 1px solid var(--hairline);
        vertical-align: top;
      }
      th {
        background: var(--soft);
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      tr:last-child td { border-bottom: none; }
      .timeline-grid {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
      .timeline-step {
        border: 1px solid var(--hairline);
        border-radius: 16px;
        padding: 16px;
        min-height: 112px;
        background: #fff;
      }
      .timeline-step.missing {
        border-style: dashed;
        background: var(--cream);
      }
      .timeline-step.out_of_order,
      .timeline-step.duplicate {
        background: var(--pink);
      }
      .appendix {
        page-break-before: auto;
      }
      .payload {
        border: 1px solid var(--hairline);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 14px;
        background: var(--soft);
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 12px 0 0;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 12px;
      }
      footer {
        margin-top: 48px;
        padding-top: 20px;
        border-top: 1px solid var(--hairline);
        color: #333;
      }
      @media print {
        body { font-size: 12px; }
        .page { padding: 18mm; max-width: none; }
        .cover, .score-card { border-radius: 18px; }
        h1 { font-size: 42px; }
        .score-number { font-size: 64px; }
        .section, .score-card { page-break-inside: avoid; }
      }
      @media (max-width: 760px) {
        .page { padding: 24px 16px; }
        .cover { padding: 28px; }
        .cover-top,
        .score-grid,
        .meta,
        .summary-grid { grid-template-columns: 1fr; }
        h1 { font-size: 42px; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="cover">
        <div class="cover-top">
          <div class="brand">
            <span class="brand-mark">OS</span>
            <span>OmniSignal Pixel Tracker</span>
          </div>
          <span class="pill">${escapeHtml(model.health.label)}</span>
        </div>
        <p class="eyebrow" style="margin-top: 40px;">Tracking Audit Report</p>
        <h1>${escapeHtml(auditTarget)}</h1>
        <div class="meta">
          <div class="metric"><span class="eyebrow">Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
          <div class="metric"><span class="eyebrow">Audit Start</span><strong>${escapeHtml(startedAt)}</strong></div>
          <div class="metric"><span class="eyebrow">Audit End</span><strong>${escapeHtml(endedAt)}</strong></div>
        </div>
      </section>

      <section class="score-card">
        <div class="score-grid">
          <div>
            <p class="eyebrow">Tracking Health</p>
            <div class="score-number">${model.health.score}%</div>
            <span class="pill">${escapeHtml(model.health.label)}</span>
          </div>
          <div>
            <h2>Executive Summary</h2>
            <p>${escapeHtml(platforms)} detected. ${passCount} expected event(s) passed and ${failCount} need review before campaign spend starts.</p>
            <p><strong>Pixel IDs:</strong> ${escapeHtml(pixelIds)}</p>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="summary-grid">
          ${summaryTile("Total Events", model.summary.total)}
          ${summaryTile("Issues", model.issues.length)}
          ${summaryTile("Duplicates", duplicateCount)}
          ${summaryTile("Redactions", redactions)}
        </div>
      </section>

      <section class="section">
        <h2>Funnel Timeline</h2>
        <div class="timeline-grid">
          ${model.timeline.map(renderReportTimelineStep).join("")}
        </div>
      </section>

      <section class="section">
        <h2>Checklist</h2>
        <table>
          <thead>
            <tr><th>Platform</th><th>Expected Event</th><th>Status</th><th>Observed</th><th>Latest Time</th><th>Pixel ID</th></tr>
          </thead>
          <tbody>
            ${model.checklist.map(renderReportChecklistRow).join("")}
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Issues & Fixes</h2>
        <table>
          <thead>
            <tr><th>Severity</th><th>Platform</th><th>Event</th><th>Detected Problem</th><th>Suggested Fix</th></tr>
          </thead>
          <tbody>
            ${model.issues.length ? model.issues.map(renderReportIssueRow).join("") : `<tr><td colspan="5">No issues detected in this audit.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Platform Breakdown</h2>
        <table>
          <thead>
            <tr><th>Platform</th><th>Events</th><th>Pixel IDs</th><th>Warnings</th></tr>
          </thead>
          <tbody>
            ${model.platformBreakdown.map(renderPlatformRow).join("") || `<tr><td colspan="4">No platform events captured.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section appendix">
        <h2>Raw Payload Appendix</h2>
        ${model.events.map(renderPayloadBlock).join("") || `<p>No raw payloads captured.</p>`}
      </section>

      <footer class="eyebrow">
        Generated locally by OmniSignal. No audit data was sent to a server.
      </footer>
    </main>
  </body>
</html>`;
}

export function buildReportHtml(args) {
  return buildProfessionalReportHtml(buildReportModel(args));
}

export function buildPlatformBreakdown(events) {
  const map = new Map();
  events.forEach((event) => {
    if (!map.has(event.platform)) {
      map.set(event.platform, {
        platform: event.platform,
        count: 0,
        pixelIds: new Set(),
        warnings: 0,
      });
    }
    const item = map.get(event.platform);
    item.count += 1;
    if (event.pixelId) item.pixelIds.add(event.pixelId);
    const status = classifyEventStatus(event, auditEvent(event));
    if (status.key !== "valid" && status.key !== "diagnostic") item.warnings += 1;
  });

  return [...map.values()]
    .map((item) => ({ ...item, pixelIds: [...item.pixelIds] }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
}

export function mergeWorkspaceDraft(baseDraft = {}, patch = {}) {
  return {
    ...baseDraft,
    ...patch,
    filters: {
      ...(baseDraft.filters || {}),
      ...(patch.filters || {}),
    },
    expectedPixels:
      patch.expectedPixels !== undefined
        ? { ...(patch.expectedPixels || {}) }
        : { ...(baseDraft.expectedPixels || {}) },
    expectedEvents:
      patch.expectedEvents !== undefined
        ? [...(patch.expectedEvents || [])]
        : [...(baseDraft.expectedEvents || [])],
  };
}

function findRule(platform, eventName) {
  return AUDIT_RULES.find((rule) =>
    eventMatchesExpected({ platform, eventName }, rule.platform, rule.eventName),
  );
}

function eventMatchesExpected(event, platform, eventName) {
  if (platform !== "Any" && event.platform !== platform) return false;
  if (eventName === "Floodlight") return event.platform === "Floodlight";
  if (eventName === "Conversion") return event.eventName.startsWith("Conversion");
  return (
    normalizeEventName(canonicalEventName(event.platform, event.eventName)) ===
    normalizeEventName(canonicalEventName(platform, eventName))
  );
}

function canonicalEventName(platform, eventName = "") {
  if (platform === "TikTok" && normalizeEventName(eventName) === "pageview") {
    return "Pageview";
  }
  return eventName;
}

function collectRuleIssues(event, rule, expectedPixels = {}) {
  const issues = [];
  if (!rule) return issues;

  const expectedPixel = expectedPixels[event.platform];
  if (expectedPixel && event.pixelId !== expectedPixel) {
    issues.push(`Pixel ID mismatch: expected ${expectedPixel}, observed ${event.pixelId}.`);
  }

  (rule.requiredParams || []).forEach((path) => {
    if (!hasPath(event, path)) {
      issues.push(`Missing required parameter: ${path}.`);
    }
  });

  (rule.recommendedParams || []).forEach((path) => {
    if (!hasPath(event, path)) {
      issues.push(`Missing recommended parameter: ${path}.`);
    }
  });

  return issues;
}

function hasPath(event, path) {
  if (path.includes("|")) {
    return path.split("|").some((candidate) => hasPath(event, candidate));
  }
  if (path === "pixelId") return !!event.pixelId && event.pixelId !== "Unknown";
  if (path.startsWith("eventData.")) {
    const directKey = path.replace("eventData.", "");
    if (
      event.eventData?.[directKey] !== undefined &&
      event.eventData?.[directKey] !== ""
    ) {
      return true;
    }
  }
  const parts = path.split(".");
  let current = parts[0] === "eventData" ? event.eventData : event;
  for (let i = parts[0] === "eventData" ? 1 : 0; i < parts.length; i++) {
    if (
      current == null ||
      current[parts[i]] === undefined ||
      current[parts[i]] === ""
    ) {
      return false;
    }
    current = current[parts[i]];
  }
  return true;
}

function healthVerdict(score) {
  if (score >= 90) return { label: "Healthy", tone: "healthy" };
  if (score >= 70) return { label: "Needs Review", tone: "review" };
  if (score >= 50) return { label: "At Risk", tone: "risk" };
  return { label: "Blocked", tone: "blocked" };
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function eventRank(eventName = "") {
  const normalized = normalizeEventName(eventName);
  return FUNNEL_RANKS.get(normalized) || 999;
}

function normalizeEventName(eventName = "") {
  return String(eventName)
    .replace(/^Conversion\s*\(.+\)$/i, "Conversion")
    .replace(/[^a-z0-9_ ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "");
}

function timelineMatches(event, step) {
  if (step.platform !== "Any" && event.platform !== step.platform) return false;
  const eventName = normalizeEventName(event.eventName);
  const stepName = normalizeEventName(step.eventName);
  if (stepName === "pageview") return ["pageview", "page_view"].includes(eventName);
  if (stepName === "viewcontent") {
    return ["viewcontent", "view_content"].includes(eventName);
  }
  if (stepName === "addtocart") {
    return ["addtocart", "add_to_cart"].includes(eventName);
  }
  if (stepName === "lead") {
    return ["lead", "begin_checkout", "checkout"].includes(eventName);
  }
  if (stepName === "purchase") {
    return ["purchase", "completepayment", "conversion", "floodlight"].some(
      (candidate) => eventName.includes(candidate),
    );
  }
  if (step.eventName === "Conversion") return event.eventName.startsWith("Conversion");
  if (step.eventName === "Floodlight") return event.platform === "Floodlight";
  return event.eventName === step.eventName;
}

function formatReportDate(timestamp) {
  if (!timestamp) return "Not available";
  return new Date(timestamp).toLocaleString();
}

function summaryTile(label, value) {
  return `<div class="summary-tile"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderReportTimelineStep(step) {
  const label =
    step.status === "missing"
      ? "Missing"
      : step.status === "out_of_order"
        ? "Out of Order"
        : "Observed";
  const duplicate = step.duplicateCount
    ? `<span class="pill pill-warning">Dup ${step.duplicateCount}</span>`
    : "";
  return `<div class="timeline-step ${escapeHtml(step.status)}">
    <span class="eyebrow">${escapeHtml(step.platform)}</span>
    <h3 style="margin: 8px 0 12px; font-size: 18px;">${escapeHtml(step.label)}</h3>
    <span class="pill ${step.status === "observed" ? "pill-valid" : step.status === "missing" ? "pill-soft" : "pill-warning"}">${escapeHtml(label)}</span>
    ${duplicate}
  </div>`;
}

function renderReportChecklistRow(item) {
  const latestTime = item.latestEvent ? formatTime(item.latestEvent.timestamp) : "Not observed";
  const pixelId = item.latestEvent?.pixelId || "Not available";
  return `<tr>
    <td>${escapeHtml(item.platform)}</td>
    <td>${escapeHtml(item.eventName)}</td>
    <td><span class="pill ${item.status === "valid" ? "pill-valid" : item.status === "missing" || item.status === "missing_params" ? "pill-error" : "pill-warning"}">${escapeHtml(item.status.replace("_", " "))}</span></td>
    <td>${item.count}</td>
    <td>${escapeHtml(latestTime)}</td>
    <td>${escapeHtml(pixelId)}</td>
  </tr>`;
}

function renderReportIssueRow(issue) {
  return `<tr>
    <td><span class="pill ${issue.severity === "error" ? "pill-error" : "pill-warning"}">${escapeHtml(issue.severity)}</span></td>
    <td>${escapeHtml(issue.platform)}</td>
    <td>${escapeHtml(issue.eventName)}</td>
    <td>${escapeHtml(issue.message)}</td>
    <td>${escapeHtml(issue.suggestion || getIssueFixSuggestion(issue))}</td>
  </tr>`;
}

function renderPlatformRow(item) {
  return `<tr>
    <td>${escapeHtml(item.platform)}</td>
    <td>${item.count}</td>
    <td>${escapeHtml(item.pixelIds.join(", ") || "None")}</td>
    <td>${item.warnings}</td>
  </tr>`;
}

function renderPayloadBlock(event) {
  const meta = getPlatformMeta(event.platform);
  const payload = JSON.stringify(event.eventData || {}, null, 2);
  return `<div class="payload">
    <span class="eyebrow">${escapeHtml(event.platform)} / ${escapeHtml(event.eventName)}</span>
    <p><strong>${escapeHtml(meta.label || event.platform)}</strong> - ${escapeHtml(event.pixelId || "No pixel ID")}</p>
    <pre>${escapeHtml(payload)}</pre>
  </div>`;
}

export function platformBadge(platform) {
  const meta = getPlatformMeta(platform);
  return `<img src="${escapeHtml(meta.icon || "")}" width="16" height="16" aria-hidden="true" />`;
}
