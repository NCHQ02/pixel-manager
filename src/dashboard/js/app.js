import { store } from "./store.js";
import { PixelRenderer } from "./renderer.js";
import { showConfirm } from "./modal.js";
import {
  selectActiveAuditRun,
  selectActiveAuditTab,
  selectEvents,
} from "./state/selectors.js";
import {
  downloadContent,
  slugify,
  todayIsoDate,
} from "./controllers/downloads.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../shared/settings.js";
import {
  AUDIT_PRESETS,
  AUDIT_RULES,
  EXPECTATION_IMPORT_TEMPLATE,
  ISSUE_CATEGORY_LABELS,
  buildIssues,
  buildProfessionalReportHtml,
  buildReportModel,
  formatAuditTargetLabel,
  getIssueFixSuggestion,
  normalizeExpectedEvents,
  parseExpectationImportJson,
} from "./audit.js";
import {
  auditEvent,
  classifyEventStatus,
  escapeHtml,
  eventsToCsv,
  extractRichDetails,
  formatTime,
  getPlatformMeta,
  groupEventsBySession,
} from "./utils.js";

const copySvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b7f4f" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const state = {
  activeView: "overview",
  searchQuery: "",
  platformFilter: "All",
  statusFilter: "All",
  selectedTabId: "all",
  isSessionView: false,
  selectedEventId: null,
  expectedPixels: {},
  expectedEvents: [],
};

let hydrated = false;
let draftTimer = null;
let activeReportPreviewUrl = null;
let renderQueued = false;

const renderer = new PixelRenderer("events-list", "empty-state", {
  onSelectEvent: openEventDrawer,
  maxRenderedEvents: 300,
});

const els = {
  sidebar: document.querySelector(".sidebar"),
  navButtons: [...document.querySelectorAll("[data-view]")],
  viewPanes: [...document.querySelectorAll(".view-pane")],
  mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
  searchInput: document.getElementById("global-search"),
  platformFilter: document.getElementById("platform-filter"),
  statusFilter: document.getElementById("status-filter"),
  tabSelector: document.getElementById("tab-selector"),
  sessionToggle: document.getElementById("session-view-toggle"),
  startAuditBtn: document.getElementById("start-audit-btn"),
  startReloadBtn: document.getElementById("start-reload-btn"),
  auditSessionStatus: document.getElementById("audit-session-status"),
  overviewDomain: document.getElementById("overview-domain"),
  healthCard: document.getElementById("health-card"),
  healthScoreValue: document.getElementById("health-score-value"),
  healthScoreLabel: document.getElementById("health-score-label"),
  summaryEvents: document.getElementById("summary-events"),
  summaryPass: document.getElementById("summary-pass"),
  summaryIssues: document.getElementById("summary-issues"),
  summaryRedactions: document.getElementById("summary-redactions"),
  qaStepper: document.getElementById("qa-stepper"),
  overviewTimeline: document.getElementById("overview-timeline"),
  liveTimeline: document.getElementById("live-timeline"),
  tagsSummaryContainer: document.getElementById("tags-summary-container"),
  tagsSummaryList: document.getElementById("tags-summary-list"),
  expectationPresets: document.getElementById("expectation-presets"),
  expectedPixelInputs: [...document.querySelectorAll(".expected-pixel-input")],
  customPlatformSelect: document.getElementById("custom-platform-select"),
  customEventInput: document.getElementById("custom-event-input"),
  addCustomEventBtn: document.getElementById("add-custom-event-btn"),
  bulkImportJson: document.getElementById("bulk-import-json"),
  loadImportTemplateBtn: document.getElementById("load-import-template-btn"),
  importExpectationsBtn: document.getElementById("import-expectations-btn"),
  bulkImportStatus: document.getElementById("bulk-import-status"),
  saveExpectationsBtn: document.getElementById("save-expectations-btn"),
  draftStatus: document.getElementById("draft-status"),
  checklistList: document.getElementById("checklist-list"),
  issuesSummary: document.getElementById("issues-summary"),
  issuesList: document.getElementById("issues-list"),
  reportPreview: document.getElementById("report-preview"),
  overviewPreviewReportBtn: document.getElementById("overview-preview-report-btn"),
  overviewExportBtn: document.getElementById("overview-export-btn"),
  previewReportBtn: document.getElementById("preview-report-btn"),
  downloadReportBtn: document.getElementById("download-report-btn"),
  exportFilteredReportBtn: document.getElementById("export-filtered-report-btn"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  clearAllBtn: document.getElementById("clear-all-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsModal: document.getElementById("settings-modal"),
  settingsForm: document.getElementById("settings-form"),
  closeSettingsBtn: document.getElementById("close-settings-btn"),
  saveSettingsBtn: document.getElementById("save-settings-btn"),
  settingMaxEvents: document.getElementById("setting-max-events"),
  settingSessionWindow: document.getElementById("setting-session-window"),
  settingDuplicateWindow: document.getElementById("setting-duplicate-window"),
  settingCaptureNetwork: document.getElementById("setting-capture-network"),
  settingCaptureDataLayer: document.getElementById("setting-capture-datalayer"),
  settingCaptureDiagnostics: document.getElementById(
    "setting-capture-diagnostics",
  ),
  settingCaptureScanner: document.getElementById("setting-capture-scanner"),
  settingDefaultView: document.getElementById("setting-default-view"),
  settingDefaultPlatform: document.getElementById("setting-default-platform"),
  settingDefaultStatus: document.getElementById("setting-default-status"),
  settingDefaultSessionView: document.getElementById(
    "setting-default-session-view",
  ),
  settingRestoreWorkspace: document.getElementById("setting-restore-workspace"),
  settingAutosaveDrafts: document.getElementById("setting-autosave-drafts"),
  settingCompactEvents: document.getElementById("setting-compact-events"),
  settingAutoOpenPayload: document.getElementById("setting-auto-open-payload"),
  settingReportDiagnostics: document.getElementById("setting-report-diagnostics"),
  settingReportPayloads: document.getElementById("setting-report-payloads"),
  settingRawExportScope: document.getElementById("setting-raw-export-scope"),
  trimEventsBtn: document.getElementById("trim-events-btn"),
  resetSettingsBtn: document.getElementById("reset-settings-btn"),
  clearDraftBtn: document.getElementById("clear-draft-btn"),
  drawer: document.getElementById("event-drawer"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  closeDrawerBtn: document.getElementById("close-event-drawer"),
  drawerPlatform: document.getElementById("drawer-platform"),
  drawerTitle: document.getElementById("drawer-title"),
  drawerContent: document.getElementById("drawer-content"),
};

function hydrateWorkspaceState() {
  const draft = store.workspaceDraft || {};
  const settings = normalizeSettings(store.settings);
  const shouldRestoreDraft =
    settings.restoreWorkspace &&
    Object.keys(draft).length > 0;
  const filters = shouldRestoreDraft ? draft.filters || {} : {};

  state.activeView = shouldRestoreDraft
    ? draft.activeWorkspaceView || settings.defaultView
    : settings.defaultView;
  state.searchQuery = filters.searchQuery || "";
  state.platformFilter = filters.platformFilter || settings.defaultPlatformFilter;
  state.statusFilter = filters.statusFilter || settings.defaultStatusFilter;
  state.selectedTabId = filters.selectedTabId || "all";
  state.isSessionView =
    filters.isSessionView === undefined
      ? settings.defaultSessionView
      : !!filters.isSessionView;
  state.expectedPixels = {
    ...(store.settings?.expectedPixels || {}),
    ...(shouldRestoreDraft ? draft.expectedPixels || {} : {}),
  };
  state.expectedEvents = normalizeExpectedEvents(
    shouldRestoreDraft && draft.expectedEvents?.length > 0
      ? draft.expectedEvents
      : store.settings?.expectedEvents?.length > 0
        ? store.settings.expectedEvents
        : [],
  );

  els.searchInput.value = state.searchQuery;
  els.platformFilter.value = state.platformFilter;
  els.statusFilter.value = state.statusFilter;
  els.sessionToggle.checked = state.isSessionView;
  applyVisualSettings();
  setView(state.activeView, { render: false, persist: false });
  hydrated = true;
}

function getActiveAuditRun() {
  return selectActiveAuditRun(store);
}

function getActiveAuditTab() {
  return selectActiveAuditTab(store);
}

function getEvents(options = {}) {
  return selectEvents(store, state, options);
}

function shouldKeepDiagnosticForAnalysis(event, includeDiagnostics = false) {
  return includeDiagnostics || !event.isDiagnostic || event.source === "scanner";
}

function getAnalysisEvents({ filtered = false, includeDiagnostics = false } = {}) {
  const events = filtered
    ? getEvents({ includeDiagnostics: true })
    : getEvents({
        applyPlatform: false,
        applyStatus: false,
        applySearch: false,
        includeDiagnostics: true,
      });
  return events.filter((event) =>
    shouldKeepDiagnosticForAnalysis(event, includeDiagnostics),
  );
}

function renderAll() {
  if (!hydrated) return;
  const auditEvents = getAnalysisEvents();
  const visibleEvents = getEvents();
  const auditRun = getActiveAuditRun();
  const reportModel = buildReportModel({
    events: auditEvents,
    auditRun,
    expectedEvents: state.expectedEvents,
    expectedPixels: state.expectedPixels,
  });

  renderSession(reportModel);
  renderOverview(reportModel);
  renderTimeline(els.overviewTimeline, reportModel.timeline);
  renderTimeline(els.liveTimeline, reportModel.timeline);
  renderTagsSummary(visibleEvents);
  renderExpectations();
  renderChecklist(reportModel.checklist);
  renderIssues(reportModel);
  renderReportPreview(reportModel);
  renderLiveStream(visibleEvents);
  renderSelectedDrawer();
}

function scheduleRenderAll() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    renderAll();
  });
}

