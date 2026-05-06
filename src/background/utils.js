/**
 * @typedef {Object} Settings
 * @property {number} maxEvents
 */

/**
 * @typedef {Object} TrackedEvent
 * @property {string} id
 * @property {string} tabId
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Object} eventData
 * @property {string} url
 * @property {string} [pixelUrl]
 * @property {string} method
 * @property {number} timestamp
 * @property {string} status
 * @property {boolean} isDiagnostic
 */

// --- Storage Mutex Queue ---
let updateQueue = Promise.resolve();

/**
 * Safely updates chrome.storage.local using a queue to prevent race conditions.
 * @param {(events: Record<string, TrackedEvent[]>, settings: Settings) => boolean} updateFn 
 */
export function enqueueStorageUpdate(updateFn) {
  updateQueue = updateQueue.then(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["trackedEvents", "settings"], (res) => {
        const events = res.trackedEvents || {};
        const settings = res.settings || { maxEvents: 500 };
        const shouldSave = updateFn(events, settings);
        if (shouldSave !== false) {
          chrome.storage.local.set({ trackedEvents: events }, () => resolve());
        } else {
          resolve();
        }
      });
    });
  });
}

// --- Deduplication Logic ---
const lastEventFingerprints = new Map();

/**
 * Generates a stable hash for an object by sorting keys.
 * @param {Object} obj 
 * @returns {string}
 */
export function generateStablePayloadHash(obj) {
  const clone = { ...obj };
  
  // Strip common noise
  const NOISE_KEYS = [
    'z', '_z', '_r', 'rnd', 'ord', // Google
    'ts', 'req', 'rqm', 'r', // Meta
    'timestamp', '_t', 'message_id', // TikTok
    'gtm.uniqueEventId' // DataLayer
  ];
  
  NOISE_KEYS.forEach(key => delete clone[key]);
  
  // Strip internal parser props
  delete clone._rawBodyString;
  delete clone._rawParsed;
  delete clone._rawBatchedString;

  const sortedKeys = Object.keys(clone).sort();
  const stableObj = {};
  for (const k of sortedKeys) {
    stableObj[k] = clone[k];
  }
  return JSON.stringify(stableObj);
}

/**
 * Checks if an event is a duplicate and manages fingerprints.
 * @param {string} tabId 
 * @param {string} platform 
 * @param {string} pixelId 
 * @param {string} eventName 
 * @param {Object} eventData 
 * @param {string} method 
 * @returns {{ isDuplicate: boolean, isWarning: boolean }}
 */
export function checkDeduplication(tabId, platform, pixelId, eventName, eventData, method) {
  const eventId = eventData.eid || eventData.event_id || "";
  let dedupeKey = eventId;

  if (!dedupeKey || platform === "GA4" || platform === "DataLayer") {
    dedupeKey = generateStablePayloadHash(eventData);
  }

  const broadFingerprint = `${tabId}:${platform}:${pixelId}:${eventName}`;
  const exactFingerprint = `${broadFingerprint}:${dedupeKey}`;
  const now = Date.now();
  
  const lastBroad = lastEventFingerprints.get(broadFingerprint);
  const lastExact = lastEventFingerprints.get(exactFingerprint);

  let isDuplicate = false;
  let isWarning = false;

  if (lastBroad && (now - lastBroad.timestamp < 1500)) {
    // 1. Drop browser fallback (POST vs GET)
    if (lastBroad.method !== method) {
      isDuplicate = true;
    }
    
    // 2. Drop identical double-fires (Same method, Same payload)
    // Professional trackers should merge these to avoid UI noise.
    if (lastExact && (now - lastExact.timestamp < 1500)) {
       isDuplicate = true;
    }

    // 3. Flag "Same Event Name" but "Different Payload" as a Warning
    // This is useful for Social Pixels (Meta, TikTok) to detect double-firing.
    // We EXCLUDE DataLayer and GA4 diagnostic pings as they naturally fire in bursts.
    const socialPlatforms = ["Meta", "TikTok", "GA4"];
    if (!isDuplicate && lastBroad.timestamp > 0 && socialPlatforms.includes(platform)) {
      isWarning = true;
    }

  }


  if (!isDuplicate) {
    lastEventFingerprints.set(broadFingerprint, { timestamp: now, method });
    lastEventFingerprints.set(exactFingerprint, { timestamp: now, method });
  }

  return { isDuplicate, isWarning };
}

/**
 * Clears fingerprints for a specific tab.
 * @param {string} tabId 
 */
export function clearFingerprints(tabId) {
  for (const [key] of lastEventFingerprints) {
    if (key.startsWith(`${tabId}:`) || key.startsWith(`background_worker:`)) {
      lastEventFingerprints.delete(key);
    }
  }
}
