import { store } from "./store.js";
import { PixelRenderer } from "./renderer.js";
import { showConfirm } from "./modal.js";
import {
  DEFAULT_EXPECTED_EVENTS,
  buildAuditSummary,
  buildChecklist,
  buildIssues,
  buildReportHtml,
} from "./audit.js";
import {
  escapeHtml,
  groupEventsBySession,
  eventsToCsv,
  getPlatformMeta,
} from "./utils.js";

// --- State & DOM Elements ---
let currentPlatform = "All"; // 'All', 'Meta', 'TikTok', 'Diagnostics'
let searchQuery = "";
let selectedTabId = "all";
let isSessionView = false;
let sortConfig = { key: "timestamp", direction: "desc" };
let currentView = "live";

const renderer = new PixelRenderer("events-table-body", "empty-state");

const searchInput = document.getElementById("global-search");
const tabSelector = document.getElementById("tab-selector");
const clearBtn = document.getElementById("clear-all-btn");
const settingsBtn = document.getElementById("settings-btn");
const sessionToggle = document.getElementById("session-view-toggle");
const exportJsonBtn = document.getElementById("export-json-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const exportReportBtn = document.getElementById("export-report-btn");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const sidebar = document.querySelector(".sidebar");

const settingsModal = document.getElementById("settings-modal");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const settingMaxEvents = document.getElementById("setting-max-events");
const settingSessionWindow = document.getElementById("setting-session-window");

const tabAll = document.getElementById("tab-all");
const tabMeta = document.getElementById("tab-meta");
const tabTikTok = document.getElementById("tab-tiktok");
const tabGoogle = document.getElementById("tab-google");
const tabDiagnostics = document.getElementById("tab-diagnostics");
const viewLive = document.getElementById("view-live");
const viewChecklist = document.getElementById("view-checklist");
const viewIssues = document.getElementById("view-issues");
const viewReport = document.getElementById("view-report");

const filterBtns = [tabAll, tabMeta, tabTikTok, tabGoogle, tabDiagnostics];
const viewBtns = [viewLive, viewChecklist, viewIssues, viewReport];

const heroSection = document.getElementById("hero-section");
const heroEyebrow = document.getElementById("hero-eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");
const startAuditBtn = document.getElementById("start-audit-btn");
const startReloadBtn = document.getElementById("start-reload-btn");
const auditSessionStatus = document.getElementById("audit-session-status");
const checklistList = document.getElementById("checklist-list");
const issuesList = document.getElementById("issues-list");
const issuesSummary = document.getElementById("issues-summary");
const reportPreview = document.getElementById("report-preview");
const downloadReportBtn = document.getElementById("download-report-btn");
const saveExpectationsBtn = document.getElementById("save-expectations-btn");
const expectedInputs = {
  Meta: document.getElementById("expected-meta-pixel"),
  TikTok: document.getElementById("expected-tiktok-pixel"),
  GA4: document.getElementById("expected-ga4-pixel"),
  "Google Ads": document.getElementById("expected-google-pixel"),
};
const expectedEventsInput = document.getElementById("expected-events-input");

// --- UI Logic ---

function updateUI() {
  let filteredEvents = [];

  if (selectedTabId === "all") {
    filteredEvents = store.getAllEvents();
  } else {
    filteredEvents = [...(store.events[selectedTabId] || [])];
    filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Handle Diagnostics vs Main Flow
  if (currentPlatform === "Diagnostics") {
    filteredEvents = filteredEvents.filter((e) => e.isDiagnostic === true);
  } else {
    // Normal platforms: Hide diagnostics by default
    filteredEvents = filteredEvents.filter((e) => !e.isDiagnostic);
    if (currentPlatform === "Google") {
      filteredEvents = filteredEvents.filter((e) =>
        ["GA4", "Google Ads", "Floodlight", "DataLayer"].includes(e.platform),
      );
    } else if (currentPlatform !== "All") {
      filteredEvents = filteredEvents.filter(
        (e) => e.platform === currentPlatform,
      );
    }
  }

  // Apply search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(
      (e) =>
        e.eventName.toLowerCase().includes(q) ||
        e.pixelId.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q),
    );
  }

  // Apply Sorting
  filteredEvents.sort((a, b) => {
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];

    // Handle nested data if needed, but for now top-level keys
    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  renderAuditSessionStatus();
  renderTagsSummary(filteredEvents);
  renderWorkflowPanels(filteredEvents);

  if (isSessionView) {
    const windowMs = store.settings?.sessionWindow || 1800000;
    const sessions = groupEventsBySession(filteredEvents, windowMs);
    renderer.render(sessions, true);
  } else {
    renderer.render(filteredEvents, false);
  }
}

