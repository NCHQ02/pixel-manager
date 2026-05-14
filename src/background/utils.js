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
const EMAIL_GLOBAL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const FORMATTED_PHONE_REGEX =
  /(\+?\d{1,4}[\s.-])?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}/;
const FORMATTED_PHONE_GLOBAL_REGEX =
  /(\+?\d{1,4}[\s.-])?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}/g;
const COMPACT_PHONE_REGEX = /^\+?\d{8,15}$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const SENSITIVE_KEY_REGEX =
  /(^|_|\b)(email|e-mail|phone|mobile|first_name|last_name|fullname|full_name|address|street|city|zip|postcode|dob|birth|external_id)(_|$|\b)/i;
const URL_LIKE_REGEX = /^[a-z][a-z\d+.-]*:\/\//i;
const REDACTED_VALUE = "[redacted sensitive value]";

function isLikelyPhonePathSegment(value) {
  const normalized = String(value || "").replace(/[\s().-]/g, "");
  return (
    /^\+\d{8,15}$/.test(normalized) ||
    /^(0\d{8,10}|84\d{8,11}|1\d{10})$/.test(normalized)
  );
}

function isSensitivePlaintextValue(key, value) {
  if (value === undefined || value === null) return false;
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  if (SHA256_REGEX.test(stringValue)) return false;
  if (SENSITIVE_KEY_REGEX.test(key)) return true;
  return (
    EMAIL_REGEX.test(stringValue) ||
    FORMATTED_PHONE_REGEX.test(stringValue)
  );
}

function keyFromPath(path = "") {
  const normalized = String(path).replace(/\[\d+\]$/g, "");
  return normalized.split(".").pop() || "";
}

function redactSensitiveText(text, key = "") {
  let redacted = String(text);
  redacted = redacted.replace(EMAIL_GLOBAL_REGEX, REDACTED_VALUE);
  redacted = redacted.replace(FORMATTED_PHONE_GLOBAL_REGEX, REDACTED_VALUE);
  if (
    redacted === text &&
    (SENSITIVE_KEY_REGEX.test(key) ||
      ((key === "url_path" || key === "url_hash") &&
        isLikelyPhonePathSegment(redacted)))
  ) {
    redacted = REDACTED_VALUE;
  }
  return redacted;
}

function sanitizeUrlPathname(pathname = "") {
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      const decoded = safeDecodeURIComponent(segment);
      const redacted = redactSensitiveText(decoded, "url_path");
      return redacted === decoded ? segment : encodeURIComponent(redacted);
    })
    .join("/");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_e) {
    return value;
  }
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
        parsed.searchParams.set(key, REDACTED_VALUE);
      }
    });
    parsed.pathname = sanitizeUrlPathname(parsed.pathname);
    if (parsed.hash) {
      const decodedHash = safeDecodeURIComponent(parsed.hash.slice(1));
      const redactedHash = redactSensitiveText(decodedHash, "url_hash");
      if (redactedHash !== decodedHash) parsed.hash = redactedHash;
    }
    return parsed.toString();
  } catch (_e) {
    return redactSensitiveText(rawUrl, "url");
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
    const trimmed = value.trim();
    if (URL_LIKE_REGEX.test(trimmed)) {
      const sanitizedUrl = sanitizeCapturedUrl(trimmed);
      if (sanitizedUrl !== trimmed) {
        redactions.push({ path, reason: "sensitive URL" });
      }
      return sanitizedUrl;
    }
    if (SHA256_REGEX.test(trimmed)) return value;
    const key = keyFromPath(path);
    if (SENSITIVE_KEY_REGEX.test(key) && trimmed.length > 0) {
      return redactValue(path, "sensitive key");
    }
    if (EMAIL_REGEX.test(value)) return redactValue(path, "email");
    if (FORMATTED_PHONE_REGEX.test(value)) {
      return redactValue(path, "phone");
    }
    return value;
  };

  const shouldRedactKeyValue = (key, value) => {
    if (typeof value === "string" && URL_LIKE_REGEX.test(value.trim())) {
      return false;
    }
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
 * @returns {{ isDuplicate: boolean, isWarning: boolean, isSuppressed: boolean, dedupeKey: string, payloadHash: string }}
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
  const hasEventId = !!eventId;
  const payloadHash = generateStablePayloadHash(eventData);
  let dedupeKey = eventId;

  if (!dedupeKey || platform === "GA4" || platform === "DataLayer") {
    dedupeKey = payloadHash;
  }

  const broadFingerprint = `${tabId}:${platform}:${pixelId}:${eventName}`;
  const exactFingerprint = `${broadFingerprint}:${dedupeKey}`;
  const now = Date.now();
  
  const lastBroad = lastEventFingerprints.get(broadFingerprint);
  const lastExact = lastEventFingerprints.get(exactFingerprint);

  let isDuplicate = false;
  let isWarning = false;
  let isSuppressed = false;

  if (lastBroad && now - lastBroad.timestamp < windowMs && lastExact) {
    const exactWithinWindow = now - lastExact.timestamp < windowMs;
    if (exactWithinWindow) {
      if (hasEventId || lastExact.method === method) {
        isDuplicate = true;
      } else if (platform === "Meta") {
        // Meta can mirror the same browser hit across GET/POST transport.
        // Suppress that local capture noise without showing a duplicate badge.
        isSuppressed = true;
      }
    }
  }

  if (!isDuplicate && !isSuppressed) {
    lastEventFingerprints.set(broadFingerprint, { timestamp: now, method });
    lastEventFingerprints.set(exactFingerprint, { timestamp: now, method });
  }

  return { isDuplicate, isWarning, isSuppressed, dedupeKey, payloadHash };
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
