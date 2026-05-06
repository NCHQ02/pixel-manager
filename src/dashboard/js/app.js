import { store } from "./store.js";
import { PixelRenderer } from "./renderer.js";
import { showConfirm } from "./modal.js";
import { groupEventsBySession, eventsToCsv, getPlatformMeta } from "./utils.js";

// --- State & DOM Elements ---
let currentPlatform = "All"; // 'All', 'Meta', 'TikTok', 'Diagnostics'
let searchQuery = "";
let selectedTabId = "all";
let isSessionView = false;
let sortConfig = { key: "timestamp", direction: "desc" };

const renderer = new PixelRenderer("events-table-body", "empty-state");

const searchInput = document.getElementById("global-search");
const tabSelector = document.getElementById("tab-selector");
const clearBtn = document.getElementById("clear-all-btn");
const settingsBtn = document.getElementById("settings-btn");
const sessionToggle = document.getElementById("session-view-toggle");
const exportJsonBtn = document.getElementById("export-json-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
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

const filterBtns = [tabAll, tabMeta, tabTikTok, tabGoogle, tabDiagnostics];

const heroSection = document.getElementById("hero-section");
const heroEyebrow = document.getElementById("hero-eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");

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

  renderTagsSummary(filteredEvents);

  if (isSessionView) {
    const windowMs = store.settings?.sessionWindow || 1800000;
    const sessions = groupEventsBySession(filteredEvents, windowMs);
    renderer.render(sessions, true);
  } else {
    renderer.render(filteredEvents, false);
  }
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

function updateTabSelector(eventsMap) {
  const currentVal = tabSelector.value;
  tabSelector.innerHTML = '<option value="all">All Browser Tabs</option>';

  const tabIds = Object.keys(eventsMap);
  tabIds.forEach((id) => {
    if (id === "background_worker") return;

    const tabEvents = eventsMap[id];
    const latestUrl =
      tabEvents.length > 0 ? new URL(tabEvents[0].url).hostname : `Tab ${id}`;

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
      <img src="${meta.icon}" width="24" height="24" />
      <div>
        <div class="tag-platform">${info.platform}</div>
        <div class="caption">${pixelId} <span class="tag-count">(${info.count})</span></div>
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
