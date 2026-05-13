import { parseMetaRequest } from "./parsers/meta.js";
import { parseTikTokRequest } from "./parsers/tiktok.js";
import { parseGoogleRequest } from "./parsers/google.js";
import {
  enqueueStorageUpdate,
  checkDeduplication,
  clearFingerprints,
  sanitizeCapturedData,
  sanitizeCapturedUrl,
} from "./utils.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";

const TRACKING_URL_PATTERNS = [
  "*://*.facebook.com/*",
  "*://*.facebook.net/*",
  "*://*.tiktok.com/*",
  "*://*.byteoversea.com/*",
  "*://*.google-analytics.com/*",
  "*://*.google.com/*",
  "*://*.googleadservices.com/*",
  "*://*.doubleclick.net/*",
  "*://*.googleads.g.doubleclick.net/*",
];

const auditedTabIds = new Set();
const auditTabContexts = {};
let activeAuditRunId = null;
let lastTargetTabId = null;
let runtimeSettings = { ...DEFAULT_SETTINGS };

chrome.storage.local.get(["settings"], (res) => {
  runtimeSettings = normalizeSettings(res.settings);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.settings) {
    runtimeSettings = normalizeSettings(changes.settings.newValue);
  }
});

const getSessionState = () =>
  new Promise((resolve) => {
    chrome.storage.session.get(["auditTabs", "activeAuditRunId"], (res) => {
      resolve({
        auditTabs: res.auditTabs || {},
        activeAuditRunId: res.activeAuditRunId || null,
      });
    });
  });

const setSessionState = (state) =>
  new Promise((resolve) => {
    chrome.storage.session.set(state, () => resolve());
  });

const getLocalAuditRuns = () =>
  new Promise((resolve) => {
    chrome.storage.local.get(["auditRuns"], (res) => {
      resolve(res.auditRuns || {});
    });
  });

const setLocalAuditRuns = (auditRuns) =>
  new Promise((resolve) => {
    chrome.storage.local.set({ auditRuns }, () => resolve());
  });

async function hydrateAuditState() {
  const { auditTabs, activeAuditRunId: storedRunId } = await getSessionState();
  Object.entries(auditTabs).forEach(([tabId, context]) => {
    auditedTabIds.add(Number(tabId));
    auditTabContexts[tabId] = context;
  });
  activeAuditRunId = storedRunId;
  lastTargetTabId = Number(Object.keys(auditTabs).at(-1)) || null;
}

hydrateAuditState();

// --- Startup Cleanup ---
chrome.tabs.query({}, (tabs) => {
  const activeTabIds = new Set(tabs.map((t) => t.id.toString()));
  enqueueStorageUpdate((events) => {
    let changed = false;
    for (const tabId in events) {
      if (tabId !== "background_worker" && !activeTabIds.has(tabId)) {
        delete events[tabId];
        changed = true;
      }
    }
    return changed;
  });
});

/**
 * Activates or creates the dashboard window.
 */
function openDashboard() {
  const dashboardUrl = chrome.runtime.getURL("src/dashboard/index.html");
  chrome.tabs.query({ url: dashboardUrl }, (tabs) => {
    if (tabs.length > 0) {
      chrome.windows.update(tabs[0].windowId, { focused: true });
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      chrome.windows.create({
        url: dashboardUrl,
        type: "popup",
        width: 1400,
        height: 900,
      });
    }
  });
}

function isAuditableUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function createAuditRunId(tabId) {
  return `audit-${tabId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enableAuditingForTab(tab, options = {}) {
  if (!tab?.id || !isAuditableUrl(tab.url)) return;

  const tabKey = String(tab.id);
  const existingContext = auditTabContexts[tabKey];
  const createNewRun = options.createNewRun || !existingContext?.auditRunId;
  const startedAt = createNewRun
    ? Date.now()
    : existingContext.startedAt || Date.now();
  const auditRunId =
    options.auditRunId ||
    (createNewRun ? createAuditRunId(tab.id) : existingContext.auditRunId);
  const reloadMode =
    options.reloadMode ||
    (createNewRun ? "none" : existingContext?.reloadMode || "none");
  const hostname = safeHostname(tab.url);

  auditedTabIds.add(tab.id);
  lastTargetTabId = tab.id;
  activeAuditRunId = auditRunId;
  if (createNewRun && options.clearExistingEvents !== false) {
    clearTabEvents(tabKey);
  }

  const { auditTabs } = await getSessionState();
  auditTabs[tabKey] = {
    ...existingContext,
    tabId: tabKey,
    auditRunId,
    url: sanitizeCapturedUrl(tab.url),
    hostname,
    startedAt,
    reloadMode,
    startedAfterLoad: createNewRun
      ? tab.status === "complete" && reloadMode !== "reload"
      : !!existingContext?.startedAfterLoad,
  };
  auditTabContexts[tabKey] = auditTabs[tabKey];
  await setSessionState({ auditTabs, activeAuditRunId: auditRunId });

  const auditRuns = await getLocalAuditRuns();
  const existingRun = auditRuns[auditRunId] || {};
  auditRuns[auditRunId] = {
    ...existingRun,
    id: auditRunId,
    tabId: tabKey,
    domain: hostname,
    url: sanitizeCapturedUrl(tab.url),
    startedAt: existingRun.startedAt || startedAt,
    endedAt: existingRun.endedAt || null,
    reloadMode: existingRun.reloadMode || reloadMode,
    expectedPixels: existingRun.expectedPixels || {},
    expectedEvents: existingRun.expectedEvents || [],
  };
  await setLocalAuditRuns(auditRuns);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/content.js"],
    });
  } catch (err) {
    console.warn("[OmniSignal] Could not activate tab audit:", err);
  }

  if (options.reload) {
    chrome.tabs.reload(tab.id);
  }
}

function safeHostname(url = "") {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "Unknown URL";
  }
}

async function getTargetTab() {
  if (lastTargetTabId) {
    try {
      return await chrome.tabs.get(lastTargetTabId);
    } catch (_e) {}
  }

  const tabs = await chrome.tabs.query({ active: true });
  return tabs.find((tab) => isAuditableUrl(tab.url));
}

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_DASHBOARD") {
    if (sender.tab) enableAuditingForTab(sender.tab);
    openDashboard();
  }

  if (message.type === "GET_AUDIT_STATE") {
    (async () => {
      const sessionState = await getSessionState();
      const auditRuns = await getLocalAuditRuns();
      sendResponse({
        ...sessionState,
        auditRuns,
        lastTargetTabId: lastTargetTabId ? String(lastTargetTabId) : null,
      });
    })();
    return true;
  }

  if (message.type === "START_AUDIT") {
    (async () => {
      const tab = sender.tab || (await getTargetTab());
      if (!tab) {
        sendResponse({ ok: false, error: "No auditable tab is available." });
        return;
      }

      await enableAuditingForTab(tab, {
        createNewRun: true,
        reload: !!message.reload,
        reloadMode: message.reload ? "reload" : "none",
      });
      sendResponse({ ok: true, tabId: String(tab.id), auditRunId: activeAuditRunId });
    })();
    return true;
  }

  if (
    message.type === "DATALAYER_PUSH" ||
    message.type === "DATALAYER_HISTORY"
  ) {
    if (!runtimeSettings.captureDataLayer) return;
    if (sender.tab?.id >= 0 && !auditedTabIds.has(sender.tab.id)) return;

    const tabId = sender.tab ? String(sender.tab.id) : "background_worker";
    const payloadArray =
      message.type === "DATALAYER_HISTORY"
        ? message.data.payload
        : [message.data.payload[0]];

    if (!Array.isArray(payloadArray)) return;

    payloadArray.forEach((item, index) => {
      if (!item) return;

      let eventName = "DataLayer Init";
      let isDiag = false;

      // 1. Identify GTM Commands (Array-based: ['consent', 'update', ...])
      if (Array.isArray(item) && item.length > 0) {
        const command = item[0];
        if (typeof command === "string") {
          eventName = `DataLayer: ${command}`;
          if (["consent", "set", "js", "config"].includes(command)) {
            isDiag = true;
          }
        }
      }
      // 2. Identify Standard Events (Object-based: { event: 'xyz' })
      else if (typeof item === "object" && item.event) {
        eventName = item.event;
        if (eventName === "gtm.js") eventName = "Page View (GTM Load)";

        isDiag =
          eventName === "gtm.load" ||
          eventName === "gtm.dom" ||
          eventName.startsWith("connection__") ||
          eventName.startsWith("optimize.");
      }

      if (isDiag && !runtimeSettings.captureDiagnostics) return;

      const sanitizedItem = sanitizeCapturedData(item);
      const { isDuplicate, isWarning } = checkDeduplication(
        tabId,
        "DataLayer",
        "GTM / DOM",
        eventName,
        sanitizedItem,
        "DOM",
        runtimeSettings.duplicateWindow,
      );

      if (isDuplicate) {
        enqueueStorageUpdate((events) => {
          const tabEvents = events[tabId] || [];
          incrementDuplicateEvent(
            tabEvents,
            {
              platform: "DataLayer",
              pixelId: "GTM / DOM",
              eventName,
            },
            sanitizedItem,
            "DOM",
          );
          return true;
        });
        return;
      }

      const eventRecord = {
        id:
          Date.now().toString() + index + Math.random().toString().slice(2, 6),
        tabId,
        platform: "DataLayer",
        pixelId: "GTM / DOM",
        eventName: eventName,
        eventData: sanitizedItem,
        url: sender.tab ? sanitizeCapturedUrl(sender.tab.url) : "",
        method: "DOM",
        timestamp: (message.data.timestamp || Date.now()) + index,
        status: isDiag ? "diagnostic" : isWarning ? "duplicate" : "valid",
        isDiagnostic: isDiag,
        issues: [],
        duplicateCount: isWarning ? 1 : 0,
        auditRunId: auditTabContexts[tabId]?.auditRunId || activeAuditRunId,
        source: "datalayer",
      };

      if (isWarning) eventRecord.eventData._duplicateWarning = true;

      enqueueStorageUpdate((events, settings) => {
        if (!events[tabId]) events[tabId] = [];
        upsertEvent(events[tabId], eventRecord);
        const limit = settings.maxEvents || DEFAULT_SETTINGS.maxEvents;
        if (events[tabId].length > limit) {
          events[tabId] = events[tabId].slice(0, limit);
        }

        // Notify content script for Visual Overlay
        if (sender.tab?.id >= 0) {
          chrome.tabs
            .sendMessage(sender.tab.id, {
              type: "PIXEL_EVENT_CAPTURED",
              eventCount: events[tabId].filter((e) => !e.isDiagnostic).length,
            })
            .catch(() => {});
        }

        return true;
      });
    });
  }
});

// --- Network Request Listener ---
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      if (!runtimeSettings.captureNetwork) return;
      if (details.tabId < 0 || !auditedTabIds.has(details.tabId)) return;

      const url = new URL(details.url);
      const rawResults =
        parseMetaRequest(url, details) ||
        parseTikTokRequest(url, details) ||
        parseGoogleRequest(url, details);

      if (!rawResults) return;

      const resultsArray = Array.isArray(rawResults)
        ? rawResults
        : [rawResults];
      const tabId = String(details.tabId);

      resultsArray.forEach((parsed) => {
        if (parsed.isDiagnostic && !runtimeSettings.captureDiagnostics) return;

        const eventData = sanitizeCapturedData(parsed.eventData);
        const { isDuplicate, isWarning } = checkDeduplication(
          tabId,
          parsed.platform,
          parsed.pixelId,
          parsed.eventName,
          eventData,
          details.method,
          runtimeSettings.duplicateWindow,
        );

        if (isDuplicate) {
          enqueueStorageUpdate((events) => {
            const tabEvents = events[tabId] || [];
            incrementDuplicateEvent(tabEvents, parsed, eventData, details.method);
            return true;
          });
          return;
        }
        if (isWarning) eventData._duplicateWarning = true;

        let pageUrl = details.initiator || details.documentUrl || details.url;
        if (parsed.platform === "Meta" && parsed.eventData.dl)
          pageUrl = parsed.eventData.dl;
        else if (
          parsed.platform === "TikTok" &&
          parsed.eventData.context?.page?.url
        )
          pageUrl = parsed.eventData.context.page.url;
        else if (parsed.platform === "GA4" && parsed.eventData.dl)
          pageUrl = parsed.eventData.dl;

        const sanitizedPageUrl = sanitizeCapturedUrl(pageUrl);
        const sanitizedPixelUrl = sanitizeCapturedUrl(details.url);

        const eventRecord = {
          id: Date.now().toString() + Math.random().toString().slice(2, 6),
          tabId,
          platform: parsed.platform,
          pixelId: parsed.pixelId,
          eventName: parsed.eventName,
          eventData,
          url: sanitizedPageUrl,
          pixelUrl: sanitizedPixelUrl,
          method: details.method,
          timestamp: Date.now(),
          status: parsed.isDiagnostic ? "diagnostic" : isWarning ? "duplicate" : "valid",
          isDiagnostic: !!parsed.isDiagnostic,
          issues: [],
          duplicateCount: isWarning ? 1 : 0,
          auditRunId: auditTabContexts[tabId]?.auditRunId || activeAuditRunId,
          source: "network",
        };

        enqueueStorageUpdate((events, settings) => {
          if (!events[tabId]) events[tabId] = [];
          upsertEvent(events[tabId], eventRecord);

          const limit = settings.maxEvents || DEFAULT_SETTINGS.maxEvents;
          if (events[tabId].length > limit) {
            events[tabId] = events[tabId].slice(0, limit);
          }

          // Notify content script for Visual Overlay
          if (details.tabId >= 0) {
            chrome.tabs
              .sendMessage(details.tabId, {
                type: "PIXEL_EVENT_CAPTURED",
                eventCount: events[tabId].filter((e) => !e.isDiagnostic).length,
              })
              .catch(() => {});
          }

          return true;
        });
      });
    } catch (err) {
      console.error("[PixelTracker] Network Parse Error:", err);
    }
  },
  { urls: TRACKING_URL_PATTERNS },
  ["requestBody"],
);

// --- Dashboard Activation ---
chrome.action.onClicked.addListener(async (tab) => {
  await enableAuditingForTab(tab, { createNewRun: true });
  openDashboard();
});

function upsertEvent(tabEvents, eventRecord) {
  tabEvents.unshift(eventRecord);
}

function incrementDuplicateEvent(tabEvents, parsed, eventData, method) {
  const target = tabEvents.find(
    (event) =>
      event.platform === parsed.platform &&
      event.pixelId === parsed.pixelId &&
      event.eventName === parsed.eventName &&
      event.method === method,
  );

  if (!target) return;
  target.duplicateCount = (target.duplicateCount || 0) + 1;
  target.status = "duplicate";
  target.eventData = target.eventData || eventData;
  target.eventData._duplicateWarning = true;
}

/**
 * Clears events and fingerprints for a specific tab.
 * @param {string} tabId
 */
const clearTabEvents = (tabId) => {
  enqueueStorageUpdate((events) => {
    let changed = false;
    if (events[tabId]) {
      delete events[tabId];
      changed = true;
    }
    // Clear orphan events from Service Workers/Beacons
    if (events["background_worker"]) {
      delete events["background_worker"];
      changed = true;
    }
    return changed;
  });
  clearFingerprints(tabId);
};

// --- Lifecycle Event Listeners ---
chrome.tabs.onRemoved.addListener((tabId) => {
  auditedTabIds.delete(tabId);
  const removedContext = auditTabContexts[String(tabId)];
  getSessionState().then(({ auditTabs, activeAuditRunId: storedRunId }) => {
    delete auditTabs[String(tabId)];
    delete auditTabContexts[String(tabId)];
    const remainingContexts = Object.values(auditTabs);
    const nextContext = remainingContexts.at(-1);
    if (storedRunId === removedContext?.auditRunId) {
      activeAuditRunId = nextContext?.auditRunId || null;
      lastTargetTabId = nextContext ? Number(nextContext.tabId) : null;
    }
    setSessionState({ auditTabs, activeAuditRunId });
  });
  clearTabEvents(String(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url?.startsWith("http")) {
    clearTabEvents(String(tabId));
  }

  if (
    changeInfo.status === "complete" &&
    auditedTabIds.has(tabId) &&
    isAuditableUrl(tab.url)
  ) {
    enableAuditingForTab(tab, { createNewRun: false });
  }
});