function renderSession(reportModel) {
  const auditRun = getActiveAuditRun();
  const auditTab = getActiveAuditTab();
  const auditTarget = formatAuditTargetLabel(
    auditRun?.url || auditTab?.url,
    auditRun?.domain || auditTab?.hostname || "No active audit",
  );
  const reloadNote = auditTab?.startedAfterLoad
    ? "Started after page load. Use Start + Reload to catch first-page events."
    : "Ready for controlled tracking QA.";
  const activationNote =
    auditTab?.activationMode === "network_only"
      ? " Network-only mode; DataLayer and scanner evidence are unavailable on this page."
      : "";

  els.overviewDomain.textContent = auditTarget;
  els.overviewDomain.title = auditRun?.url || auditTab?.url || auditTarget;
  els.auditSessionStatus.textContent = auditRun
    ? `${reloadNote}${activationNote} ${reportModel.summary.total} event(s) captured.`
    : "Open a target site and start a controlled audit window.";
}

function renderOverview(reportModel) {
  const passCount = reportModel.checklist.filter((item) => item.status === "valid").length;
  const health = reportModel.health;
  els.healthScoreValue.textContent = `${health.score}%`;
  els.healthScoreLabel.textContent = health.label;
  els.healthScoreLabel.className = `status-pill status-${health.tone}`;
  els.healthCard.className = `color-block health-card ${health.tone === "healthy" ? "bg-mint" : health.tone === "review" ? "bg-cream" : "bg-pink"}`;

  els.summaryEvents.textContent = String(reportModel.summary.total);
  els.summaryPass.textContent = `${passCount} / ${reportModel.checklist.length}`;
  els.summaryIssues.textContent = String(reportModel.issues.length);
  els.summaryRedactions.textContent = String(reportModel.summary.redactions);

  const steps = [
    {
      label: "Setup Expectations",
      done: state.expectedEvents.length > 0,
      detail: `${state.expectedEvents.length} expected event(s) selected`,
    },
    {
      label: "Start Audit",
      done: !!getActiveAuditRun(),
      detail: getActiveAuditRun() ? "Audit window active" : "No audit window",
    },
    {
      label: "Trigger Funnel",
      done: reportModel.summary.total > 0,
      detail: `${reportModel.summary.total} event(s) observed`,
    },
    {
      label: "Fix Issues",
      done: reportModel.summary.total > 0 && reportModel.issues.length === 0,
      detail: reportModel.issues.length
        ? `${reportModel.issues.length} issue(s) need review`
        : "No current blockers",
    },
    {
      label: "Export Report",
      done: reportModel.summary.total > 0,
      detail: "HTML, JSON, and CSV ready",
    },
  ];

  els.qaStepper.innerHTML = steps
    .map(
      (step, index) => `
        <div class="step-item ${step.done ? "done" : ""}">
          <span class="step-index">${index + 1}</span>
          <strong>${escapeHtml(step.label)}</strong>
          <p class="body-sm">${escapeHtml(step.detail)}</p>
        </div>
      `,
    )
    .join("");
}

