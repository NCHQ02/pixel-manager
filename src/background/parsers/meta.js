/**
 * @typedef {Object} MetaEvent
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Object} eventData
 * @property {boolean} isDiagnostic
 */

/**
 * Parses Meta (Facebook) Pixel requests
 * @param {URL} url
 * @param {chrome.webRequest.WebRequestBodyDetails} details
 * @returns {MetaEvent | null}
 */
export function parseMetaRequest(url, details) {
  const isMeta = url.hostname.includes("facebook.com") && url.pathname.includes("/tr");
  if (!isMeta) return null;

  let pixelId = url.searchParams.get("id") || "Unknown";
  let eventName = url.searchParams.get("ev") || "Unknown";
  let eventData = { cd: {} };

  // Helper to extract Meta-style custom data
  const processParam = (key, value) => {
    if (key.startsWith("cd[")) {
      const cleanKey = key.replace("cd[", "").replace("]", "");
      eventData.cd[cleanKey] = value;
    } else if (key !== "id" && key !== "ev") {
      eventData[key] = value;
    }
  };

  // 1. Extract from URL params
  url.searchParams.forEach((value, key) => processParam(key, value));

  // 2. Extract from POST body
  if (details.method === "POST" && details.requestBody) {
    if (details.requestBody.formData) {
      const formData = details.requestBody.formData;
      if (formData.id) pixelId = formData.id[0];
      if (formData.ev) eventName = formData.ev[0];
      for (const key in formData) {
        processParam(key, formData[key][0]);
      }
    } else if (details.requestBody.raw && details.requestBody.raw[0].bytes) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        const bodyString = new TextDecoder("utf-8").decode(rawBytes);
        const params = new URLSearchParams(bodyString);
        params.forEach((value, key) => {
          if (key === "id") pixelId = value;
          else if (key === "ev") eventName = value;
          else processParam(key, value);
        });
      } catch (e) {}
    }
  }

  // Meta sometimes sends `cd` as a serialized JSON string
  if (eventData.cd && typeof eventData.cd === "string") {
    try {
      eventData.cd = JSON.parse(eventData.cd);
    } catch (_e) {}
  }

  const isDiagnostic = eventName === "Microdata" || eventName === "SubscribedButtonClick";

  return { platform: "Meta", pixelId, eventName, eventData, isDiagnostic };
}