function renderAuditSessionStatus() {
  const activeRunId = store.auditState?.activeAuditRunId;
  const auditRun = activeRunId ? store.auditRuns?.[activeRunId] : null;
  const tabs = store.auditState?.auditTabs || {};
  const activeTab = Object.values(tabs).find(
    (tab) => tab.auditRunId === activeRunId,
  );

  if (!auditRun && !activeTab) {
    auditSessionStatus.textContent =
      "No audit session is active. Start from a target website tab.";
    return;
  }

  const domain = auditRun?.domain || activeTab?.hostname || "current tab";
  const reloadNote = activeTab?.startedAfterLoad
    ? " Started after page load; use Start + Reload for first-page events."
    : "";
  auditSessionStatus.textContent = `Auditing ${domain}.${reloadNote}`;
}

function renderWorkflowPanels(events) {
  const expectedPixels = store.settings?.expectedPixels || {};
  const expectedEvents = store.settings?.expectedEvents || DEFAULT_EXPECTED_EVENTS;
  const activeRunId = store.auditState?.activeAuditRunId;
  const auditRun = activeRunId ? store.auditRuns?.[activeRunId] : null;

  Object.entries(expectedInputs).forEach(([platform, input]) => {
    if (input && document.activeElement !== input) {
      input.value = expectedPixels[platform] || "";
    }
  });
  if (expectedEventsInput && document.activeElement !== expectedEventsInput) {
    expectedEventsInput.value = expectedEvents
      .map((event) => `${event.platform}:${event.eventName}`)
      .join("\n");
  }

  renderChecklist(events, expectedEvents, expectedPixels);
  renderIssues(events, expectedEvents, expectedPixels);
  renderReportPreview(events, auditRun, expectedEvents, expectedPixels);
}

function renderChecklist(events, expectedEvents, expectedPixels) {
  const checklist = buildChecklist(events, expectedEvents, expectedPixels);
  checklistList.innerHTML = checklist
    .map((item) => {
      const statusLabel = item.status.replace("_", " ");
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
          <span class="status-pill status-${item.status}">${escapeHtml(statusLabel)}</span>
          <span class="body-sm">${issueText}</span>
        </div>
      `;
    })
    .join("");
}

function renderIssues(events, expectedEvents, expectedPixels) {
  const issues = buildIssues(events, expectedEvents, expectedPixels);
  const summary = buildAuditSummary(events);
  issuesSummary.className = `qa-section color-block ${
    issues.length > 0 ? "bg-tiktok" : "bg-mint"
  }`;
  issuesSummary.innerHTML = `
    <p class="eyebrow">Issues</p>
    <h3 class="headline">${issues.length > 0 ? "Warnings that need attention before launch." : "No blocking issues found so far."}</h3>
    <p class="body-lg">${summary.total} events observed, ${summary.duplicates} duplicate warning(s), ${summary.redactions} privacy redaction(s).</p>
  `;

  if (issues.length === 0) {
    issuesList.innerHTML = `
      <div class="qa-row compact">
        <span class="status-pill status-valid">valid</span>
        <strong class="body-sm">Audit clean</strong>
        <span class="body-sm">No warnings detected for the current filters.</span>
        <span class="caption">Keep triggering the expected funnel steps.</span>
      </div>
    `;
    return;
  }

  issuesList.innerHTML = issues
    .map(
      (issue) => `
        <div class="qa-row compact">
          <span class="status-pill status-${issue.severity === "error" ? "error" : "warning"}">${escapeHtml(issue.severity)}</span>
          <div class="platform-label">${platformIcon(issue.platform)}<span>${escapeHtml(issue.platform)}</span></div>
          <strong class="body-sm">${escapeHtml(issue.eventName)}</strong>
          <span class="body-sm">${escapeHtml(issue.message)}</span>
        </div>
      `,
    )
    .join("");
}

function renderReportPreview(events, auditRun, expectedEvents, expectedPixels) {
  const summary = buildAuditSummary(events);
  const issues = buildIssues(events, expectedEvents, expectedPixels);
  const platforms = [...new Set(events.map((event) => event.platform))];
  const pixels = [...new Set(events.map((event) => event.pixelId).filter(Boolean))];
  const duplicateWarnings = issues.filter((issue) =>
    issue.message.includes("Duplicate firing"),
  ).length;
  const missingParamIssues = issues.filter((issue) =>
    issue.message.includes("Missing required parameter"),
  ).length;

  reportPreview.innerHTML = `
    <div class="qa-row compact">
      <span class="caption">Domain</span>
      <strong class="body-sm">${escapeHtml(auditRun?.domain || "No active audit")}</strong>
      <span class="caption">Events</span>
      <strong class="body-sm">${summary.total}</strong>
    </div>
    <div class="qa-row compact">
      <span class="caption">Platforms</span>
      <strong class="body-sm">${escapeHtml(platforms.join(", ") || "None")}</strong>
      <span class="caption">Pixel IDs</span>
      <strong class="body-sm">${escapeHtml(pixels.join(", ") || "None")}</strong>
    </div>
    <div class="qa-row compact">
      <span class="caption">Issues</span>
      <strong class="body-sm">${issues.length}</strong>
      <span class="caption">Redactions</span>
      <strong class="body-sm">${summary.redactions}</strong>
    </div>
    <div class="qa-row compact">
      <span class="caption">Duplicates</span>
      <strong class="body-sm">${duplicateWarnings}</strong>
      <span class="caption">Missing Params</span>
      <strong class="body-sm">${missingParamIssues}</strong>
    </div>
  `;
}

function platformIcon(platform) {
  const meta = getPlatformMeta(platform);
  return meta.icon
    ? `<img src="${escapeHtml(meta.icon)}" width="16" height="16" aria-hidden="true" />`
    : "";
}

function exportData(format) {
  const events = store.getAllEvents();
  if (events.length === 0) {
    alert("No data to export!");
    return;
  }

  let content = "";
  let filename = `pixel-events-${new Date().toISOString().split("T")[0]}`;
  let mimeType = "";

  if (format === "json") {
    content = JSON.stringify(events, null, 2);
    filename += ".json";
    mimeType = "application/json";
  } else {
    content = eventsToCsv(events);
    filename += ".csv";
    mimeType = "text/csv";
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReport() {
  const events = store.getAllEvents();
  const activeRunId = store.auditState?.activeAuditRunId;
  const auditRun = activeRunId ? store.auditRuns?.[activeRunId] : null;
  const expectedPixels = store.settings?.expectedPixels || {};
  const expectedEvents = store.settings?.expectedEvents || DEFAULT_EXPECTED_EVENTS;

  const content = buildReportHtml({
    events,
    auditRun,
    expectedEvents,
    expectedPixels,
  });
  const filename = `omnisignal-report-${new Date().toISOString().split("T")[0]}.html`;
  const blob = new Blob([content], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function updateTabSelector(eventsMap) {
  const currentVal = tabSelector.value;
  tabSelector.innerHTML = '<option value="all">All Browser Tabs</option>';

  const tabIds = Object.keys(eventsMap);
  tabIds.forEach((id) => {
    if (id === "background_worker") return;

    const tabEvents = eventsMap[id];
    const latestUrl =
      tabEvents.length > 0 ? getHostname(tabEvents[0].url) : `Tab ${id}`;

    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${latestUrl} (ID: ${id})`;
    tabSelector.appendChild(option);
  });

  if (tabIds.includes(currentVal)) {
    tabSelector.value = currentVal;
  } else {
    tabSelector.value = "all";
    selectedTabId = "all";
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "Unknown URL";
  }
}