function renderTimeline(container, timeline) {
  container.innerHTML = timeline
    .map((step) => {
      const label =
        step.status === "missing"
          ? "Missing"
          : step.status === "out_of_order"
            ? "Out of Order"
            : "Observed";
      const duplicate = step.duplicateCount
        ? `<span class="status-pill status-duplicate">Dup ${step.duplicateCount}</span>`
        : "";
      const tag = step.platform === "Any" ? "Funnel" : step.platform;
      return `
        <button class="timeline-step ${escapeHtml(step.status)}" data-event-id="${escapeHtml(step.eventId || "")}" data-event-name="${escapeHtml(step.eventName)}" type="button">
          <span class="eyebrow">${escapeHtml(tag)}</span>
          <span class="timeline-title">${escapeHtml(step.label)}</span>
          <span class="status-pill status-${step.status}">${escapeHtml(label)}</span>
          ${duplicate}
        </button>
      `;
    })
    .join("");
}

function renderTagsSummary(events) {
  if (!els.tagsSummaryContainer || !els.tagsSummaryList) return;
  els.tagsSummaryList.innerHTML = "";

  if (state.platformFilter === "Diagnostics" || events.length === 0) {
    els.tagsSummaryContainer.style.display = "none";
    return;
  }

  els.tagsSummaryContainer.style.display = "block";
  const tagsMap = new Map();
  events.forEach((event) => {
    const key = `${event.platform}:${event.pixelId}`;
    if (!tagsMap.has(key)) {
      tagsMap.set(key, {
        platform: event.platform,
        pixelId: event.pixelId || "Unknown",
        count: 0,
      });
    }
    tagsMap.get(key).count++;
  });

  tagsMap.forEach((info) => {
    const meta = getPlatformMeta(info.platform);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-card";
    button.innerHTML = `
      ${meta.icon ? `<img src="${escapeHtml(meta.icon)}" width="18" height="18" aria-hidden="true" />` : ""}
      <span>${escapeHtml(info.platform)}</span>
      <span class="caption">${escapeHtml(info.pixelId)} (${info.count})</span>
    `;
    button.addEventListener("click", () => {
      state.searchQuery = info.pixelId;
      els.searchInput.value = info.pixelId;
      scheduleDraftSave();
      renderAll();
    });
    els.tagsSummaryList.appendChild(button);
  });
}

function renderExpectations() {
  els.expectedPixelInputs.forEach((input) => {
    if (document.activeElement !== input) {
      input.value = state.expectedPixels[input.dataset.platform] || "";
    }
  });

  const expectedKeys = new Set(state.expectedEvents.map(expectedKey));
  const baseKeys = new Set(AUDIT_RULES.map((rule) => expectedKey(rule)));
  const platforms = ["Meta", "TikTok", "GA4", "Google Ads", "Floodlight"];
  const customEvents = state.expectedEvents.filter(
    (event) => !baseKeys.has(expectedKey(event)),
  );
  const workflowPresets = `
    <section class="preset-platform preset-workflows">
      <p class="eyebrow">Specialist Presets</p>
      <div class="workflow-preset-list">
        ${AUDIT_PRESETS.map((preset) => {
          const selectedCount = preset.expectedEvents.filter((event) =>
            expectedKeys.has(expectedKey(event)),
          ).length;
          return `
            <button
              class="workflow-preset-btn"
              type="button"
              data-preset-id="${escapeHtml(preset.id)}"
            >
              <strong>${escapeHtml(preset.label)}</strong>
              <span class="caption">${escapeHtml(preset.description)}</span>
              <span class="mini-badge">${selectedCount}/${preset.expectedEvents.length}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  els.expectationPresets.innerHTML = workflowPresets + platforms
    .map((platform) => {
      const rules = AUDIT_RULES.filter((rule) => rule.platform === platform).map(
        (rule) => ({ platform: rule.platform, eventName: rule.eventName }),
      );
      const custom = customEvents.filter((event) => event.platform === platform);
      const rows = [...rules, ...custom]
        .map((event) => {
          const key = expectedKey(event);
          const checked = expectedKeys.has(key);
          return `
            <label class="check-row body-sm">
              <input
                class="expected-event-checkbox"
                type="checkbox"
                data-platform="${escapeHtml(event.platform)}"
                data-event-name="${escapeHtml(event.eventName)}"
                ${checked ? "checked" : ""}
              />
              <span>${escapeHtml(event.eventName)}</span>
            </label>
          `;
        })
        .join("");

      return `
        <section class="preset-platform">
          <p class="eyebrow">${escapeHtml(platform)}</p>
          <div class="preset-list">${rows}</div>
        </section>
      `;
    })
    .join("");
}

function renderChecklist(checklist) {
  els.checklistList.innerHTML = checklist
    .map((item) => {
      const issueText =
        item.issues.length > 0
          ? item.issues.map(escapeHtml).join("<br />")
          : item.found
            ? "Observed in this audit session."
            : "Expected event was not observed.";
      return `
        <div class="qa-row">
          <div class="platform-label">${platformIcon(item.platform)}<span>${escapeHtml(item.platform)}</span></div>
          <strong class="body-sm">${escapeHtml(item.eventName)}</strong>
          <span class="status-pill status-${item.status}">${escapeHtml(item.status.replace("_", " "))}</span>
          <span class="body-sm">${issueText}</span>
        </div>
      `;
    })
    .join("");
}

