import {
  auditEvent,
  classifyEventStatus,
  escapeHtml,
  formatTime,
  getPlatformMeta,
} from "./utils.js";
import {
  AUDIT_RULES,
  AUDIT_PRESETS,
  DEFAULT_EXPECTED_EVENTS,
  EXPECTATION_IMPORT_TEMPLATE,
  EXPECTATION_PLATFORM_ALIASES,
  FALLBACK_TIMELINE,
  FUNNEL_RANKS,
  SUPPORTED_EXPECTATION_PLATFORMS,
} from "./audit-rules.js";
import {
  EVIDENCE_SOURCES,
  EVIDENCE_SOURCE_META,
  canonicalEventName as catalogCanonicalEventName,
  canonicalPlatform as catalogCanonicalPlatform,
  getEvidenceSourceForEvent,
  getEvidenceSourceMeta,
  normalizeEventNameKey,
} from "../../shared/tracking-catalog.js";

export {
  AUDIT_PRESETS,
  AUDIT_RULES,
  DEFAULT_EXPECTED_EVENTS,
  EXPECTATION_IMPORT_TEMPLATE,
};

export const ISSUE_CATEGORY_LABELS = Object.freeze({
  installation: "Installation",
  event_quality: "Event Quality",
  required_params: "Required Params",
  deduplication: "Deduplication",
  consent: "Consent",
  google_tag_health: "Google Tag Health",
  privacy: "Privacy",
  duplicate_firing: "Duplicate Firing",
  parser_confidence: "Parser Confidence",
  source_of_truth: "Source of Truth",
});

const REPORT_BRAND_LOGO_SRC =
  "data:image/png;base64,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";

export function createAuditIssue(input = {}) {
  const event = input.event || {};
  const message = String(input.message || "Review this tracking signal.");
  const category = input.category || issueCategoryForMessage(message);
  const eventEvidenceSource = event.evidenceSource
    ? getEvidenceSourceForEvent(event)
    : getEvidenceSourceForEvent({ source: input.source || event.source || "network" });
  return {
    severity: input.severity || "warning",
    category,
    platform: input.platform || event.platform || "Any",
    eventName: input.eventName || event.eventName || "Audit",
    pixelId: input.pixelId || event.pixelId || "",
    message,
    evidence: input.evidence || evidenceForIssue(message, event),
    suggestion: input.suggestion || getIssueFixSuggestion({ message, event, category }),
    source: input.source || event.source || "audit",
    evidenceSource: input.evidenceSource || eventEvidenceSource,
    timestamp: input.timestamp || event.timestamp || Date.now(),
    eventId: input.eventId === undefined ? event.id || null : input.eventId,
    heuristic: !!input.heuristic,
  };
}

export function normalizeExpectedEvent(event) {
  const platform = canonicalPlatform(event.platform);
  return {
    ...event,
    platform,
    eventName: canonicalEventName(platform, event.eventName),
  };
}

export function normalizeExpectedEvents(events = []) {
  return events.map(normalizeExpectedEvent);
}

