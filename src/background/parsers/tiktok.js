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
 * @returns {TikTokEvent | null}
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

  let pixelId = url.searchParams.get("pixel_code") || url.searchParams.get("id") || "Unknown";
  let eventName =
    url.searchParams.get("event") ||
    url.searchParams.get("event_name") ||
    url.searchParams.get("type") ||
    "Unknown";
  let eventData = {};

  url.searchParams.forEach((value, key) => {
    if (key !== "pixel_code" && key !== "event") {
      eventData[key] = value;
    }
  });

  // Handle POST body (Form Data or JSON)
  if (details.method === "POST" && details.requestBody) {
    if (details.requestBody.formData) {
      for (const key in details.requestBody.formData) {
        eventData[key] = details.requestBody.formData[key][0];
      }
    } else if (details.requestBody.raw && details.requestBody.raw[0].bytes) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        const bodyString = new TextDecoder("utf-8").decode(rawBytes);
        const bodyJson = JSON.parse(bodyString);
        Object.assign(eventData, bodyJson);

        // TikTok JSON payloads often wrap event details in specific keys
        if (bodyJson.event) eventName = bodyJson.event;
        if (bodyJson.event_name) eventName = bodyJson.event_name;
        if (bodyJson.pixel_code) pixelId = bodyJson.pixel_code;
        if (bodyJson.context?.pixel?.code) pixelId = bodyJson.context.pixel.code;
        
        // Performance pings
        if (bodyJson.action === "Pf") eventName = "PerformancePing";
      } catch (e) {
        // Silently fail if not JSON
      }
    }
  }

  const TIKTOK_DIAG_EVENTS = new Set(["Unknown", "Metadata", "SubscribedButtonClick", "PerformancePing"]);
  const isDiagnostic = TIKTOK_DIAG_EVENTS.has(eventName);

  return { platform: "TikTok", pixelId, eventName, eventData, isDiagnostic };
}