function renderIssues(reportModel) {
  const issues = reportModel.issues;
  const categoryText =
    Object.entries(reportModel.issueSummary || {})
      .filter(([, item]) => item.total > 0)
      .map(([category, item]) => `${formatIssueCategory(category)} ${item.total}`)
      .join(" / ") || "No issue categories";
  els.issuesSummary.className = `qa-section color-block ${
    issues.length > 0 ? "bg-pink" : "bg-mint"
  }`;
  els.issuesSummary.innerHTML = `
    <p class="eyebrow">Issues</p>
    <h2 class="headline">${issues.length > 0 ? "Fix these before campaign spend starts." : "No blocking issues found so far."}</h2>
    <p class="body-lg">${reportModel.summary.total} event(s), ${reportModel.health.score}% Tracking Health, ${reportModel.summary.redactions} privacy redaction(s).</p>
    <p class="body-sm">${escapeHtml(categoryText)}</p>
  `;

  if (issues.length === 0) {
    els.issuesList.innerHTML = `
      <div class="issue-row">
        <span class="status-pill status-valid">valid</span>
        <strong>Audit clean</strong>
        <span class="body-sm">No warnings detected for the current audit.</span>
        <span class="body-sm">Keep triggering the remaining funnel steps.</span>
      </div>
    `;
    return;
  }

  els.issuesList.innerHTML = issues
    .map(
      (issue) => `
        <button class="issue-row" type="button" data-event-id="${escapeHtml(issue.eventId || "")}">
          <div class="issue-meta">
            <span class="status-pill status-${issue.severity === "error" ? "error" : "warning"}">${escapeHtml(issue.severity)}</span>
            <span class="caption">${escapeHtml(formatIssueCategory(issue.category))}</span>
            <span class="caption">${escapeHtml(issue.source || "audit")}${issue.heuristic ? " / heuristic" : ""}</span>
          </div>
          <div class="platform-label">${platformIcon(issue.platform)}<span>${escapeHtml(issue.platform)}</span></div>
          <div>
            <strong>${escapeHtml(issue.eventName)}</strong>
            <p class="body-sm">${escapeHtml(issue.message)}</p>
            <p class="caption evidence-text">${escapeHtml(issue.evidence || "No evidence snippet available.")}</p>
          </div>
          <div class="issue-fix">
            <span class="caption">Suggested Fix</span>
            <span class="body-sm">${escapeHtml(issue.suggestion || getIssueFixSuggestion(issue))}</span>
          </div>
        </button>
      `,
    )
    .join("");
}

function renderReportPreview(reportModel) {
  const passCount = reportModel.checklist.filter((item) => item.status === "valid").length;
  const platformText =
    reportModel.platformBreakdown.map((item) => item.platform).join(", ") || "None";
  const duplicateCount = reportModel.issues.filter((issue) =>
    issue.category === "duplicate_firing",
  ).length;
  const scannerText = reportModel.scannerSummary?.observed
    ? "Local scanner evidence captured."
    : "No local scanner snapshot captured.";
  const timelinePreview = reportModel.timeline
    .slice(0, 4)
    .map(
      (step) => `
        <span class="status-pill status-${escapeHtml(step.status)}">
          ${escapeHtml(step.label)}
        </span>
      `,
    )
    .join("");
  const issuePreview =
    reportModel.issues
      .slice(0, 3)
      .map(
        (issue) => `
          <div>
            <span class="caption">${escapeHtml(formatIssueCategory(issue.category))} / ${escapeHtml(issue.platform)} / ${escapeHtml(issue.eventName)}</span>
            <strong class="body-sm">${escapeHtml(issue.message)}</strong>
          </div>
        `,
      )
      .join("") || `<span class="body-sm">No current issues detected.</span>`;

  els.reportPreview.innerHTML = `
    <div class="report-preview-cover">
      <div>
        <div class="brand">
          <span class="brand-mark">OS</span>
          <div>
            <strong>OmniSignal Audit Report</strong>
            <p class="caption">Client / Dev Artifact</p>
          </div>
        </div>
        <p class="eyebrow report-preview-target">Audited Target</p>
        <h3>${escapeHtml(reportModel.auditTarget?.label || "Not available")}</h3>
        <p class="body-lg">${escapeHtml(platformText)} detected. ${passCount} of ${reportModel.checklist.length} expected event(s) passed. ${escapeHtml(scannerText)}</p>
      </div>
      <div class="report-preview-score">
        <p class="eyebrow">Tracking Health</p>
        <strong>${reportModel.health.score}%</strong>
        <span class="status-pill status-${escapeHtml(reportModel.health.tone)}">
          ${escapeHtml(reportModel.health.label)}
        </span>
      </div>
    </div>
    <div class="report-preview-grid">
      <div class="report-preview-tile">
        <span class="caption">Events</span>
        <strong>${reportModel.summary.total}</strong>
      </div>
      <div class="report-preview-tile">
        <span class="caption">Checklist</span>
        <strong>${passCount} / ${reportModel.checklist.length}</strong>
      </div>
      <div class="report-preview-tile">
        <span class="caption">Issues</span>
        <strong>${reportModel.issues.length}</strong>
      </div>
      <div class="report-preview-tile">
        <span class="caption">Duplicates</span>
        <strong>${duplicateCount}</strong>
      </div>
    </div>
    <div class="report-preview-section">
      <div>
        <p class="eyebrow">Funnel Timeline</p>
        <div class="event-statuses">${timelinePreview}</div>
      </div>
      <div class="report-preview-list">
        <p class="eyebrow">Issues & Fixes</p>
        ${issuePreview}
      </div>
    </div>
  `;
}

function renderLiveStream(visibleEvents) {
  renderer.setSelectedEvent(state.selectedEventId);
  if (state.isSessionView) {
    const sessions = groupEventsBySession(
      visibleEvents,
      store.settings?.sessionWindow || 1800000,
    );
    renderer.render(sessions, true);
  } else {
    renderer.render(visibleEvents, false);
  }
}

function renderSelectedDrawer() {
  if (!state.selectedEventId || els.drawer.hidden) return;
  const event = findEventById(state.selectedEventId);
  if (!event) {
    closeEventDrawer();
    return;
  }
  renderEventDrawer(event);
}