export function parseExpectationImportJson(rawJson) {
  let parsed;
  try {
    parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  } catch (_e) {
    throw new Error("Invalid JSON. Check quotes, commas, and brackets.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Import must be a JSON object or an array of expected events.");
  }

  const rawEvents = Array.isArray(parsed)
    ? parsed
    : parsed.expectedEvents || parsed.events || [];
  const rawPixels = Array.isArray(parsed)
    ? {}
    : parsed.expectedPixels || parsed.pixels || {};

  if (!Array.isArray(rawEvents)) {
    throw new Error("expectedEvents must be an array.");
  }
  if (!rawPixels || typeof rawPixels !== "object" || Array.isArray(rawPixels)) {
    throw new Error("expectedPixels must be an object.");
  }

  const expectedPixels = {};
  Object.entries(rawPixels).forEach(([platform, value]) => {
    const canonical = canonicalPlatform(platform);
    const pixelId = String(value || "").trim();
    if (SUPPORTED_EXPECTATION_PLATFORMS.has(canonical) && pixelId) {
      expectedPixels[canonical] = pixelId;
    }
  });

  const seen = new Set();
  const expectedEvents = [];
  rawEvents.forEach((event) => {
    if (!event || typeof event !== "object") return;
    const platform = canonicalPlatform(event.platform);
    const eventName = String(
      event.eventName || event.event || event.name || "",
    ).trim();
    if (!SUPPORTED_EXPECTATION_PLATFORMS.has(platform) || !eventName) return;
    const normalized = normalizeExpectedEvent({ platform, eventName });
    const key = `${normalized.platform}::${normalized.eventName}`;
    if (seen.has(key)) return;
    seen.add(key);
    expectedEvents.push(normalized);
  });

  return {
    expectedPixels,
    expectedEvents,
    skippedEvents: rawEvents.length - expectedEvents.length,
  };
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
  const normalizedExpectedEvents = normalizeExpectedEvents(expectedEvents);

  events.forEach((event) => {
    const warnings = auditEvent(event);
    const status = classifyEventStatus(event, warnings);
    const rule = findRule(event.platform, event.eventName);
    const ruleIssues = collectRuleIssues(event, rule, expectedPixels);

    [...warnings, ...ruleIssues].forEach((message) => {
      const isRequiredParamIssue = String(message).startsWith(
        "Missing required parameter:",
      );
      issues.push(createAuditIssue({
        severity:
          status.key === "missing" || isRequiredParamIssue ? "error" : "warning",
        category: isRequiredParamIssue
          ? "required_params"
          : issueCategoryForMessage(message),
        message,
        event,
      }));
    });

    if (event.duplicateCount > 0) {
      const message = `Duplicate firing detected ${event.duplicateCount} time(s).`;
      issues.push(createAuditIssue({
        severity: "warning",
        category: "duplicate_firing",
        message,
        event,
        evidence: `${event.platform} ${event.eventName} was merged ${event.duplicateCount} time(s) in the duplicate window.`,
      }));
    }

    issues.push(...buildObservedEventIssues(event));
  });

  buildChecklist(events, normalizedExpectedEvents, expectedPixels)
    .filter((item) => !item.found)
    .forEach((item) => {
      const message = "Expected event was not observed in this audit session.";
      issues.push(createAuditIssue({
        severity: "error",
        category: "installation",
        platform: item.platform,
        eventName: item.eventName,
        pixelId: "",
        message,
        evidence: `${item.platform} ${item.eventName} did not appear in network, DataLayer, or scanner evidence for this audit window.`,
        suggestion: getIssueFixSuggestion({ message, event: item }),
        timestamp: Date.now(),
        eventId: null,
      }));
    });

  issues.push(
    ...buildScannerIssues({
      events,
      expectedEvents: normalizedExpectedEvents,
      expectedPixels,
    }),
  );
  issues.push(...buildSourceOfTruthIssues());

  return dedupeIssues(issues).sort((a, b) => b.timestamp - a.timestamp);
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

function issueCategoryForMessage(message = "") {
  const lowered = String(message).toLowerCase();
  if (lowered.includes("plaintext") || lowered.includes("privacy") || lowered.includes("redacted")) {
    return "privacy";
  }
  if (lowered.includes("duplicate firing")) return "duplicate_firing";
  if (lowered.includes("event_id") || lowered.includes("dedup")) return "deduplication";
  if (lowered.includes("missing required parameter")) return "required_params";
  if (lowered.includes("consent")) return "consent";
  if (lowered.includes("conversion linker") || lowered.includes("gtag") || lowered.includes("google tag")) {
    return "google_tag_health";
  }
  if (lowered.includes("pixel id mismatch") || lowered.includes("expected event")) {
    return "installation";
  }
  if (lowered.includes("unknown") || lowered.includes("parser")) return "parser_confidence";
  if (
    lowered.includes("source of truth") ||
    lowered.includes("external account") ||
    lowered.includes("not connected")
  ) {
    return "source_of_truth";
  }
  return "event_quality";
}

function evidenceForIssue(message, event = {}) {
  const source = event.source || "audit";
  const platform = event.platform || "Any";
  const name = event.eventName || "event";
  const id = event.pixelId || "Unknown";
  return `${source} evidence: ${platform} ${name} / ${id}. ${message}`;
}

function isConversionLike(event = {}) {
  const normalized = normalizeEventName(event.eventName);
  return [
    "purchase",
    "completepayment",
    "placeanorder",
    "lead",
    "conversion",
    "begincheckout",
    "begin_checkout",
    "floodlight",
  ].some((candidate) => normalized.includes(candidate));
}

function buildObservedEventIssues(event) {
  const issues = [];
  if (!event || event.source === "scanner" || event.isDiagnostic) return issues;

  if (!event.pixelId || event.pixelId === "Unknown") {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "parser_confidence",
      event,
      message: "Pixel or tag ID could not be confidently parsed.",
      evidence: `The ${event.platform} request was captured, but its ID field resolved to Unknown.`,
      heuristic: true,
    }));
  }

  if (event.eventName === "Unknown") {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "parser_confidence",
      event,
      message: "Event name could not be confidently parsed.",
      evidence: "The request matched a platform endpoint, but no known event name parameter was present.",
      heuristic: true,
    }));
  }

  (event.diagnostics?.validationIssues || []).forEach((validationIssue) => {
    issues.push(createAuditIssue({
      severity: event.confidence === "low" ? "warning" : "info",
      category: "parser_confidence",
      event,
      message: validationIssue,
      evidence: `Parser ${event.sourceParser || "unknown"} emitted confidence ${event.confidence || "medium"}.`,
      heuristic: true,
    }));
  });

  if (isConversionLike(event)) {
    if (
      event.platform === "Meta" &&
      !hasPath(event, "eventData.event_id|eventData.eid")
    ) {
      issues.push(createAuditIssue({
        severity: "warning",
        category: "deduplication",
        event,
        message: "Conversion-like Meta event is missing event_id/eid for browser/server deduplication.",
        evidence: `${event.eventName} payload has no eventData.event_id or eventData.eid value.`,
      }));
    }

    if (event.platform === "TikTok" && !hasPath(event, "eventData.event_id")) {
      issues.push(createAuditIssue({
        severity: "warning",
        category: "deduplication",
        event,
        message: "Conversion-like TikTok event is missing event_id for Pixel/Events API deduplication.",
        evidence: `${event.eventName} payload has no eventData.event_id value.`,
      }));
    }
  }

  if (
    event.platform === "GA4" &&
    event.eventName === "purchase" &&
    !hasPath(event, "eventData.ep.transaction_id")
  ) {
    issues.push(createAuditIssue({
      severity: "error",
      category: "required_params",
      event,
      message: "GA4 purchase is missing transaction_id.",
      evidence: "eventData.ep.transaction_id was not present on the captured GA4 purchase hit.",
    }));
  }

  return issues;
}