function setPlatform(platform, btn) {
  currentPlatform = platform;
  filterBtns.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  const meta = getPlatformMeta(platform);
  if (meta && heroSection) {
    heroEyebrow.textContent = meta.label;
    heroTitle.textContent = meta.heroTitle;
    heroSubtitle.textContent = meta.description;

    heroSection.className = `hero color-block ${meta.bgClass}`;
  }

  updateUI();
}

function setView(view, btn) {
  currentView = view;
  viewBtns.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  document.querySelectorAll(".view-pane").forEach((pane) => {
    pane.classList.remove("active");
  });
  document.getElementById(`${view}-view-pane`)?.classList.add("active");
  updateUI();
}

// --- Tag Assistant Summary Logic ---
function renderTagsSummary(events) {
  const container = document.getElementById("tags-summary-container");
  const list = document.getElementById("tags-summary-list");
  if (!container || !list) return;

  list.innerHTML = "";

  if (currentPlatform === "Diagnostics" || events.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";

  const tagsMap = new Map();
  events.forEach((e) => {
    if (!tagsMap.has(e.pixelId)) {
      tagsMap.set(e.pixelId, { platform: e.platform, count: 0 });
    }
    tagsMap.get(e.pixelId).count++;
  });

  tagsMap.forEach((info, pixelId) => {
    const meta = getPlatformMeta(info.platform);
    const card = document.createElement("div");
    card.className = "tag-card";
    card.innerHTML = `
      <img src="${escapeHtml(meta.icon)}" width="24" height="24" />
      <div>
        <div class="tag-platform">${escapeHtml(info.platform)}</div>
        <div class="caption">${escapeHtml(pixelId)} <span class="tag-count">(${info.count})</span></div>
      </div>
    `;
    card.addEventListener("click", () => {
      const tagEvents = events.filter((e) => e.pixelId === pixelId);
      if (isSessionView) {
        const windowMs = store.settings?.sessionWindow || 1800000;
        renderer.render(groupEventsBySession(tagEvents, windowMs), true);
      } else {
        renderer.render(tagEvents, false);
      }
    });

    list.appendChild(card);
  });
}

// --- Event Listeners ---

tabAll.addEventListener("click", () => setPlatform("All", tabAll));
tabMeta.addEventListener("click", () => setPlatform("Meta", tabMeta));
tabTikTok.addEventListener("click", () => setPlatform("TikTok", tabTikTok));
tabGoogle.addEventListener("click", () => setPlatform("Google", tabGoogle));
tabDiagnostics.addEventListener("click", () =>
  setPlatform("Diagnostics", tabDiagnostics),
);

viewLive.addEventListener("click", () => setView("live", viewLive));
viewChecklist.addEventListener("click", () =>
  setView("checklist", viewChecklist),
);
viewIssues.addEventListener("click", () => setView("issues", viewIssues));
viewReport.addEventListener("click", () => setView("report", viewReport));

startAuditBtn.addEventListener("click", async () => {
  startAuditBtn.textContent = "Starting...";
  const result = await store.startAudit({ reload: false });
  startAuditBtn.textContent = "Start Audit";
  if (!result?.ok) {
    auditSessionStatus.textContent =
      result?.error || "Open a website tab, then start audit again.";
  }
  updateUI();
});

startReloadBtn.addEventListener("click", async () => {
  startReloadBtn.textContent = "Reloading...";
  const result = await store.startAudit({ reload: true });
  startReloadBtn.textContent = "Start + Reload";
  if (!result?.ok) {
    auditSessionStatus.textContent =
      result?.error || "Open a website tab, then start audit again.";
  }
  updateUI();
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  updateUI();
});

tabSelector.addEventListener("change", (e) => {
  selectedTabId = e.target.value;
  updateUI();
});

sessionToggle.addEventListener("change", (e) => {
  isSessionView = e.target.checked;
  updateUI();
});

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortConfig.key === key) {
      sortConfig.direction = sortConfig.direction === "asc" ? "desc" : "asc";
    } else {
      sortConfig.key = key;
      sortConfig.direction = "asc";
    }

    // Update UI active state
    document.querySelectorAll("th.sortable").forEach((el) => {
      el.classList.remove("active-sort");
      // Reset icon to default
      el.querySelector(".sort-icon").innerHTML =
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>`;
    });

    th.classList.add("active-sort");
    const icon = th.querySelector(".sort-icon");
    if (sortConfig.direction === "asc") {
      icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m18 15-6-6-6 6"/></svg>`;
    } else {
      icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>`;
    }

    updateUI();
  });
});

exportJsonBtn.addEventListener("click", () => exportData("json"));
exportCsvBtn.addEventListener("click", () => exportData("csv"));
exportReportBtn.addEventListener("click", exportReport);
downloadReportBtn.addEventListener("click", exportReport);

saveExpectationsBtn.addEventListener("click", async () => {
  const expectedPixels = {};
  Object.entries(expectedInputs).forEach(([platform, input]) => {
    if (input.value.trim()) expectedPixels[platform] = input.value.trim();
  });
  const expectedEvents = parseExpectedEvents(expectedEventsInput.value);
  await store.saveSettings({
    expectedPixels,
    expectedEvents,
  });
  await store.updateActiveAuditRun({ expectedPixels, expectedEvents });
  updateUI();
});

function parseExpectedEvents(rawValue) {
  const parsed = String(rawValue || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [platform, ...eventParts] = line.split(":");
      return {
        platform: platform.trim(),
        eventName: eventParts.join(":").trim(),
      };
    })
    .filter((event) => event.platform && event.eventName);

  return parsed.length > 0 ? parsed : DEFAULT_EXPECTED_EVENTS;
}

clearBtn.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "Clear Canvas?",
    "Are you sure you want to permanently delete all tracked events? This action cannot be undone.",
  );
  if (confirmed) {
    store.clearAll();
  }
});

settingsBtn.addEventListener("click", () => {
  settingMaxEvents.value = store.settings?.maxEvents || "500";
  settingSessionWindow.value = store.settings?.sessionWindow || "1800000";
  settingsModal.style.display = "flex";
});

const closeSettings = () => {
  settingsModal.style.display = "none";
};

closeSettingsBtn.addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

saveSettingsBtn.addEventListener("click", async () => {
  const maxEvents = parseInt(settingMaxEvents.value, 10);
  const sessionWindow = parseInt(settingSessionWindow.value, 10);
  await store.saveSettings({ maxEvents, sessionWindow });
  closeSettings();
  updateUI();
});

// Mobile Toggle Logic
if (mobileMenuToggle) {
  mobileMenuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Close sidebar when clicking outside on mobile
document.addEventListener("click", (e) => {
  if (window.innerWidth <= 1200 && sidebar.classList.contains("open")) {
    if (!sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  }
});

// --- Initialization ---

store.subscribe((eventsMap) => {
  updateTabSelector(eventsMap);
  updateUI();
});