function renderEventDrawer(event) {
  const warnings = auditEvent(event);
  const drawerExpectedEvents = event.source === "scanner" ? state.expectedEvents : [];
  const issues = buildIssues([event], drawerExpectedEvents, state.expectedPixels).filter(
    (issue) => issue.eventId === event.id,
  );
  const status = classifyEventStatus(event, warnings);
  const richDetails = extractRichDetails(event.eventData || {}, event.platform);
  const payload = JSON.stringify(event.eventData || {}, null, 2);
  const showPayload = store.settings?.autoOpenPayload === true;

  els.drawerPlatform.textContent = event.platform;
  els.drawerTitle.textContent = event.eventName;
  els.drawerContent.innerHTML = `
    <div class="drawer-block bg-cream">
      <span class="status-pill status-${status.key}">${escapeHtml(status.label)}</span>
      <p class="body-sm">${escapeHtml(event.source || "network")} / ${escapeHtml(event.method || "GET")} / ${escapeHtml(formatTime(event.timestamp))}</p>
    </div>
    <div class="drawer-block">
      <p class="eyebrow">Quick Fix</p>
      ${
        issues.length
          ? issues
              .map(
                (issue) => `
                  <p class="caption">${escapeHtml(formatIssueCategory(issue.category))}${issue.heuristic ? " / heuristic" : ""}</p>
                  <p class="body-sm"><strong>${escapeHtml(issue.message)}</strong></p>
                  <p class="caption evidence-text">${escapeHtml(issue.evidence || "No evidence snippet available.")}</p>
                  <p class="body-sm">${escapeHtml(issue.suggestion || getIssueFixSuggestion(issue))}</p>
                `,
              )
              .join("")
          : `<p class="body-sm">No issue-specific fix needed for this event.</p>`
      }
    </div>
    <div class="drawer-block">
      <p class="eyebrow">Key Parameters</p>
      <div class="drawer-grid">
        ${detailItem("Pixel ID", event.pixelId)}
        ${detailItem("Page URL", event.url)}
        ${detailItem("Parser Schema", event.parserSchemaVersion || 1)}
        ${Object.entries(richDetails)
          .map(([key, value]) => detailItem(key, value))
          .join("")}
      </div>
    </div>
    ${event.source === "scanner" ? renderScannerDrawerDetails(event.eventData || {}) : ""}
    <div class="drawer-block">
      <div class="section-heading-row">
        <p class="eyebrow">Raw Payload</p>
        <div class="hero-actions">
          <button id="drawer-copy-raw" class="button-pill button-outline" data-copy="${escapeHtml(payload)}">Copy JSON</button>
          <button id="drawer-toggle-raw" class="button-pill button-outline">${showPayload ? "Hide Payload" : "Show Payload"}</button>
        </div>
      </div>
      <div id="drawer-raw-payload" class="code-block" ${showPayload ? "" : "hidden"}>
        <pre>${escapeHtml(payload)}</pre>
      </div>
    </div>
  `;
  attachDrawerActions();
}

function renderScannerDrawerDetails(data) {
  const detectedPlatforms = Object.entries(data.platforms || {})
    .filter(([, detected]) => detected)
    .map(([platform]) => platform)
    .join(", ") || "None";
  const google = data.google || {};
  const cookies = data.cookies || {};
  return `
    <div class="drawer-block">
      <p class="eyebrow">Scanner Evidence</p>
      <div class="drawer-grid">
        ${detailItem("Detected Platforms", detectedPlatforms)}
        ${detailItem("Relevant Scripts", (data.scripts || []).length)}
        ${detailItem("GTM Containers", (google.gtmContainers || []).join(", ") || "None")}
        ${detailItem("Google Tags", (google.googleTagIds || []).join(", ") || "None")}
        ${detailItem("Consent Command", google.consentSeen ? "Observed" : "Not observed")}
        ${detailItem("Event Before Config", google.eventBeforeConfig ? "Yes" : "No")}
        ${detailItem("GCL Linker Cookies", cookies.gclAw || cookies.gclAu ? "Observed" : "Not visible")}
        ${detailItem("DataLayer Length", data.globals?.dataLayerLength || 0)}
      </div>
    </div>
  `;
}

function detailItem(label, value) {
  const safeValue = value === undefined || value === null ? "Not available" : String(value);
  return `
    <div class="detail-group">
      <div class="detail-header-row">
        <span class="caption">${escapeHtml(label)}</span>
        <button class="copy-icon-btn" data-copy="${escapeHtml(safeValue)}" title="Copy ${escapeHtml(label)}">${copySvg}</button>
      </div>
      <div class="detail-value">${escapeHtml(safeValue)}</div>
    </div>
  `;
}

function attachDrawerActions() {
  els.drawerContent.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await navigator.clipboard.writeText(button.dataset.copy || "");
      const original = button.innerHTML;
      button.innerHTML = checkSvg;
      setTimeout(() => {
        button.innerHTML = original;
      }, 1200);
    });
  });

  const toggle = els.drawerContent.querySelector("#drawer-toggle-raw");
  const raw = els.drawerContent.querySelector("#drawer-raw-payload");
  if (toggle && raw) {
    toggle.addEventListener("click", () => {
      raw.hidden = !raw.hidden;
      toggle.textContent = raw.hidden ? "Show Payload" : "Hide Payload";
    });
  }
}

function openEventDrawer(eventId) {
  const event = findEventById(eventId);
  if (!event) return;
  state.selectedEventId = eventId;
  renderer.setSelectedEvent(eventId);
  els.drawer.hidden = false;
  els.drawerBackdrop.hidden = false;
  renderEventDrawer(event);
}

function closeEventDrawer() {
  state.selectedEventId = null;
  els.drawer.hidden = true;
  els.drawerBackdrop.hidden = true;
  renderer.setSelectedEvent(null);
  renderAll();
}

function findEventById(eventId) {
  return store.getAllEvents().find((event) => event.id === eventId);
}

function setView(view, options = {}) {
  const { render = true, persist = true } = options;
  state.activeView = view;
  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  els.viewPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === `${view}-view-pane`);
  });
  if (persist) scheduleDraftSave();
  if (render) renderAll();
  els.sidebar.classList.remove("open");
}

