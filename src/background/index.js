import { parseMetaRequest } from './parsers/meta.js';
import { parseTikTokRequest } from './parsers/tiktok.js';
import { parseGoogleRequest } from './parsers/google.js';

// --- Storage Mutex Queue ---
let updateQueue = Promise.resolve();

function enqueueStorageUpdate(updateFn) {
  updateQueue = updateQueue.then(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["trackedEvents", "settings"], (res) => {
        let events = res.trackedEvents || {};
        let settings = res.settings || { maxEvents: 500 };
        const shouldSave = updateFn(events, settings);
        if (shouldSave !== false) {
          chrome.storage.local.set({ trackedEvents: events }, () => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  });
}

// Startup cleanup: remove data for closed tabs
chrome.tabs.query({}, (tabs) => {
  const activeTabIds = new Set(tabs.map(t => t.id.toString()));
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
      
      let parsedResults = parseMetaRequest(url, details) || parseTikTokRequest(url, details) || parseGoogleRequest(url, details);
      if (!parsedResults) return;

      const universalBody = extractUniversalBody(details);
      const resultsArray = Array.isArray(parsedResults) ? parsedResults : [parsedResults];

      resultsArray.forEach(parsed => {
        // Merge universal body properties into eventData
        Object.assign(parsed.eventData, universalBody);

        // Re-evaluate event name/ID if the universal parser caught something better
        if (parsed.platform === "TikTok") {
          const d = parsed.eventData;
          
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

          if (d.event && typeof d.event === 'string') {
            parsed.eventName = d.event;
          } else if (d.event_name && typeof d.event_name === 'string') {
            parsed.eventName = d.event_name;
          } else if (d.action) {
            if (d.action === "Pf") parsed.eventName = "Pageview";
            else parsed.eventName = d.action;
          }
          
          if (parsed.eventName === "Unknown" && d._rawBodyString) {
            const match = d._rawBodyString.match(/"event":"([^"]+)"/);
            if (match) parsed.eventName = match[1];
          }

          // Re-evaluate isDiagnostic AFTER eventName is fully resolved from body.
          // The parser sets isDiagnostic before POST body is merged, so "Unknown" events
          // that were later resolved to a real name would be incorrectly flagged.
          const TIKTOK_DIAG_EVENTS = new Set(["Unknown", "Metadata", "SubscribedButtonClick"]);
          parsed.isDiagnostic = TIKTOK_DIAG_EVENTS.has(parsed.eventName);
        }

        let tabId = details.tabId < 0 ? "background_worker" : details.tabId;
        
        // --- Deduplication Logic ---
        if (!globalThis.lastEventFingerprints) {
          globalThis.lastEventFingerprints = new Map();
        }
        
        const eventId = parsed.eventData.eid || parsed.eventData.event_id || "";
        
        let dedupeKey = eventId;
        // If no explicit Event ID exists, or it's GA4 (which batches events), we generate a Payload Hash
        if (!dedupeKey || parsed.platform === "GA4") {
           const clone = { ...parsed.eventData };
           
           // Strip universal cachebusters and timestamps
           delete clone.z; delete clone._z; delete clone._r; delete clone.rnd; delete clone.ord; // Google
           delete clone.ts; delete clone.req; delete clone.rqm; // Meta
           delete clone.timestamp; delete clone._t; delete clone.message_id; // TikTok
           
           // Exclude our internal parser properties
           delete clone._rawBodyString;
           delete clone._rawParsed;
           delete clone._rawBatchedString;
           
           // Sort keys for a stable hash
           const sortedKeys = Object.keys(clone).sort();
           const stableObj = {};
           for (const k of sortedKeys) {
             stableObj[k] = clone[k];
           }
           dedupeKey = JSON.stringify(stableObj);
        }

        const fingerprint = `${tabId}:${parsed.platform}:${parsed.pixelId}:${parsed.eventName}:${dedupeKey}`;
        const now = Date.now();
        
        const lastSeen = globalThis.lastEventFingerprints.get(fingerprint);
        if (lastSeen && (now - lastSeen.timestamp < 2000)) {
          // If methods differ (POST vs GET), it's a browser fallback request. Safely drop it.
          if (lastSeen.method !== details.method) {
            return;
          }
          // Floodlight intentionally fires multiple GETs via iframes/imgs. Drop them to keep it neat.
          else if (parsed.platform === "Floodlight") {
            return;
          }
          // Same method (e.g., POST & POST) means the website actually triggered the tag twice!
          else {
            parsed.eventData._duplicateWarning = true;
          }
        }
        globalThis.lastEventFingerprints.set(fingerprint, { timestamp: now, method: details.method });
        // ----------------------------

        let pageUrl = details.initiator || details.documentUrl || details.url;
        if (parsed.platform === "Meta" && parsed.eventData.dl) pageUrl = parsed.eventData.dl;
        else if (parsed.platform === "TikTok" && parsed.eventData.context && parsed.eventData.context.page && parsed.eventData.context.page.url) pageUrl = parsed.eventData.context.page.url;
        else if (parsed.platform === "GA4" && parsed.eventData.dl) pageUrl = parsed.eventData.dl;

        const eventRecord = {
          id: Date.now().toString() + Math.random().toString().slice(2, 6),
          tabId: String(tabId),
          platform: parsed.platform,
          pixelId: parsed.pixelId,
          eventName: parsed.eventName,
          eventData: parsed.eventData,
          url: pageUrl,
          pixelUrl: details.url,
          method: details.method,
          timestamp: now,
          status: "success",
          isDiagnostic: parsed.isDiagnostic
        };

        enqueueStorageUpdate((events, settings) => {
          if (!events[tabId]) events[tabId] = [];
          events[tabId].unshift(eventRecord);

          const limit = settings.maxEvents || 500;
          while (events[tabId].length > limit) {
            events[tabId].pop();
          }
        });
      });

    } catch (err) {
      console.error("[PixelTracker] Universal Parse Error:", err);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// --- Content Script Message Receiver (DataLayer) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DATALAYER_PUSH') {
    const tabId = sender.tab ? sender.tab.id : "background_worker";
    const payload = message.data.payload[0];
    
    const rawEventName = (payload && typeof payload === 'object' && payload.event) ? payload.event : "DataLayer Push";
    
    // gtm.js is the initial GTM container load — this is a Page Load signal, not noise.
    // Expose it as "Page View" so it mirrors what Tag Manager Assistant shows.
    const eventName = rawEventName === 'gtm.js' ? 'Page View (GTM Load)' : rawEventName;
    
    // gtm.load, gtm.dom, connection__, optimize.* are low-level lifecycle events → hide in Diagnostics
    const isDiag = rawEventName === 'gtm.load' ||
                   rawEventName === 'gtm.dom' ||
                   rawEventName.startsWith('connection__') ||
                   rawEventName.startsWith('optimize.');
                   
    // Deduplicate DataLayer events
    if (!globalThis.lastEventFingerprints) {
      globalThis.lastEventFingerprints = new Map();
    }
    const clone = { ...(payload || message.data.payload) };
    delete clone['gtm.uniqueEventId'];
    const dedupeKey = JSON.stringify(clone);
    const fingerprint = `${tabId}:DataLayer:GTM / DOM:${eventName}:${dedupeKey}`;
    const now = Date.now();
    const lastSeen = globalThis.lastEventFingerprints.get(fingerprint);
    if (lastSeen && (now - lastSeen.timestamp < 2000)) {
      return; // Skip duplicate
    }
    globalThis.lastEventFingerprints.set(fingerprint, { timestamp: now, method: "DOM" });
    
    const eventRecord = {
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      tabId: String(tabId),
      platform: "DataLayer",
      pixelId: "GTM / DOM",
      eventName: eventName,
      eventData: payload || message.data.payload,
      url: sender.tab ? sender.tab.url : "",
      method: "DOM",
      timestamp: message.data.timestamp,
      status: "success",
      isDiagnostic: isDiag
    };

    enqueueStorageUpdate((events, settings) => {
      if (!events[tabId]) events[tabId] = [];
      events[tabId].unshift(eventRecord);

      const limit = settings.maxEvents || 500;
      while (events[tabId].length > limit) {
        events[tabId].pop();
      }
    });
  } else if (message.type === 'DATALAYER_HISTORY') {
    const tabId = sender.tab ? sender.tab.id : "background_worker";
    const history = message.data.payload;
    if (Array.isArray(history)) {
       history.forEach((item, index) => {
          const rawEventName = (item && typeof item === 'object' && item.event) ? item.event : "DataLayer Init";
          const eventName = rawEventName === 'gtm.js' ? 'Page View (GTM Load)' : rawEventName;
          const isDiag = rawEventName === 'gtm.load' ||
                         rawEventName === 'gtm.dom' ||
                         rawEventName.startsWith('connection__') ||
                         rawEventName.startsWith('optimize.');

          // Deduplicate DataLayer events
          if (!globalThis.lastEventFingerprints) {
            globalThis.lastEventFingerprints = new Map();
          }
          const clone = { ...item };
          delete clone['gtm.uniqueEventId'];
          const dedupeKey = JSON.stringify(clone);
          const fingerprint = `${tabId}:DataLayer:GTM / DOM:${eventName}:${dedupeKey}`;
          const now = Date.now();
          const lastSeen = globalThis.lastEventFingerprints.get(fingerprint);
          if (lastSeen && (now - lastSeen.timestamp < 2000)) {
            return; // Skip duplicate
          }
          globalThis.lastEventFingerprints.set(fingerprint, { timestamp: now, method: "DOM" });

          const eventRecord = {
            id: Date.now().toString() + index + Math.random().toString().slice(2, 6),
            tabId: String(tabId),
            platform: "DataLayer",
            pixelId: "GTM / DOM",
            eventName: eventName,
            eventData: item,
            url: sender.tab ? sender.tab.url : "",
            method: "DOM",
            timestamp: message.data.timestamp + index,
            status: "success",
            isDiagnostic: isDiag
          };
          enqueueStorageUpdate((events, settings) => {
            if (!events[tabId]) events[tabId] = [];
            events[tabId].unshift(eventRecord);
      
            const limit = settings.maxEvents || 500;
            while (events[tabId].length > limit) {
              events[tabId].pop();
            }
          });
       });
    }
  }
});

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
  enqueueStorageUpdate((events) => {
    let changed = false;
    if (events[tabId]) {
      delete events[tabId];
      changed = true;
    }
    // GA4 and other pixels sometimes use navigator.sendBeacon or Service Workers
    // which results in tabId = -1 (mapped to "background_worker").
    // We must clear these orphan events as well on page reload to avoid ghost data.
    if (events["background_worker"]) {
      delete events["background_worker"];
      changed = true;
    }
    return changed;
  });
  
  // Also clear deduplication fingerprints for this tab
  if (globalThis.lastEventFingerprints) {
    for (const [key] of globalThis.lastEventFingerprints) {
      if (key.startsWith(`${tabId}:`) || key.startsWith(`background_worker:`)) {
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
