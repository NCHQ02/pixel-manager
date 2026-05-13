import { DEFAULT_SETTINGS } from "../shared/settings.js";

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

  return JSON.stringify(sortForStableHash(clone));
}

function sortForStableHash(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortForStableHash(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sorted = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      sorted[key] = sortForStableHash(value[key]);
    });
  return sorted;
}

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_REGEX = /(\+?\d{1,4}[\s-])?\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const SENSITIVE_KEY_REGEX =
  /(^|_|\b)(email|e-mail|phone|mobile|first_name|last_name|fullname|full_name|address|street|city|zip|postcode|dob|birth|external_id)(_|$|\b)/i;

function isSensitivePlaintextValue(key, value) {
  if (typeof value !== "string") return false;
  if (SHA256_REGEX.test(value.trim())) return false;
  if (SENSITIVE_KEY_REGEX.test(key) && value.trim().length > 0) return true;
  return EMAIL_REGEX.test(value) || PHONE_REGEX.test(value);
}

/**
 * Redacts likely plaintext PII in stored URLs while preserving audit context.
 * @param {string} rawUrl
 * @returns {string}
 */
export function sanitizeCapturedUrl(rawUrl = "") {
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.forEach((value, key) => {
      if (isSensitivePlaintextValue(key, value)) {
        parsed.searchParams.set(key, "[redacted sensitive value]");
      }
    });
    return parsed.toString();
  } catch (_e) {
    return isSensitivePlaintextValue("url", rawUrl)
      ? "[redacted sensitive URL]"
      : rawUrl;
  }
}

/**
 * Redacts likely plaintext PII before it is persisted locally.
 * @param {Object} data
 * @returns {Object}
 */
export function sanitizeCapturedData(data) {
  const redactions = [];
  const seen = new WeakSet();

  const sanitize = (value, path = "data") => {
    if (Array.isArray(value)) {
      return value.map((item, index) => sanitize(item, `${path}[${index}]`));
    }

    if (!value || typeof value !== "object") {
      return sanitizePrimitive(value, path);
    }

    if (seen.has(value)) return "[Circular Reference]";
    seen.add(value);

    const clean = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      const nestedPath = `${path}.${key}`;
      clean[key] = shouldRedactKeyValue(key, nestedValue)
        ? redactValue(nestedPath, "sensitive key")
        : sanitize(nestedValue, nestedPath);
    });
    return clean;
  };

  const sanitizePrimitive = (value, path) => {
    if (typeof value !== "string") return value;
    if (SHA256_REGEX.test(value.trim())) return value;
    if (EMAIL_REGEX.test(value)) return redactValue(path, "email");
    if (PHONE_REGEX.test(value)) return redactValue(path, "phone");
    return value;
  };

  const shouldRedactKeyValue = (key, value) => {
    return isSensitivePlaintextValue(key, value);
  };

  const redactValue = (path, reason) => {
    redactions.push({ path, reason });
    return `[redacted ${reason}]`;
  };

  const sanitized = sanitize(data || {});
  if (redactions.length > 0) {
    sanitized._privacyRedactions = redactions;
  }
  return sanitized;
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
export function checkDeduplication(
  tabId,
  platform,
  pixelId,
  eventName,
  eventData,
  method,
  windowMs = DEFAULT_SETTINGS.duplicateWindow,
) {
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

  if (lastBroad && now - lastBroad.timestamp < windowMs) {
    // 1. Drop browser fallback (POST vs GET)
    if (lastBroad.method !== method) {
      isDuplicate = true;
    }
    
    // 2. Drop identical double-fires (Same method, Same payload)
    // Professional trackers should merge these to avoid UI noise.
    if (lastExact && now - lastExact.timestamp < windowMs) {
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
