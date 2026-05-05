import { parseMetaRequest } from './parsers/meta.js';
import { parseTikTokRequest } from './parsers/tiktok.js';

let trackedEvents = {};

// Keep local state in sync with storage
chrome.storage.local.get(["trackedEvents"], (result) => {
  if (chrome.runtime.lastError) {
    console.error("Storage error:", chrome.runtime.lastError);
  }
  trackedEvents = (result && result.trackedEvents) ? result.trackedEvents : {};
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.trackedEvents) {
    trackedEvents = changes.trackedEvents.newValue || {};
  }
});

function extractUniversalBody(details) {
  let bodyData = {};
  if (details.method !== "GET" && details.requestBody) {
    if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        if (rawBytes) {
          const bodyString = new TextDecoder("utf-8").decode(rawBytes);
          bodyData._rawBodyString = bodyString;
          try {
            const bodyJson = JSON.parse(bodyString);
            if (typeof bodyJson === 'object' && bodyJson !== null) {
              Object.assign(bodyData, bodyJson);
              if (bodyJson.properties) Object.assign(bodyData, bodyJson.properties);
              if (bodyJson.context) Object.assign(bodyData, bodyJson.context);
              if (bodyJson.message) Object.assign(bodyData, bodyJson.message);
            }
          } catch (e) {
            const bodyParams = new URLSearchParams(bodyString);
            bodyParams.forEach((value, key) => { bodyData[key] = value; });
          }
        }
      } catch (e) {
        bodyData._rawDecodeError = e.message;
      }
    }
  }
  return bodyData;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url = new URL(details.url);
      
      let parsed = parseMetaRequest(url, details) || parseTikTokRequest(url, details);
      if (!parsed) return;

      const universalBody = extractUniversalBody(details);
      
      // Merge universal body properties into eventData
      Object.assign(parsed.eventData, universalBody);

      // Re-evaluate event name/ID if the universal parser caught something better
      if (parsed.platform === "TikTok") {
        const d = parsed.eventData;
        
        // 1. Cứu Pixel ID từ JSON sâu
        if (d.pixel_code && typeof d.pixel_code === 'string') {
          parsed.pixelId = d.pixel_code;
        } else if (d.pixel && d.pixel.code) {
          parsed.pixelId = d.pixel.code;
        } else if (d.context && d.context.pixel && d.context.pixel.code) {
          parsed.pixelId = d.context.pixel.code;
        } else if (d._rawBodyString) {
           const match = d._rawBodyString.match(/"code":"([^"]+)"/);
           if(match) parsed.pixelId = match[1];
        }

        // 2. Cứu Event Name từ JSON sâu
        if (d.event && typeof d.event === 'string') {
          parsed.eventName = d.event;
        } else if (d.event_name && typeof d.event_name === 'string') {
          parsed.eventName = d.event_name;
        } else if (d.action) {
          // TikTok nội bộ hay dùng 'action' thay vì 'event' cho auto-events
          if (d.action === "Pf") parsed.eventName = "Pageview";
          else parsed.eventName = d.action;
        }
        
        if (parsed.eventName === "Unknown" && d._rawBodyString) {
          const match = d._rawBodyString.match(/"event":"([^"]+)"/);
          if (match) parsed.eventName = match[1];
        }
      }

      let tabId = details.tabId < 0 ? "background_worker" : details.tabId;
      
      // --- Deduplication Logic ---
      if (!globalThis.lastEventFingerprints) {
        globalThis.lastEventFingerprints = new Map();
      }
      
      // Create a fingerprint of the event
      // Meta often sends multiple requests for the same event (e.g. GET and POST, or fallback pixels)
      // We deduplicate based on Tab + Platform + Pixel + Event + EventID (if exists)
      const eventId = parsed.eventData.eid || parsed.eventData.event_id || "";
      const fingerprint = `${tabId}:${parsed.platform}:${parsed.pixelId}:${parsed.eventName}:${eventId}`;
      const now = Date.now();
      
      const lastSeen = globalThis.lastEventFingerprints.get(fingerprint);
      if (lastSeen && (now - lastSeen < 2000)) {
        // console.log(`[Dedupe] Skipping duplicate event: ${fingerprint}`);
        return;
      }
      globalThis.lastEventFingerprints.set(fingerprint, now);
      // ----------------------------

      const eventRecord = {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        platform: parsed.platform,
        pixelId: parsed.pixelId,
        eventName: parsed.eventName,
        eventData: parsed.eventData,
        url: details.url,
        method: details.method,
        timestamp: now,
        status: "success"
      };

      if (!trackedEvents[tabId]) trackedEvents[tabId] = [];
      trackedEvents[tabId].unshift(eventRecord);

      if (trackedEvents[tabId].length > 500) {
        trackedEvents[tabId].pop();
      }

      chrome.storage.local.set({ trackedEvents });

    } catch (err) {
      console.error("[Pixel Tracker] Critical error processing request:", err);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Click extension icon to open Dashboard
chrome.action.onClicked.addListener((tab) => {
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
        height: 900
      });
    }
  });
});

// Function to clear events for a specific tab
const clearTabEvents = (tabId) => {
  if (trackedEvents[tabId]) {
    delete trackedEvents[tabId];
    chrome.storage.local.set({ trackedEvents });
  }
  
  // Also clear deduplication fingerprints for this tab
  if (globalThis.lastEventFingerprints) {
    for (const [key] of globalThis.lastEventFingerprints) {
      if (key.startsWith(`${tabId}:`)) {
        globalThis.lastEventFingerprints.delete(key);
      }
    }
  }
};

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabEvents(tabId);
});

// Clean up when page reloads or navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Clear events when a new page starts loading in the tab
  if (changeInfo.status === 'loading') {
    // We only care about standard web pages (http/https)
    if (tab.url && tab.url.startsWith('http')) {
      clearTabEvents(tabId);
    }
  }
});
