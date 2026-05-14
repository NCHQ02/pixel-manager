/**
 * @typedef {Object} TikTokEvent
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Object} eventData
 * @property {boolean} isDiagnostic
 */

/**
 * Parses TikTok Pixel requests
 * @param {URL} url
 * @param {chrome.webRequest.WebRequestBodyDetails} details
 * @returns {TikTokEvent | TikTokEvent[] | null}
 */
export function parseTikTokRequest(url, details) {
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i)) {
    return null;
  }

  const isTikTok =
    (url.hostname.includes("tiktok.com") || url.hostname.includes("byteoversea.com")) &&
    (url.pathname.includes("pixel") ||
      url.pathname.includes("event") ||
      url.pathname.includes("track") ||
      url.pathname.includes("api") ||
      url.pathname.includes("log") ||
      url.hostname.includes("analytics") ||
      url.hostname.includes("tr."));

  if (!isTikTok) return null;

  const baseData = {};

  url.searchParams.forEach((value, key) => {
    baseData[key] = parseMaybeJson(value);
  });

  const events = [];
  const addEvent = (payload = {}) => {
    const eventData = normalizePayload({ ...baseData, ...payload });
    let pixelId = getFirstValue(eventData, [
      "pixel_code",
      "pixelCode",
      "pixel_id",
      "pixel",
      "id",
      "sdkid",
      "context.pixel.code",
      "context.pixel.id",
    ]);
    let eventName = getFirstValue(eventData, [
      "event",
      "event_name",
      "eventName",
      "event_type",
      "type",
      "name",
    ]);

    if (eventData.action === "Pf") eventName = "PerformancePing";

    pixelId = pixelId || "Unknown";
    eventName = normalizeTikTokEventName(eventName || "Unknown");

    const TIKTOK_DIAG_EVENTS = new Set([
      "Unknown",
      "Metadata",
      "SubscribedButtonClick",
      "PerformancePing",
    ]);
    const isDiagnostic = TIKTOK_DIAG_EVENTS.has(eventName);

    events.push({ platform: "TikTok", pixelId, eventName, eventData, isDiagnostic });
  };

  // Handle POST body (Form Data, URL-encoded data, JSON, or JSON batches)
  if (details.method === "POST" && details.requestBody) {
    if (details.requestBody.formData) {
      const formPayload = {};
      for (const key in details.requestBody.formData) {
        formPayload[key] = parseMaybeJson(details.requestBody.formData[key][0]);
      }
      addPayloadOrBatch(formPayload, addEvent);
    } else if (details.requestBody.raw && details.requestBody.raw[0].bytes) {
      const rawBytes = details.requestBody.raw[0].bytes;
      const bodyString = new TextDecoder("utf-8").decode(rawBytes);
      parseRawBodyPayloads(bodyString).forEach((payload) => addPayloadOrBatch(payload, addEvent));
    }
  }

  if (events.length === 0) addEvent(baseData);

  return events.length === 1 ? events[0] : events;
}

function normalizeTikTokEventName(eventName) {
  return eventName === "PageView" ? "Pageview" : eventName;
}

function parseRawBodyPayloads(bodyString = "") {
  const trimmed = bodyString.trim();
  if (!trimmed) return [];

  if (looksLikeJson(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_e) {
      return [];
    }
  }

  const params = new URLSearchParams(bodyString);
  const payload = {};
  params.forEach((value, key) => {
    payload[key] = parseMaybeJson(value);
  });
  return [payload];
}

function addPayloadOrBatch(payload, addEvent) {
  const normalized = normalizePayload(payload || {});
  const batch = normalized.events || normalized.event_list || normalized.eventList;

  if (Array.isArray(batch)) {
    const common = { ...normalized };
    delete common.events;
    delete common.event_list;
    delete common.eventList;
    batch.forEach((eventPayload) => addEvent({ ...common, ...eventPayload }));
    return;
  }

  addEvent(normalized);
}

function normalizePayload(payload) {
  const normalized = { ...payload };
  ["properties", "context", "auto_collected_properties", "signal_diagnostic_labels"].forEach(
    (key) => {
      normalized[key] = parseMaybeJson(normalized[key]);
    },
  );
  return normalized;
}

function getFirstValue(obj, paths) {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function getPath(obj, path) {
  return path.split(".").reduce((current, part) => {
    if (current == null) return undefined;
    return current[part];
  }, obj);
}

function looksLikeJson(raw = "") {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!looksLikeJson(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    return value;
  }
}

