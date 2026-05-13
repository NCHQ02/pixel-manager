import { auditEvent, classifyEventStatus, escapeHtml, getPlatformMeta } from "./utils.js";

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
    recommendedParams: ["eventData.event_id|eventData.eid", "eventData.cd.value", "eventData.cd.currency"],
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
    eventName: "PageView",
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
    recommendedParams: ["eventData.properties.value", "eventData.properties.currency"],
  },
  {
    platform: "TikTok",
    eventName: "CompletePayment",
    requiredParams: ["pixelId", "eventData.properties.value", "eventData.properties.currency"],
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
    recommendedParams: ["eventData.ep.transaction_id", "eventData.ep.currency", "eventData.epn.value"],
  },
  {
    platform: "Google Ads",
    eventName: "Conversion",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.label", "eventData.lbl", "eventData.value", "eventData.currency_code"],
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

export function buildChecklist(events, expectedEvents = DEFAULT_EXPECTED_EVENTS, expectedPixels = {}) {
  return expectedEvents.map((expected) => {
    const rule = findRule(expected.platform, expected.eventName);
    const matches = events.filter((event) =>
      eventMatchesExpected(event, expected.platform, expected.eventName),
    );
    const best = matches[0] || null;
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
    };
  });
}

export function buildIssues(events, expectedEvents = DEFAULT_EXPECTED_EVENTS, expectedPixels = {}) {
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
        severity: status.key === "missing" || isRequiredParamIssue ? "error" : "warning",
        platform: event.platform,
        eventName: event.eventName,
        pixelId: event.pixelId,
        message,
        timestamp: event.timestamp,
      });
    });

    if (event.duplicateCount > 0) {
      issues.push({
        severity: "warning",
        platform: event.platform,
        eventName: event.eventName,
        pixelId: event.pixelId,
        message: `Duplicate firing detected ${event.duplicateCount} time(s).`,
        timestamp: event.timestamp,
      });
    }
  });

  buildChecklist(events, expectedEvents, expectedPixels)
    .filter((item) => !item.found)
    .forEach((item) => {
      issues.push({
        severity: "error",
        platform: item.platform,
        eventName: item.eventName,
        pixelId: "",
        message: "Expected event was not observed in this audit session.",
        timestamp: Date.now(),
      });
    });

  return issues.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildReportHtml({ events, auditRun, expectedEvents, expectedPixels }) {
  const summary = buildAuditSummary(events);
  const checklist = buildChecklist(events, expectedEvents, expectedPixels);
  const issues = buildIssues(events, expectedEvents, expectedPixels);
  const platforms = [...new Set(events.map((event) => event.platform))].join(", ") || "None";
  const pixels = [...new Set(events.map((event) => event.pixelId).filter(Boolean))].join(", ") || "None";
  const auditWindow = `${formatAuditTime(auditRun?.startedAt)} - ${formatAuditTime(auditRun?.endedAt || Date.now())}`;
  const duplicateWarnings = issues.filter((issue) =>
    issue.message.includes("Duplicate firing"),
  ).length;
  const missingParamIssues = issues.filter((issue) =>
    issue.message.includes("Missing required parameter"),
  ).length;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>OmniSignal Audit Report</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 40px; color: #000; }
      h1 { font-size: 48px; font-weight: 340; letter-spacing: -1px; margin: 0 0 16px; }
      h2 { font-size: 24px; margin-top: 36px; }
      .eyebrow { font-family: monospace; text-transform: uppercase; letter-spacing: .5px; color: #666; }
      .block { background: #fbf7f1; border: 1px solid #e5e5e5; border-radius: 24px; padding: 28px; margin: 24px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; border-bottom: 1px solid #e5e5e5; padding: 10px; vertical-align: top; }
      .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; background: #000; color: #fff; font-family: monospace; font-size: 11px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; }
    </style>
  </head>
  <body>
    <p class="eyebrow">OmniSignal Audit Report</p>
    <h1>${escapeHtml(auditRun?.domain || "Tracking Audit")}</h1>
    <div class="block">
      <p><strong>Platforms:</strong> ${escapeHtml(platforms)}</p>
      <p><strong>Pixel IDs:</strong> ${escapeHtml(pixels)}</p>
      <p><strong>Audit window:</strong> ${escapeHtml(auditWindow)}</p>
      <p><strong>Total events:</strong> ${summary.total}</p>
      <p><strong>Warnings:</strong> ${summary.warnings + summary.duplicates + summary.missing}</p>
      <p><strong>Duplicate warnings:</strong> ${duplicateWarnings}</p>
      <p><strong>Missing params:</strong> ${missingParamIssues}</p>
      <p><strong>Privacy redactions:</strong> ${summary.redactions}</p>
    </div>
    <h2>Checklist</h2>
    <table>
      <thead><tr><th>Platform</th><th>Event</th><th>Status</th><th>Count</th></tr></thead>
      <tbody>${checklist.map((item) => `<tr><td>${escapeHtml(item.platform)}</td><td>${escapeHtml(item.eventName)}</td><td><span class="pill">${escapeHtml(item.status)}</span></td><td>${item.count}</td></tr>`).join("")}</tbody>
    </table>
    <h2>Issues</h2>
    <table>
      <thead><tr><th>Severity</th><th>Platform</th><th>Event</th><th>Message</th></tr></thead>
      <tbody>${issues.map((issue) => `<tr><td>${escapeHtml(issue.severity)}</td><td>${escapeHtml(issue.platform)}</td><td>${escapeHtml(issue.eventName)}</td><td>${escapeHtml(issue.message)}</td></tr>`).join("")}</tbody>
    </table>
    <h2>Raw Payload Appendix</h2>
    ${events.map((event) => `<div class="block"><p><strong>${escapeHtml(event.platform)} / ${escapeHtml(event.eventName)}</strong></p><pre>${escapeHtml(JSON.stringify(event.eventData, null, 2))}</pre></div>`).join("")}
  </body>
</html>`;
}

function formatAuditTime(timestamp) {
  if (!timestamp) return "Not available";
  return new Date(timestamp).toLocaleString();
}

function findRule(platform, eventName) {
  return AUDIT_RULES.find((rule) => eventMatchesExpected({ platform, eventName }, rule.platform, rule.eventName));
}

function eventMatchesExpected(event, platform, eventName) {
  if (event.platform !== platform) return false;
  if (eventName === "Floodlight") return event.platform === "Floodlight";
  if (eventName === "Conversion") return event.eventName.startsWith("Conversion");
  return event.eventName === eventName;
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
    if (event.eventData?.[directKey] !== undefined && event.eventData?.[directKey] !== "") {
      return true;
    }
  }
  const parts = path.split(".");
  let current = parts[0] === "eventData" ? event.eventData : event;
  for (let i = parts[0] === "eventData" ? 1 : 0; i < parts.length; i++) {
    if (current == null || current[parts[i]] === undefined || current[parts[i]] === "") {
      return false;
    }
    current = current[parts[i]];
  }
  return true;
}

export function platformBadge(platform) {
  const meta = getPlatformMeta(platform);
  return `<img src="${escapeHtml(meta.icon || "")}" width="16" height="16" aria-hidden="true" />`;
}
