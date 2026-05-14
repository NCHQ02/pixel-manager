import { createParsedSignal } from "../../shared/tracking-catalog.js";

/**
 * @typedef {Object} GoogleEvent
 * @property {string} platform
 * @property {string} pixelId
 * @property {string} eventName
 * @property {Object} eventData
 * @property {boolean} isDiagnostic
 */

/**
 * Parses Google ecosystem requests (GA4, Ads, Floodlight)
 * @param {URL} url
 * @param {chrome.webRequest.WebRequestBodyDetails} details
 * @returns {GoogleEvent | GoogleEvent[] | null}
 */
export function parseGoogleRequest(url, details) {
  const { hostname, pathname } = url;

  if (isStaticAsset(pathname)) return null;

  // 1. GA4
  if (isGa4CollectEndpoint(url)) {
    const baseData = {};
    url.searchParams.forEach((value, key) => {
      baseData[key] = value;
    });

    const pixelId = baseData.tid || "Unknown";
    const events = [];

    /**
     * Process a single GA4 event payload
     * @param {Object} data 
     */
    const processGA4Event = (data) => {
      let eventName = data.en;
      let isImplicitPing = false;

      if (!eventName) {
        eventName = data._et ? "engagement_time_ping" : "system_ping";
        isImplicitPing = true;
      }

      // Hard-drop Tag Assistant and implicit pings
      if (eventName.startsWith("connection__") || isImplicitPing) return;

      const INTERNAL_GA_EVENTS = [
        "open_container_view_sp",
        "worker_install_success",
        "guided_tag_install_enabled",
        "sp__init",
        "init",
        "install_success",
        "engagement_time_ping",
        "system_ping",
      ];

      const isDiag =
        isImplicitPing ||
        eventName.startsWith("gtm.") ||
        eventName.startsWith("optimize.") ||
        INTERNAL_GA_EVENTS.includes(eventName);

      events.push(
        createParsedSignal({
          platform: "GA4",
          pixelId,
          eventName,
          eventData: data,
          isDiagnostic: isDiag,
          sourceParser: "google",
          diagnostics: {
            endpoint: "ga4-collect",
          },
        }),
      );
    };

    // Parse batched events from POST body
    if (details.method === "POST" && details.requestBody?.raw?.[0]?.bytes) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        const bodyString = new TextDecoder("utf-8").decode(rawBytes);
        const batches = bodyString.split("\n");

        batches.forEach((batch) => {
          if (!batch.trim()) return;
          const batchParams = new URLSearchParams(batch);
          const eventData = { ...baseData };
          batchParams.forEach((val, key) => {
            eventData[key] = val;
          });
          processGA4Event(eventData);
        });
      } catch (e) {}
    }

    // If no batches found (e.g. GET request or empty POST)
    if (events.length === 0) {
      processGA4Event(baseData);
    }

    return events;
  }

  // 2. Google Ads Conversion & Remarketing
  if (
    (hostname.includes("google.com") ||
      hostname.includes("googleadservices.com") ||
      hostname.includes("googleads.g.doubleclick.net") ||
      hostname.includes("doubleclick.net")) &&
    (pathname.includes("/pagead/conversion") ||
      pathname.includes("/ads/ga-audiences") ||
      pathname.includes("/pagead/1p-conversion") ||
      pathname.includes("/ccm/collect") ||
      pathname.includes("/conversion"))
  ) {
    const eventData = {};
    url.searchParams.forEach((value, key) => {
      eventData[key] = value;
    });

    const conversionLabel = extractGoogleAdsLabel(eventData);
    const pixelId = extractGoogleAdsId(pathname, eventData);
    const isRemarketing = pathname.includes("/ads/ga-audiences");

    const eventName = isRemarketing
      ? "Remarketing"
      : conversionLabel
      ? `Conversion (${conversionLabel})`
      : "Conversion";

    return createParsedSignal({
      platform: "Google Ads",
      pixelId,
      eventName,
      eventData,
      isDiagnostic: false,
      sourceParser: "google",
      diagnostics: {
        endpoint: "google-ads-conversion",
      },
    });
  }

  // 3. Floodlight (DV360 / CM360)
  if (
    hostname.includes("doubleclick.net") &&
    (pathname.includes("/activity") || pathname.includes("/ddm/activity"))
  ) {
    const eventData = parseFloodlightPathParams(pathname);

    mergeSearchParams(eventData, url.searchParams);
    mergeObjectParams(eventData, parseRequestBodyParams(details));

    const pixelId = eventData.src || "Unknown";
    const eventName =
      eventData.type && eventData.cat ? `${eventData.type} / ${eventData.cat}` : "Floodlight Ping";

    return createParsedSignal({
      platform: "Floodlight",
      pixelId,
      eventName,
      eventData,
      isDiagnostic: false,
      sourceParser: "google",
      diagnostics: {
        endpoint: "floodlight-activity",
      },
    });
  }

  return null;
}