function buildSourceOfTruthIssues() {
  return [
    createAuditIssue({
      severity: "info",
      category: "source_of_truth",
      platform: "External Account",
      eventName: "Account Diagnostics",
      pixelId: "",
      message: "External account diagnostics are not connected in this V1 report.",
      evidence:
        "This report treats local network, DataLayer, and scanner evidence as the agency QA source of truth; account-side delivery still needs platform tools until API integrations are added.",
      suggestion:
        "Use Meta Events Manager, TikTok Events Manager, Google Tag Diagnostics, or platform account tools for final server/account-side confirmation.",
      source: "audit",
      evidenceSource: EVIDENCE_SOURCES.EXTERNAL_ACCOUNT,
      eventId: null,
      timestamp: Date.now(),
    }),
  ];
}

function latestScannerEvent(events = []) {
  return [...events]
    .filter((event) => event.source === "scanner")
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
}

function hasObservedPlatform(events, platform) {
  if (platform === "Google") {
    return events.some((event) =>
      ["GA4", "Google Ads", "Floodlight"].includes(event.platform) &&
      event.source !== "scanner" &&
      !event.isDiagnostic,
    );
  }
  return events.some(
    (event) =>
      event.platform === platform &&
      event.source !== "scanner" &&
      !event.isDiagnostic,
  );
}

function expectedPlatformSet(expectedEvents = [], expectedPixels = {}) {
  const platforms = new Set(expectedEvents.map((event) => event.platform));
  Object.keys(expectedPixels || {}).forEach((platform) => platforms.add(platform));
  return platforms;
}

