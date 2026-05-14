import { createParsedSignal } from "../../shared/tracking-catalog.js";

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
  let eventData = { cd: {}, ud: {} };

  // Helper to extract Meta-style custom data and advanced matching fields.
  const processParam = (key, value) => {
    const parsedValue = parseMaybeJson(value);

    if (key === "id") {
      pixelId = value;
      return;
    }

    if (key === "ev") {
      eventName = value;
      return;
    }

    if (key === "cd" || key === "ud") {
      mergeObjectParam(eventData, key, parsedValue);
      return;
    }

    const bracket = parseBracketKey(key);
    if (bracket && (bracket.root === "cd" || bracket.root === "ud")) {
      assignNested(eventData[bracket.root], bracket.path, parsedValue);
    } else if (key !== "id" && key !== "ev") {
      eventData[key] = parsedValue;
    }
  };

  // 1. Extract from URL params
  url.searchParams.forEach((value, key) => processParam(key, value));

  // 2. Extract from POST body
  if (details.method === "POST" && details.requestBody) {
    if (details.requestBody.formData) {
      const formData = details.requestBody.formData;
      for (const key in formData) {
        processParam(key, formData[key][0]);
      }
    } else if (details.requestBody.raw && details.requestBody.raw[0].bytes) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        const bodyString = new TextDecoder("utf-8").decode(rawBytes);
        if (looksLikeJson(bodyString)) {
          const bodyJson = JSON.parse(bodyString);
          Object.entries(flattenMetaJsonBody(bodyJson)).forEach(([key, value]) =>
            processParam(key, value),
          );
        } else {
          const params = new URLSearchParams(bodyString);
          params.forEach((value, key) => processParam(key, value));
        }
      } catch (e) {}
    }
  }

  const isDiagnostic =
    eventName === "Microdata" || eventName === "SubscribedButtonClick";

  return createParsedSignal({
    platform: "Meta",
    pixelId,
    eventName,
    eventData,
    isDiagnostic,
    sourceParser: "meta",
    diagnostics: {
      endpoint: "facebook.com/tr",
    },
  });
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

function parseBracketKey(key) {
  const match = String(key).match(/^([^\[]+)((?:\[[^\]]*\])+)$/);
  if (!match) return null;
  const path = [...match[2].matchAll(/\[([^\]]*)\]/g)]
    .map((item) => item[1])
    .filter(Boolean);
  if (path.length === 0) return null;
  return { root: match[1], path };
}

function assignNested(target, path, value) {
  let current = target;
  path.forEach((part, index) => {
    if (index === path.length - 1) {
      current[part] = value;
      return;
    }
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = /^\d+$/.test(path[index + 1]) ? [] : {};
    }
    current = current[part];
  });
}

function mergeObjectParam(target, key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    target[key] = {
      ...(target[key] && typeof target[key] === "object" ? target[key] : {}),
      ...value,
    };
  } else {
    target[key] = value;
  }
}

function flattenMetaJsonBody(bodyJson) {
  const flattened = {};
  Object.entries(bodyJson || {}).forEach(([key, value]) => {
    if (key === "custom_data") flattened.cd = value;
    else if (key === "user_data") flattened.ud = value;
    else if (key === "event_name") flattened.ev = value;
    else flattened[key] = value;
  });
  return flattened;
}