function isStaticAsset(pathname = "") {
  return /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/i.test(pathname);
}

function isGa4CollectEndpoint(url) {
  const host = String(url.hostname || "").toLowerCase();
  const tid = String(url.searchParams.get("tid") || "");
  return (
    url.pathname.includes("/g/collect") &&
    (host.includes("google-analytics.com") ||
      host === "analytics.google.com" ||
      host.endsWith(".analytics.google.com") ||
      (host.endsWith("doubleclick.net") && /^G-[A-Z0-9]+$/i.test(tid)))
  );
}

function extractGoogleAdsLabel(eventData) {
  const sendTo = String(eventData.send_to || eventData.sendTo || "");
  const sendToMatch = sendTo.match(/AW-\d+\/([^/?&#]+)/);
  return eventData.lbl || eventData.label || eventData.label_id || sendToMatch?.[1] || "";
}

function extractGoogleAdsId(pathname, eventData) {
  const decodedPath = decodeURIComponent(pathname);
  const sendTo = String(eventData.send_to || eventData.sendTo || "");
  const explicitAw =
    decodedPath.match(/AW-\d+/)?.[0] ||
    sendTo.match(/AW-\d+/)?.[0] ||
    normalizeAwId(eventData.awid || eventData.google_conversion_id);
  if (explicitAw) return explicitAw;

  const numericPathMatch = decodedPath.match(
    /\/(?:pagead\/(?:1p-)?conversion|conversion)\/(\d{6,})(?:[/?]|$)/,
  );
  if (numericPathMatch) return `AW-${numericPathMatch[1]}`;

  return eventData.sst_id || "Unknown";
}

function normalizeAwId(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^AW-\d+$/.test(raw)) return raw;
  if (/^\d{6,}$/.test(raw)) return `AW-${raw}`;
  return "";
}

function mergeSearchParams(target, searchParams) {
  searchParams.forEach((value, key) => {
    target[key] = value;
  });
}

function mergeObjectParams(target, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      target[key] = value;
    }
  });
}

function parseRequestBodyParams(details = {}) {
  const requestBody = details.requestBody;
  if (!requestBody) return {};

  const params = {};

  if (requestBody.formData) {
    Object.entries(requestBody.formData).forEach(([key, values]) => {
      const [value] = Array.isArray(values) ? values : [values];
      params[key] = parseMaybeJson(value);
    });
  }

  (requestBody.raw || []).forEach((item) => {
    if (!item?.bytes) return;
    try {
      mergeObjectParams(
        params,
        parseRawBodyParams(new TextDecoder("utf-8").decode(item.bytes)),
      );
    } catch (_e) {}
  });

  return params;
}

function parseRawBodyParams(raw = "") {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return {};

  if (looksLikeJson(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [
              key,
              parseMaybeJson(value),
            ]),
          )
        : {};
    } catch (_e) {
      return {};
    }
  }

  if (!trimmed.includes("=")) return {};
  const params = {};
  const bodyParams = new URLSearchParams(trimmed);
  bodyParams.forEach((value, key) => {
    params[key] = parseMaybeJson(value);
  });
  return params;
}

function looksLikeJson(raw = "") {
  const trimmed = String(raw).trim();
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

function parseFloodlightPathParams(pathname) {
  const eventData = {};
  const decodedPath = decodeURIComponent(pathname);
  const activityMatch = decodedPath.match(/\/(?:ddm\/)?activity\/?(.+)$/);
  const rawParams = activityMatch?.[1] || "";
  const cleanParams = rawParams.startsWith(";") ? rawParams.slice(1) : rawParams;

  cleanParams.split(";").forEach((part) => {
    if (!part || !part.includes("=")) return;
    const [rawKey, ...valueParts] = part.split("=");
    const key = rawKey.split("/").pop();
    if (!key) return;
    eventData[key] = valueParts.join("=");
  });

  return eventData;
}