function updateTabSelector(eventsMap) {
  const current = state.selectedTabId;
  els.tabSelector.innerHTML = '<option value="all">All Browser Tabs</option>';
  Object.keys(eventsMap)
    .filter((id) => id !== "background_worker")
    .forEach((id) => {
      const tabEvents = eventsMap[id] || [];
      const latestUrl =
        tabEvents.length > 0 ? safeHostname(tabEvents[0].url) : `Tab ${id}`;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${latestUrl} (ID: ${id})`;
      els.tabSelector.appendChild(option);
    });

  els.tabSelector.value =
    current === "all" || eventsMap[current] ? current : "all";
  state.selectedTabId = els.tabSelector.value;
}

function exportData(format, events = store.getAllEvents()) {
  if (events.length === 0) {
    alert("No data to export.");
    return;
  }
  const date = todayIsoDate();
  const content =
    format === "json" ? JSON.stringify(events, null, 2) : eventsToCsv(events);
  downloadContent(
    content,
    `omnisignal-events-${date}.${format}`,
    format === "json" ? "application/json" : "text/csv",
  );
}

function getRawExportEvents() {
  const scope = store.settings?.rawExportScope || DEFAULT_SETTINGS.rawExportScope;
  const includeDiagnostics =
    store.settings?.reportIncludeDiagnostics !== false ||
    state.platformFilter === "Diagnostics";

  if (scope === "visible") {
    return getEvents({ includeDiagnostics });
  }

  if (scope === "selected-tab" && state.selectedTabId !== "all") {
    return [...(store.events[state.selectedTabId] || [])].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  return store.getAllEvents();
}

function buildCurrentReportModel({ filtered = false } = {}) {
  const auditRun = getActiveAuditRun();
  const includeDiagnostics =
    store.settings?.reportIncludeDiagnostics !== false ||
    (filtered && state.platformFilter === "Diagnostics");
  const events = getAnalysisEvents({ filtered, includeDiagnostics });
  return buildReportModel({
    events,
    auditRun,
    expectedEvents: state.expectedEvents,
    expectedPixels: state.expectedPixels,
    filters: filtered
      ? {
          platform: state.platformFilter,
          status: state.statusFilter,
          search: state.searchQuery,
          tab: state.selectedTabId,
        }
      : null,
    options: {
      includePayloadAppendix: store.settings?.reportIncludePayloads !== false,
    },
  });
}

function exportReport({ filtered = false } = {}) {
  const auditRun = getActiveAuditRun();
  const reportModel = buildCurrentReportModel({ filtered });
  const html = buildProfessionalReportHtml(reportModel);
  const domain = slugify(
    formatAuditTargetLabel(auditRun?.url, auditRun?.domain || "not-available"),
  );
  const date = todayIsoDate();
  downloadContent(
    html,
    `omnisignal-audit-${domain}-${date}.html`,
    "text/html",
  );
}

function previewReport({ filtered = false } = {}) {
  const reportModel = buildCurrentReportModel({ filtered });
  const html = buildProfessionalReportHtml(reportModel);
  if (activeReportPreviewUrl) URL.revokeObjectURL(activeReportPreviewUrl);
  activeReportPreviewUrl = URL.createObjectURL(
    new Blob([html], { type: "text/html" }),
  );

  window.open(activeReportPreviewUrl, "_blank", "noopener,noreferrer");
}

function scheduleDraftSave() {
  if (!hydrated) return;
  if (store.settings?.autoSaveWorkspace === false) {
    if (els.draftStatus) els.draftStatus.textContent = "Draft autosave off";
    return;
  }
  if (els.draftStatus) els.draftStatus.textContent = "Saving draft...";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    await store.saveWorkspaceDraft({
      activeWorkspaceView: state.activeView,
      filters: {
        searchQuery: state.searchQuery,
        platformFilter: state.platformFilter,
        statusFilter: state.statusFilter,
        selectedTabId: state.selectedTabId,
        isSessionView: state.isSessionView,
      },
      expectedPixels: state.expectedPixels,
      expectedEvents: state.expectedEvents,
    });
    if (els.draftStatus) els.draftStatus.textContent = "Draft autosaved locally";
  }, 300);
}

function syncExpectedPixelsFromInputs() {
  const pixels = {};
  els.expectedPixelInputs.forEach((input) => {
    if (input.value.trim()) pixels[input.dataset.platform] = input.value.trim();
  });
  state.expectedPixels = pixels;
}

function addExpectedEvent(platform, eventName) {
  const [next] = normalizeExpectedEvents([{ platform, eventName }]);
  if (!state.expectedEvents.some((event) => expectedKey(event) === expectedKey(next))) {
    state.expectedEvents = [...state.expectedEvents, next];
  }
}

function removeExpectedEvent(platform, eventName) {
  const [target] = normalizeExpectedEvents([{ platform, eventName }]);
  state.expectedEvents = state.expectedEvents.filter(
    (event) => expectedKey(event) !== expectedKey(target),
  );
}

function loadExpectationImportTemplate() {
  els.bulkImportJson.value = JSON.stringify(EXPECTATION_IMPORT_TEMPLATE, null, 2);
  els.bulkImportStatus.textContent =
    "Template loaded. Fill pixel IDs if needed, then import.";
  els.bulkImportJson.focus();
}

function importExpectationsFromJson() {
  const raw = els.bulkImportJson.value.trim();
  if (!raw) {
    els.bulkImportStatus.textContent = "Paste JSON or load the template first.";
    return;
  }

  try {
    const { expectedPixels, expectedEvents, skippedEvents } =
      parseExpectationImportJson(raw);
    const before = new Set(state.expectedEvents.map(expectedKey));
    let addedEvents = 0;

    state.expectedPixels = {
      ...state.expectedPixels,
      ...expectedPixels,
    };
    expectedEvents.forEach((event) => {
      if (!before.has(expectedKey(event))) addedEvents++;
      addExpectedEvent(event.platform, event.eventName);
    });

    scheduleDraftSave();
    renderAll();
    const pixelCount = Object.keys(expectedPixels).length;
    const skippedText = skippedEvents > 0 ? ` ${skippedEvents} invalid row(s) skipped.` : "";
    els.bulkImportStatus.textContent =
      `Imported ${addedEvents} event(s) and ${pixelCount} pixel ID(s) into draft.${skippedText}`;
  } catch (error) {
    els.bulkImportStatus.textContent = error.message || "Could not import JSON.";
  }
}

function applyAuditPreset(presetId) {
  const preset = AUDIT_PRESETS.find((item) => item.id === presetId);
  if (!preset) return;
  const before = new Set(state.expectedEvents.map(expectedKey));
  let added = 0;
  preset.expectedEvents.forEach((event) => {
    if (!before.has(expectedKey(event))) added++;
    addExpectedEvent(event.platform, event.eventName);
  });
  scheduleDraftSave();
  renderAll();
  els.bulkImportStatus.textContent =
    `${preset.label} preset applied. ${added} new expected event(s) added.`;
}

function formatIssueCategory(category) {
  return ISSUE_CATEGORY_LABELS[category] || category || "Event Quality";
}

function expectedKey(event) {
  const [normalized] = normalizeExpectedEvents([event]);
  return `${normalized.platform}::${normalized.eventName}`;
}

function platformIcon(platform) {
  const meta = getPlatformMeta(platform);
  return meta.icon
    ? `<img src="${escapeHtml(meta.icon)}" width="16" height="16" aria-hidden="true" />`
    : "";
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "Unknown URL";
  }
}

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

els.mobileMenuToggle.addEventListener("click", () => {
  els.sidebar.classList.toggle("open");
});

els.searchInput.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  scheduleDraftSave();
  renderAll();
});

els.platformFilter.addEventListener("change", (event) => {
  state.platformFilter = event.target.value;
  scheduleDraftSave();
  renderAll();
});

els.statusFilter.addEventListener("change", (event) => {
  state.statusFilter = event.target.value;
  scheduleDraftSave();
  renderAll();
});

els.tabSelector.addEventListener("change", (event) => {
  state.selectedTabId = event.target.value;
  scheduleDraftSave();
  renderAll();
});

els.sessionToggle.addEventListener("change", (event) => {
  state.isSessionView = event.target.checked;
  scheduleDraftSave();
  renderAll();
});

els.startAuditBtn.addEventListener("click", () => startAudit(false));
els.startReloadBtn.addEventListener("click", () => startAudit(true));

async function startAudit(reload) {
  const button = reload ? els.startReloadBtn : els.startAuditBtn;
  const original = button.textContent;
  button.textContent = reload ? "Reloading..." : "Starting...";
  const result = await store.startAudit({ reload });
  button.textContent = original;
  if (!result?.ok) {
    els.auditSessionStatus.textContent =
      result?.error || "Open a website tab, then start audit again.";
  }
  renderAll();
}

els.overviewTimeline.addEventListener("click", handleTimelineClick);
els.liveTimeline.addEventListener("click", handleTimelineClick);

function handleTimelineClick(event) {
  const step = event.target.closest(".timeline-step");
  if (!step) return;
  const eventId = step.dataset.eventId;
  state.searchQuery = step.dataset.eventName || "";
  els.searchInput.value = state.searchQuery;
  setView("live");
  if (eventId) openEventDrawer(eventId);
}

els.expectationPresets.addEventListener("change", (event) => {
  if (!event.target.classList.contains("expected-event-checkbox")) return;
  const platform = event.target.dataset.platform;
  const eventName = event.target.dataset.eventName;
  if (event.target.checked) addExpectedEvent(platform, eventName);
  else removeExpectedEvent(platform, eventName);
  scheduleDraftSave();
  renderAll();
});

els.expectationPresets.addEventListener("click", (event) => {
  const button = event.target.closest(".workflow-preset-btn");
  if (!button) return;
  applyAuditPreset(button.dataset.presetId);
});

els.expectedPixelInputs.forEach((input) => {
  input.addEventListener("input", () => {
    syncExpectedPixelsFromInputs();
    scheduleDraftSave();
  });
});

els.addCustomEventBtn.addEventListener("click", () => {
  const eventName = els.customEventInput.value.trim();
  if (!eventName) return;
  addExpectedEvent(els.customPlatformSelect.value, eventName);
  els.customEventInput.value = "";
  scheduleDraftSave();
  renderAll();
});

els.loadImportTemplateBtn.addEventListener("click", loadExpectationImportTemplate);
els.importExpectationsBtn.addEventListener("click", importExpectationsFromJson);

els.saveExpectationsBtn.addEventListener("click", async () => {
  syncExpectedPixelsFromInputs();
  await store.saveSettings({
    expectedPixels: state.expectedPixels,
    expectedEvents: state.expectedEvents,
  });
  await store.updateActiveAuditRun({
    expectedPixels: state.expectedPixels,
    expectedEvents: state.expectedEvents,
  });
  await store.saveWorkspaceDraft({
    expectedPixels: state.expectedPixels,
    expectedEvents: state.expectedEvents,
  });
  els.draftStatus.textContent = "Expectations saved";
  renderAll();
});

els.issuesList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-event-id]");
  if (row?.dataset.eventId) openEventDrawer(row.dataset.eventId);
});

els.overviewPreviewReportBtn.addEventListener("click", () => previewReport());
els.overviewExportBtn.addEventListener("click", () => exportReport());
els.previewReportBtn.addEventListener("click", () => previewReport());
els.downloadReportBtn.addEventListener("click", () => exportReport());
els.exportFilteredReportBtn.addEventListener("click", () =>
  exportReport({ filtered: true }),
);
els.exportJsonBtn.addEventListener("click", () =>
  exportData("json", getRawExportEvents()),
);
els.exportCsvBtn.addEventListener("click", () =>
  exportData("csv", getRawExportEvents()),
);

els.clearAllBtn.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "Clear Canvas?",
    "This clears captured events and audit runs. Checklist drafts stay saved.",
  );
  if (confirmed) {
    await store.clearAll();
    state.selectedEventId = null;
    closeEventDrawer();
  }
});

function applyVisualSettings() {
  document.body.classList.toggle(
    "compact-events",
    store.settings?.compactEvents === true,
  );
}

function hydrateSettingsForm() {
  const settings = normalizeSettings(store.settings);
  els.settingMaxEvents.value = String(settings.maxEvents);
  els.settingSessionWindow.value = String(settings.sessionWindow);
  els.settingDuplicateWindow.value = String(settings.duplicateWindow);
  els.settingCaptureNetwork.checked = settings.captureNetwork;
  els.settingCaptureDataLayer.checked = settings.captureDataLayer;
  els.settingCaptureDiagnostics.checked = settings.captureDiagnostics;
  els.settingCaptureScanner.checked = settings.captureTagScanner;
  els.settingDefaultView.value = settings.defaultView;
  els.settingDefaultPlatform.value = settings.defaultPlatformFilter;
  els.settingDefaultStatus.value = settings.defaultStatusFilter;
  els.settingDefaultSessionView.checked = settings.defaultSessionView;
  els.settingRestoreWorkspace.checked = settings.restoreWorkspace;
  els.settingAutosaveDrafts.checked = settings.autoSaveWorkspace;
  els.settingCompactEvents.checked = settings.compactEvents;
  els.settingAutoOpenPayload.checked = settings.autoOpenPayload;
  els.settingReportDiagnostics.checked = settings.reportIncludeDiagnostics;
  els.settingReportPayloads.checked = settings.reportIncludePayloads;
  els.settingRawExportScope.value = settings.rawExportScope;
}

function readSettingsForm() {
  return {
    maxEvents: parseInt(els.settingMaxEvents.value, 10),
    sessionWindow: parseInt(els.settingSessionWindow.value, 10),
    duplicateWindow: parseInt(els.settingDuplicateWindow.value, 10),
    captureNetwork: els.settingCaptureNetwork.checked,
    captureDataLayer: els.settingCaptureDataLayer.checked,
    captureDiagnostics: els.settingCaptureDiagnostics.checked,
    captureTagScanner: els.settingCaptureScanner.checked,
    restoreWorkspace: els.settingRestoreWorkspace.checked,
    autoSaveWorkspace: els.settingAutosaveDrafts.checked,
    defaultView: els.settingDefaultView.value,
    defaultPlatformFilter: els.settingDefaultPlatform.value,
    defaultStatusFilter: els.settingDefaultStatus.value,
    defaultSessionView: els.settingDefaultSessionView.checked,
    compactEvents: els.settingCompactEvents.checked,
    autoOpenPayload: els.settingAutoOpenPayload.checked,
    reportIncludeDiagnostics: els.settingReportDiagnostics.checked,
    reportIncludePayloads: els.settingReportPayloads.checked,
    rawExportScope: els.settingRawExportScope.value,
  };
}

function openSettings() {
  hydrateSettingsForm();
  els.settingsModal.style.display = "flex";
  els.settingMaxEvents.focus();
}

els.settingsBtn.addEventListener("click", openSettings);

function closeSettings() {
  els.settingsModal.style.display = "none";
}

async function showSettingsConfirm(title, message, options = {}) {
  const { reopenOnConfirm = false } = options;
  const wasOpen = els.settingsModal.style.display !== "none";
  if (wasOpen) closeSettings();

  const confirmed = await showConfirm(title, message);
  if (wasOpen && (!confirmed || reopenOnConfirm)) {
    openSettings();
  }
  return confirmed;
}

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

els.closeSettingsBtn.addEventListener("click", closeSettings);
els.settingsModal.addEventListener("click", (event) => {
  if (event.target === els.settingsModal) closeSettings();
});

els.saveSettingsBtn.addEventListener("click", async () => {
  await store.saveSettings(readSettingsForm());
  applyVisualSettings();
  closeSettings();
  renderAll();
});

els.trimEventsBtn.addEventListener("click", async () => {
  const limit = parseInt(els.settingMaxEvents.value, 10) || store.settings.maxEvents;
  const trimmed = await store.trimEventsToMax(limit);
  const original = els.trimEventsBtn.textContent;
  els.trimEventsBtn.textContent = trimmed ? "Trimmed" : "Already Trimmed";
  setTimeout(() => {
    els.trimEventsBtn.textContent = original;
  }, 1200);
});

els.resetSettingsBtn.addEventListener("click", async () => {
  const confirmed = await showSettingsConfirm(
    "Reset Preferences?",
    "This resets capture, workspace, report, and export preferences. Saved expectations remain.",
    { reopenOnConfirm: true },
  );
  if (!confirmed) return;

  await store.replaceSettings({
    ...DEFAULT_SETTINGS,
    expectedPixels: store.settings?.expectedPixels || {},
    expectedEvents: store.settings?.expectedEvents || [],
  });
  hydrateSettingsForm();
  applyVisualSettings();
  hydrated = false;
  hydrateWorkspaceState();
  renderAll();
});

els.clearDraftBtn.addEventListener("click", async () => {
  const confirmed = await showSettingsConfirm(
    "Clear Settings Drafts?",
    "This clears autosaved workspace view, filters, and unsaved checklist drafts.",
  );
  if (!confirmed) return;
  await store.clearWorkspaceDraft();
  hydrated = false;
  hydrateWorkspaceState();
  closeSettings();
  renderAll();
});

window.addEventListener("beforeunload", () => {
  if (activeReportPreviewUrl) URL.revokeObjectURL(activeReportPreviewUrl);
});

els.closeDrawerBtn.addEventListener("click", closeEventDrawer);
els.drawerBackdrop.addEventListener("click", closeEventDrawer);

document.addEventListener("click", (event) => {
  if (window.innerWidth > 1200 || !els.sidebar.classList.contains("open")) return;
  if (
    !els.sidebar.contains(event.target) &&
    !els.mobileMenuToggle.contains(event.target)
  ) {
    els.sidebar.classList.remove("open");
  }
});

store.subscribe((eventsMap) => {
  if (!store.ready) return;
  if (!hydrated) hydrateWorkspaceState();
  applyVisualSettings();
  updateTabSelector(eventsMap);
  scheduleRenderAll();
});
