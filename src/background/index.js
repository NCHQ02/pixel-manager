import { parseMetaRequest } from "./parsers/meta.js";
import { parseTikTokRequest } from "./parsers/tiktok.js";
import { parseGoogleRequest } from "./parsers/google.js";
import {
  enqueueStorageUpdate,
  checkDeduplication,
  clearFingerprints,
} from "./utils.js";

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

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "OPEN_DASHBOARD") {
    openDashboard();
  }

  if (
    message.type === "DATALAYER_PUSH" ||
    message.type === "DATALAYER_HISTORY"
  ) {
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

      const { isDuplicate, isWarning } = checkDeduplication(
        tabId,
        "DataLayer",
        "GTM / DOM",
        eventName,
        item,
        "DOM",
      );

      if (isDuplicate) return;

      const eventRecord = {
        id:
          Date.now().toString() + index + Math.random().toString().slice(2, 6),
        tabId,
        platform: "DataLayer",
        pixelId: "GTM / DOM",
        eventName: eventName,
        eventData: item,
        url: sender.tab ? sender.tab.url : "",
        method: "DOM",
        timestamp: (message.data.timestamp || Date.now()) + index,
        status: "success",
        isDiagnostic: isDiag,
      };

      if (isWarning) eventRecord.eventData._duplicateWarning = true;

      enqueueStorageUpdate((events, settings) => {
        if (!events[tabId]) events[tabId] = [];
        events[tabId].unshift(eventRecord);
        const limit = settings.maxEvents || 500;
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
      const url = new URL(details.url);
      const rawResults =
        parseMetaRequest(url, details) ||
        parseTikTokRequest(url, details) ||
        parseGoogleRequest(url, details);

      if (!rawResults) return;

      const resultsArray = Array.isArray(rawResults)
        ? rawResults
        : [rawResults];
      const tabId =
        details.tabId < 0 ? "background_worker" : String(details.tabId);

      resultsArray.forEach((parsed) => {
        const { isDuplicate, isWarning } = checkDeduplication(
          tabId,
          parsed.platform,
          parsed.pixelId,
          parsed.eventName,
          parsed.eventData,
          details.method,
        );

        if (isDuplicate) return;
        if (isWarning) parsed.eventData._duplicateWarning = true;

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

        const eventRecord = {
          id: Date.now().toString() + Math.random().toString().slice(2, 6),
          tabId,
          platform: parsed.platform,
          pixelId: parsed.pixelId,
          eventName: parsed.eventName,
          eventData: parsed.eventData,
          url: pageUrl,
          pixelUrl: details.url,
          method: details.method,
          timestamp: Date.now(),
          status: "success",
          isDiagnostic: !!parsed.isDiagnostic,
        };

        enqueueStorageUpdate((events, settings) => {
          if (!events[tabId]) events[tabId] = [];
          events[tabId].unshift(eventRecord);

          const limit = settings.maxEvents || 500;
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
  { urls: ["<all_urls>"] },
  ["requestBody"],
);

// --- Dashboard Activation ---
chrome.action.onClicked.addListener(() => {
  openDashboard();
});

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
  clearTabEvents(String(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url?.startsWith("http")) {
    clearTabEvents(String(tabId));
  }
});