function buildScannerIssues({ events, expectedEvents, expectedPixels }) {
  const scannerEvent = latestScannerEvent(events);
  if (!scannerEvent) return [];

  const scanner = scannerEvent.eventData || {};
  const issues = [];
  const expectedPlatforms = expectedPlatformSet(expectedEvents, expectedPixels);
  const googleExpected =
    expectedPlatforms.has("GA4") ||
    expectedPlatforms.has("Google Ads") ||
    expectedPlatforms.has("Floodlight");
  const googleObserved = hasObservedPlatform(events, "Google");

  if (scanner.scannerError) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "parser_confidence",
      platform: "Diagnostics",
      eventName: "Tag Scanner Snapshot",
      pixelId: "Local Scanner",
      message: "Local tag scanner could not complete.",
      evidence: String(scanner.scannerError),
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  [
    ["Meta", scanner.platforms?.Meta],
    ["TikTok", scanner.platforms?.TikTok],
  ].forEach(([platform, detected]) => {
    if (!expectedPlatforms.has(platform)) return;
    const observed = hasObservedPlatform(events, platform);
    if (!detected && !observed) {
      issues.push(createAuditIssue({
        severity: "error",
        category: "installation",
        platform,
        eventName: "Installation",
        pixelId: expectedPixels?.[platform] || "",
        message: `${platform} tag was expected but not detected locally.`,
        evidence: "No matching script/global scanner evidence and no captured network event were observed.",
        source: "scanner",
        eventId: scannerEvent.id,
        timestamp: scannerEvent.timestamp,
        heuristic: true,
      }));
    } else if (detected && !observed) {
      issues.push(createAuditIssue({
        severity: "warning",
        category: "installation",
        platform,
        eventName: "Installation",
        pixelId: expectedPixels?.[platform] || "",
        message: `${platform} tag appears installed but no event fired in this audit window.`,
        evidence: "Scanner saw a platform script/global, but no matching captured event was stored.",
        source: "scanner",
        eventId: scannerEvent.id,
        timestamp: scannerEvent.timestamp,
        heuristic: true,
      }));
    }
  });

  if (googleExpected && !scanner.platforms?.Google && !googleObserved) {
    issues.push(createAuditIssue({
      severity: "error",
      category: "installation",
      platform: "Google",
      eventName: "Installation",
      pixelId: expectedPixels?.GA4 || expectedPixels?.["Google Ads"] || "",
      message: "Google tag or GTM container was expected but not detected locally.",
      evidence: "No Google script/global scanner evidence and no GA4, Google Ads, or Floodlight hits were captured.",
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  } else if (googleExpected && scanner.platforms?.Google && !googleObserved) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "installation",
      platform: "Google",
      eventName: "Installation",
      pixelId: expectedPixels?.GA4 || expectedPixels?.["Google Ads"] || "",
      message: "Google tag or GTM container appears installed but no Google event fired in this audit window.",
      evidence: "Scanner saw local Google tag evidence, but no GA4, Google Ads, or Floodlight hit was captured.",
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  if ((googleExpected || googleObserved) && scanner.google?.eventBeforeConfig) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "google_tag_health",
      platform: "Google",
      eventName: "gtag/dataLayer order",
      pixelId: "",
      message: "A gtag/DataLayer event appeared before a config command.",
      evidence: `first event index ${scanner.google.firstEventIndex}, first config index ${scanner.google.firstConfigIndex}.`,
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  if ((googleExpected || googleObserved) && scanner.platforms?.Google && !scanner.google?.consentSeen) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "consent",
      platform: "Google",
      eventName: "Consent Mode",
      pixelId: "",
      message: "No local Google consent command was observed before or during the scan.",
      evidence: "The scanner did not see a dataLayer/gtag consent command in the captured command history.",
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  const hasAdsOrFloodlight = events.some((event) =>
    ["Google Ads", "Floodlight"].includes(event.platform) &&
    event.source !== "scanner",
  );
  if (
    hasAdsOrFloodlight &&
    scanner.platforms?.Google &&
    !scanner.cookies?.gclAw &&
    !scanner.cookies?.gclAu
  ) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "google_tag_health",
      platform: "Google",
      eventName: "Conversion Linker",
      pixelId: "",
      message: "No visible _gcl_* linker cookie was found during local scan.",
      evidence: "This is heuristic local evidence only; account-side Tag Diagnostics is still the source of truth.",
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  const lateScripts = (scanner.scripts || []).filter((script) => {
    const host = script.host || "";
    return (
      !script.inHead &&
      (host.includes("facebook") || host.includes("tiktok"))
    );
  });
  if (lateScripts.length > 0) {
    issues.push(createAuditIssue({
      severity: "warning",
      category: "installation",
      platform: "Social Pixels",
      eventName: "Script Placement",
      pixelId: "",
      message: "One or more social pixel scripts were not detected in the document head.",
      evidence: lateScripts
        .map((script) => `${script.host}${script.path}`)
        .slice(0, 3)
        .join(", "),
      source: "scanner",
      eventId: scannerEvent.id,
      timestamp: scannerEvent.timestamp,
      heuristic: true,
    }));
  }

  return issues;
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = [
      issue.category,
      issue.platform,
      issue.eventName,
      issue.pixelId,
      issue.message,
      issue.eventId || "",
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildIssueSummary(issues) {
  const summary = {};
  Object.keys(ISSUE_CATEGORY_LABELS).forEach((category) => {
    summary[category] = { total: 0, errors: 0, warnings: 0, info: 0 };
  });
  issues.forEach((issue) => {
    const bucket = summary[issue.category] || (summary[issue.category] = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
    });
    bucket.total += 1;
    if (issue.severity === "error") bucket.errors += 1;
    else if (issue.severity === "info") bucket.info += 1;
    else bucket.warnings += 1;
  });
  return summary;
}

function buildScannerSummary(events = []) {
  const scannerEvent = latestScannerEvent(events);
  if (!scannerEvent) {
    return {
      observed: false,
      platforms: {},
      google: {},
      cookies: {},
      scripts: [],
    };
  }
  const data = scannerEvent.eventData || {};
  return {
    observed: true,
    timestamp: scannerEvent.timestamp,
    platforms: data.platforms || {},
    google: data.google || {},
    cookies: data.cookies || {},
    scripts: data.scripts || [],
  };
}

function buildEvidenceSourceSummary(events = []) {
  const counts = events.reduce((map, event) => {
    const evidenceSource = getEvidenceSourceForEvent(event);
    map[evidenceSource] = (map[evidenceSource] || 0) + 1;
    return map;
  }, {});

  return Object.entries(EVIDENCE_SOURCE_META).map(([key, meta]) => {
    const count = counts[key] || 0;
    const status =
      key === EVIDENCE_SOURCES.EXTERNAL_ACCOUNT
        ? "not_connected"
        : count > 0
          ? meta.status
          : "not_observed";
    return {
      key,
      label: meta.label,
      description: meta.description,
      count,
      status,
      statusLabel:
        status === "not_connected"
          ? "Not connected"
          : status === "not_observed"
            ? "Not observed"
            : count === 1
              ? "1 record"
              : `${count} records`,
    };
  });
}

function maxParserSchemaVersion(events = []) {
  return events.reduce(
    (max, event) => Math.max(max, Number(event.parserSchemaVersion || 1)),
    1,
  );
}

export function getIssueFixSuggestion(issueOrInput, maybeEvent) {
  const message = String(issueOrInput?.message || issueOrInput || "");
  const event = issueOrInput?.event || maybeEvent || {};
  const category = issueOrInput?.category || issueCategoryForMessage(message);
  const lowered = message.toLowerCase();
  const eventName = String(event.eventName || "").toLowerCase();

  if (category === "installation") {
    return "Confirm the tag is installed on this page, fires inside the audited flow, and matches the expected pixel or tag ID.";
  }
  if (category === "google_tag_health") {
    return "Review Google tag/GTM setup, config order, conversion linker, and the selected tag ID or conversion label.";
  }
  if (category === "consent") {
    return "Verify Consent Mode default/update commands fire before Google measurement tags and match your CMP policy.";
  }
  if (category === "parser_confidence") {
    return "Open the raw payload and confirm the ID/event-name parameter; add a fixture if this endpoint is valid.";
  }
  if (category === "source_of_truth") {
    return "Use the relevant platform account diagnostics for final delivery confirmation when local QA needs account-side proof.";
  }
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
  options = {},
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  const summary = buildAuditSummary(safeEvents);
  const checklist = buildChecklist(safeEvents, expectedEvents, expectedPixels);
  const issues = buildIssues(safeEvents, expectedEvents, expectedPixels);
  const health = buildHealthScore(safeEvents, expectedEvents, expectedPixels);
  const timeline = buildTimeline(safeEvents, expectedEvents);
  const platformBreakdown = buildPlatformBreakdown(safeEvents);
  const issueSummary = buildIssueSummary(issues);
  const scannerSummary = buildScannerSummary(safeEvents);
  const evidenceSources = buildEvidenceSourceSummary(safeEvents);
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
    options,
    events: safeEvents,
    expectedEvents,
    expectedPixels,
    summary,
    issueSummary,
    scannerSummary,
    evidenceSources,
    parserSchemaVersion: maxParserSchemaVersion(safeEvents),
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
  const actionableIssueCount = model.issues.filter(
    (issue) => issue.severity !== "info",
  ).length;
  const duplicateCount = model.issues.filter((issue) =>
    issue.message.includes("Duplicate firing"),
  ).length;
  const redactions = model.summary.redactions;
  const healthClass = `tone-${escapeHtml(model.health.tone)}`;
  const includePayloadAppendix =
    model.options?.includePayloadAppendix !== false;
  const actionLine =
    actionableIssueCount > 0
      ? `${actionableIssueCount} issue(s) need review before campaign spend starts.`
      : "No blocking issues detected in this audit window.";
  const issueCategoryTiles =
    Object.entries(model.issueSummary || {})
      .filter(([, item]) => item.total > 0)
      .map(([category, item]) =>
        summaryTile(
          ISSUE_CATEGORY_LABELS[category] || category,
          `${item.total} issue(s)`,
          item.errors ? "accent-pink" : "accent-cream",
        ),
      )
      .join("") || summaryTile("Issue Categories", "None", "accent-mint");
  const scannerSummary = model.scannerSummary || {};
  const scannerPlatforms = scannerSummary.observed
    ? Object.entries(scannerSummary.platforms || {})
        .filter(([, detected]) => detected)
        .map(([platform]) => platform)
        .join(", ") || "No platform tags detected"
    : "No scanner snapshot captured";
  const scannerScripts = scannerSummary.observed
    ? String((scannerSummary.scripts || []).length)
    : "0";
  const googleSummary = scannerSummary.google || {};
  const cookieSummary = scannerSummary.cookies || {};
  const dedupeIssues = model.issues.filter((issue) =>
    ["deduplication", "duplicate_firing"].includes(issue.category),
  );
  const tagHealthIssues = model.issues.filter((issue) =>
    ["installation", "consent", "google_tag_health", "parser_confidence"].includes(
      issue.category,
    ),
  );
  const evidenceSourceTiles = (model.evidenceSources || [])
    .map((item) =>
      summaryTile(
        item.label,
        item.statusLabel,
        item.key === EVIDENCE_SOURCES.EXTERNAL_ACCOUNT
          ? "accent-cream"
          : item.count > 0
            ? "accent-mint"
            : "",
      ),
    )
    .join("");

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
        max-width: 1180px;
        margin: 0 auto;
        padding: 48px 32px 64px;
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
      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 620;
      }
      p { margin: 0; }
      .lead {
        max-width: 720px;
        margin-top: 18px;
        font-size: 22px;
        font-weight: 330;
        line-height: 1.34;
      }
      .cover {
        background: var(--lilac);
        border-radius: 24px;
        padding: 48px;
        margin-bottom: 32px;
      }
      .cover-top,
      .cover-grid,
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
      .cover-grid {
        grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
        gap: 32px;
        align-items: stretch;
        margin-top: 40px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 620;
      }
      .brand-mark {
        display: inline-block;
        width: 34px;
        height: 34px;
        object-fit: contain;
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
      .health-panel {
        display: grid;
        align-content: center;
        gap: 14px;
        min-height: 260px;
        border-radius: 24px;
        background: #fff;
        border: 1px solid rgba(0,0,0,.08);
        padding: 28px;
      }
      .health-panel.tone-healthy { background: var(--mint); }
      .health-panel.tone-review { background: var(--cream); }
      .health-panel.tone-risk,
      .health-panel.tone-blocked { background: var(--pink); }
      .health-panel .score-number {
        font-size: 92px;
        line-height: .9;
        font-weight: 340;
        letter-spacing: -1.72px;
      }
      .meta {
        margin-top: 28px;
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
        overflow-wrap: anywhere;
      }
      .score-card {
        background: #fff;
        border: 1px solid var(--hairline);
        border-radius: 24px;
        padding: 28px;
        margin: 32px 0;
      }
      .score-grid {
        grid-template-columns: minmax(220px, 300px) 1fr;
        align-items: center;
      }
      .section {
        margin: 40px 0;
        page-break-inside: avoid;
      }
      .section-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .summary-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      .summary-tile {
        border: 1px solid var(--hairline);
        border-radius: 16px;
        padding: 20px;
        background: #fff;
      }
      .summary-tile.accent-lilac { background: var(--lilac); }
      .summary-tile.accent-cream { background: var(--cream); }
      .summary-tile.accent-mint { background: var(--mint); }
      .summary-tile.accent-pink { background: var(--pink); }
      .summary-tile strong {
        display: block;
        margin-top: 8px;
        font-size: 26px;
        letter-spacing: -0.3px;
      }
      .scanner-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .scanner-card {
        border: 1px solid var(--hairline);
        border-radius: 16px;
        background: #fff;
        padding: 18px;
      }
      .scanner-card strong {
        display: block;
        margin-top: 8px;
        font-size: 20px;
        overflow-wrap: anywhere;
      }
      .evidence {
        display: block;
        margin-top: 6px;
        color: #444;
        font-size: 13px;
      }
      .executive-card {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(240px, .9fr);
        gap: 20px;
        border-radius: 24px;
        background: var(--cream);
        padding: 28px;
      }
      .executive-card strong {
        font-size: 24px;
        font-weight: 540;
        letter-spacing: -0.26px;
      }
      .executive-stack {
        display: grid;
        gap: 10px;
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
      .timeline-step h3 {
        margin: 10px 0 14px;
        font-size: 18px;
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
        margin-bottom: 14px;
        background: var(--soft);
        overflow: hidden;
      }
      .payload summary {
        cursor: pointer;
        padding: 16px;
        list-style: none;
      }
      .payload summary::-webkit-details-marker { display: none; }
      .payload-body {
        border-top: 1px solid var(--hairline);
        padding: 0 16px 16px;
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
        .health-panel .score-number { font-size: 64px; }
        .section, .score-card { page-break-inside: avoid; }
      }
      @media (max-width: 760px) {
        .page { padding: 24px 16px; }
        .cover { padding: 28px; }
        .cover-top,
        .cover-grid,
        .score-grid,
        .executive-card,
        .meta,
        .scanner-grid,
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
            <img class="brand-mark" src="${REPORT_BRAND_LOGO_SRC}" alt="" />
            <span>OmniSignal Pixel Tracker</span>
          </div>
          <span class="pill">${escapeHtml(model.health.label)}</span>
        </div>
        <div class="cover-grid">
          <div>
            <p class="eyebrow">Tracking Audit Report</p>
            <h1>${escapeHtml(auditTarget)}</h1>
            <p class="lead">${escapeHtml(actionLine)}</p>
          </div>
          <aside class="health-panel ${healthClass}">
            <p class="eyebrow">Tracking Health</p>
            <div class="score-number">${model.health.score}%</div>
            <span class="pill">${escapeHtml(model.health.label)}</span>
          </aside>
        </div>
        <div class="meta">
          <div class="metric"><span class="eyebrow">Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
          <div class="metric"><span class="eyebrow">Audit Start</span><strong>${escapeHtml(startedAt)}</strong></div>
          <div class="metric"><span class="eyebrow">Audit End</span><strong>${escapeHtml(endedAt)}</strong></div>
        </div>
      </section>

      <section class="section executive-card">
        <div>
          <p class="eyebrow">Executive Summary</p>
          <strong>${passCount} passed / ${failCount} need review</strong>
          <p class="lead" style="font-size: 20px;">${escapeHtml(platforms)} detected. Use this report to align media, tracking, and development teams before spend ramps.</p>
        </div>
        <div class="executive-stack">
          <div class="summary-tile accent-mint"><span class="eyebrow">Pixel IDs</span><strong>${escapeHtml(pixelIds)}</strong></div>
          <div class="summary-tile"><span class="eyebrow">Privacy</span><strong>Local only</strong></div>
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Source of Truth</p>
            <h2>Hybrid evidence coverage</h2>
          </div>
          <span class="pill pill-soft">local-first v1</span>
        </div>
        <div class="summary-grid">
          ${evidenceSourceTiles}
        </div>
        <p class="lead" style="font-size: 18px;">Local browser evidence is the agency QA source of truth for this report. Account-side diagnostics are reserved for future integrations and are marked as not connected in V1.</p>
      </section>

      <section class="section">
        <div class="summary-grid">
          ${summaryTile("Total Events", model.summary.total, "accent-lilac")}
          ${summaryTile("Actionable Issues", actionableIssueCount, actionableIssueCount ? "accent-pink" : "accent-mint")}
          ${summaryTile("Duplicates", duplicateCount, duplicateCount ? "accent-cream" : "")}
          ${summaryTile("Redactions", redactions, redactions ? "accent-pink" : "")}
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Issue Summary</p>
            <h2>Commercial V1 diagnostics by category</h2>
          </div>
          <span class="pill pill-soft">schema v${escapeHtml(model.parserSchemaVersion || 1)}</span>
        </div>
        <div class="summary-grid">
          ${issueCategoryTiles}
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Consent & Tag Health</p>
            <h2>Local DOM scanner evidence</h2>
          </div>
          <span class="pill ${scannerSummary.observed ? "pill-valid" : "pill-soft"}">${scannerSummary.observed ? "scanner observed" : "scanner missing"}</span>
        </div>
        <div class="scanner-grid">
          ${scannerTile("Detected Platforms", scannerPlatforms)}
          ${scannerTile("Relevant Scripts", scannerScripts)}
          ${scannerTile("Google Consent", googleSummary.consentSeen ? "Observed" : "Not observed")}
          ${scannerTile("GCL Linker Cookies", cookieSummary.gclAw || cookieSummary.gclAu ? "Observed" : "Not visible")}
        </div>
        <table style="margin-top: 16px;">
          <thead>
            <tr><th>Category</th><th>Platform</th><th>Finding</th><th>Evidence</th><th>Fix Step</th></tr>
          </thead>
          <tbody>
            ${tagHealthIssues.length ? tagHealthIssues.map(renderReadinessIssueRow).join("") : `<tr><td colspan="5">No local installation, consent, Google tag health, or parser-confidence issues detected.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Dedupe Readiness</p>
            <h2>Browser and server-side merge signals</h2>
          </div>
          <span class="pill ${dedupeIssues.length ? "pill-warning" : "pill-valid"}">${dedupeIssues.length} finding(s)</span>
        </div>
        <table>
          <thead>
            <tr><th>Category</th><th>Platform</th><th>Event</th><th>Evidence</th><th>Fix Step</th></tr>
          </thead>
          <tbody>
            ${dedupeIssues.length ? dedupeIssues.map(renderReadinessIssueRow).join("") : `<tr><td colspan="5">No duplicate firing or browser/server deduplication gaps detected locally.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Funnel Timeline</p>
            <h2>Expected event order</h2>
          </div>
          <span class="pill pill-soft">${model.timeline.length} step(s)</span>
        </div>
        <div class="timeline-grid">
          ${model.timeline.map(renderReportTimelineStep).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Checklist</p>
            <h2>Expected vs observed</h2>
          </div>
          <span class="pill pill-soft">${passCount} / ${model.checklist.length} passed</span>
        </div>
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
        <div class="section-heading">
          <div>
            <p class="eyebrow">Issues & Fixes</p>
            <h2>Next actions for launch readiness</h2>
          </div>
          <span class="pill ${model.issues.length ? "pill-warning" : "pill-valid"}">${model.issues.length} issue(s)</span>
        </div>
        <table>
          <thead>
            <tr><th>Severity</th><th>Category</th><th>Source</th><th>Platform</th><th>Event</th><th>Detected Problem</th><th>Suggested Fix</th></tr>
          </thead>
          <tbody>
            ${model.issues.length ? model.issues.map(renderReportIssueRow).join("") : `<tr><td colspan="7">No issues detected in this audit.</td></tr>`}
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Platform Breakdown</p>
            <h2>Signal coverage by platform</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Platform</th><th>Events</th><th>Pixel IDs</th><th>Warnings</th></tr>
          </thead>
          <tbody>
            ${model.platformBreakdown.map(renderPlatformRow).join("") || `<tr><td colspan="4">No platform events captured.</td></tr>`}
          </tbody>
        </table>
      </section>

      ${
        includePayloadAppendix
          ? `<section class="section appendix">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Raw Payload Appendix</p>
            <h2>Escaped event payloads</h2>
          </div>
        </div>
        ${model.events.map(renderPayloadBlock).join("") || `<p>No raw payloads captured.</p>`}
      </section>`
          : ""
      }

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

function canonicalPlatform(platform = "") {
  return catalogCanonicalPlatform(platform);
}

function canonicalEventName(platform, eventName = "") {
  return catalogCanonicalEventName(platform, eventName);
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
  return normalizeEventNameKey(eventName);
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

function summaryTile(label, value, accent = "") {
  return `<div class="summary-tile ${escapeHtml(accent)}"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function scannerTile(label, value) {
  return `<div class="scanner-card"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function issueCategoryLabel(category) {
  return ISSUE_CATEGORY_LABELS[category] || category || "Event Quality";
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
    <h3>${escapeHtml(step.label)}</h3>
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
  const evidenceMeta = getEvidenceSourceMeta(issue.evidenceSource);
  const severityClass =
    issue.severity === "error"
      ? "pill-error"
      : issue.severity === "info"
        ? "pill-soft"
        : "pill-warning";
  return `<tr>
    <td><span class="pill ${severityClass}">${escapeHtml(issue.severity)}</span></td>
    <td>${escapeHtml(issueCategoryLabel(issue.category))}</td>
    <td>${escapeHtml(issue.source || "audit")}<span class="evidence">${escapeHtml(evidenceMeta.label)}${issue.heuristic ? " / heuristic" : ""}</span></td>
    <td>${escapeHtml(issue.platform)}</td>
    <td>${escapeHtml(issue.eventName)}</td>
    <td>${escapeHtml(issue.message)}<span class="evidence">${escapeHtml(issue.evidence || "No evidence snippet available.")}</span></td>
    <td>${escapeHtml(issue.suggestion || getIssueFixSuggestion(issue))}</td>
  </tr>`;
}

function renderReadinessIssueRow(issue) {
  return `<tr>
    <td>${escapeHtml(issueCategoryLabel(issue.category))}</td>
    <td>${escapeHtml(issue.platform)}</td>
    <td>${escapeHtml(issue.eventName)}</td>
    <td>${escapeHtml(issue.evidence || issue.message)}</td>
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
  return `<details class="payload">
    <summary>
      <span class="eyebrow">${escapeHtml(event.platform)} / ${escapeHtml(event.eventName)}</span>
      <p><strong>${escapeHtml(meta.label || event.platform)}</strong> - ${escapeHtml(event.pixelId || "No pixel ID")}</p>
    </summary>
    <div class="payload-body">
      <pre>${escapeHtml(payload)}</pre>
    </div>
  </details>`;
}

export function platformBadge(platform) {
  const meta = getPlatformMeta(platform);
  return meta.icon
    ? `<img src="${escapeHtml(meta.icon)}" width="16" height="16" aria-hidden="true" />`
    : "";
}
