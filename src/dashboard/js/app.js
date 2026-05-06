import { store } from "./store.js";
import { PixelRenderer } from "./renderer.js";
import { showConfirm } from "./modal.js";
import { groupEventsBySession, eventsToCsv } from "./utils.js";

// --- State & DOM Elements ---
let currentPlatform = "All"; // 'All', 'Meta', 'TikTok', 'Diagnostics'
let searchQuery = "";
let selectedTabId = "all";
let isSessionView = false;

const renderer = new PixelRenderer("events-table-body", "empty-state");

const searchInput = document.getElementById("global-search");
const tabSelector = document.getElementById("tab-selector");
const clearBtn = document.getElementById("clear-all-btn");
const settingsBtn = document.getElementById("settings-btn");
const sessionToggle = document.getElementById("session-view-toggle");
const exportJsonBtn = document.getElementById("export-json-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");

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

// Collection of filter buttons for easy state management
const filterBtns = [tabAll, tabMeta, tabTikTok, tabGoogle, tabDiagnostics];

const heroSection = document.getElementById("hero-section");
const heroEyebrow = document.getElementById("hero-eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");

// --- Logic ---

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

  renderTagsSummary(filteredEvents);

  // Filter by Search Query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredEvents = filteredEvents.filter(
      (e) =>
        e.eventName.toLowerCase().includes(q) ||
        e.pixelId.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q),
    );
  }

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

    // Find the latest URL for this tab to display as label
    const tabEvents = eventsMap[id];
    const latestUrl =
      tabEvents.length > 0 ? new URL(tabEvents[0].url).hostname : `Tab ${id}`;

    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${latestUrl} (ID: ${id})`;
    tabSelector.appendChild(option);
  });

  // Restore selection if still exists
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

  const contentMap = {
    All: {
      eyebrow: "Global Stream",
      title: "Pixel Tracker",
      desc: "Comprehensive view of all tracking signals intercepted from social platforms.",
      bg: "bg-lilac",
    },
    Meta: {
      eyebrow: "Meta Pixel",
      title: "Facebook Tracking",
      desc: "Capturing standard events, advanced matching, and custom conversions routed to Meta.",
      bg: "bg-meta",
    },
    TikTok: {
      eyebrow: "TikTok Pixel",
      title: "TikTok Analytics",
      desc: "Monitoring page interactions and custom events dispatched to the TikTok Pixel engine.",
      bg: "bg-tiktok",
    },
    Google: {
      eyebrow: "Google Suite",
      title: "Analytics & Ads",
      desc: "Comprehensive tracking for GA4, Google Ads Conversions, and DV360 Floodlight tags.",
      bg: "bg-google",
    },
    Diagnostics: {
      eyebrow: "Diagnostics",
      title: "Internal Pings",
      desc: "Low-level system signals, microdata pings, and automated diagnostic traces.",
      bg: "bg-cream",
    },
  };

  const config = contentMap[platform];
  if (config && heroSection) {
    heroEyebrow.textContent = config.eyebrow;
    heroTitle.textContent = config.title;
    heroSubtitle.textContent = config.desc;

    heroSection.classList.remove(
      "bg-lilac",
      "bg-meta",
      "bg-tiktok",
      "bg-google",
      "bg-cream",
    );
    heroSection.classList.add(config.bg);
  }

  updateUI();
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
    let icon = "https://img.icons8.com/color/48/tiktok--v1.png";
    if (info.platform === "Meta")
      icon = "https://img.icons8.com/fluency/48/meta.png";
    else if (info.platform === "GA4")
      icon =
        "https://fonts.gstatic.com/s/i/productlogos/google_analytics/v6/192px.svg";
    else if (info.platform === "Google Ads")
      icon = "https://img.icons8.com/color/48/google-ads.png";
    else if (info.platform === "Floodlight")
      icon =
        "https://fonts.gstatic.com/s/i/productlogos/marketing_platform/v6/192px.svg";
    else if (info.platform === "DataLayer")
      icon = "https://img.icons8.com/doodle/48/google-tag-manager.png";

    const card = document.createElement("div");
    card.style.cssText = `
      display: flex; align-items: center; gap: 12px; padding: 12px 16px; 
      background: white; border: 1px solid var(--colors-border); 
      border-radius: 12px; cursor: pointer; transition: all 0.2s;
    `;
    card.innerHTML = `
      <img src="${icon}" width="24" height="24" />
      <div>
        <div style="font-weight: 600; font-size: 14px;">${info.platform}</div>
        <div class="caption">${pixelId} <span style="opacity:0.5; margin-left:4px;">(${info.count})</span></div>
      </div>
    `;
    card.addEventListener(
      "mouseover",
      () => (card.style.borderColor = "var(--colors-ink)"),
    );
    card.addEventListener(
      "mouseout",
      () => (card.style.borderColor = "var(--colors-border)"),
    );
    card.addEventListener("click", () => {
      // Tag Assistant feature: Click a tag to filter the stream below to ONLY this tag
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

// --- Initialization ---

store.subscribe((eventsMap) => {
  updateTabSelector(eventsMap);
  updateUI();
});
