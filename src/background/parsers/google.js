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
  const googleAdsSignal = parseGoogleAdsRequest(url, details);
  if (googleAdsSignal) return googleAdsSignal;

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

function parseGoogleAdsRequest(url, details = {}) {
  const host = String(url.hostname || "").toLowerCase();
  const pathname = String(url.pathname || "");
  const lowerPath = pathname.toLowerCase();
  if (!isGoogleAdsHost(host)) return null;

  const eventData = collectRequestParams(url, details);
  const pixelId = extractGoogleAdsId(pathname, eventData);
  const conversionLabel = extractGoogleAdsLabel(eventData);
  const hasAdsId = pixelId !== "Unknown";

  if (isGoogleAdsRemarketingEndpoint(lowerPath)) {
    return createParsedSignal({
      platform: "Google Ads",
      pixelId,
      eventName: "Remarketing",
      eventData,
      isDiagnostic: !hasAdsId,
      confidence: hasAdsId ? "high" : "medium",
      sourceParser: "google",
      diagnostics: {
        endpoint: "google-ads-remarketing",
      },
    });
  }

  if (isGoogleAdsConversionEndpoint(lowerPath)) {
    if (!hasAdsId) return null;
    return createGoogleAdsConversionSignal({
      pixelId,
      conversionLabel,
      eventData,
      confidence: conversionLabel ? "high" : "medium",
      endpoint: googleAdsConversionEndpointName(lowerPath),
    });
  }

  if (isCcmCollectEndpoint(lowerPath)) {
    if (hasReliableCcmConversionEvidence(eventData, pixelId, conversionLabel)) {
      return createGoogleAdsConversionSignal({
        pixelId,
        conversionLabel,
        eventData,
        confidence: conversionLabel ? "high" : "medium",
        endpoint: "google-ads-ccm-collect",
      });
    }

    if (isGoogleTagPing(eventData)) {
      return createParsedSignal({
        platform: "Diagnostics",
        pixelId: "Google Tag",
        eventName: "Google Tag Ping",
        eventData,
        isDiagnostic: true,
        confidence: "medium",
        sourceParser: "google",
        diagnostics: {
          endpoint: "google-tag-ccm-collect",
          ignoredAsGoogleAdsConversion: true,
        },
      });
    }
  }

  return null;
}

function createGoogleAdsConversionSignal({
  pixelId,
  conversionLabel,
  eventData,
  confidence,
  endpoint,
}) {
  return createParsedSignal({
    platform: "Google Ads",
    pixelId,
    eventName: conversionLabel
      ? `Conversion (${conversionLabel})`
      : "Conversion",
    eventData,
    isDiagnostic: false,
    confidence,
    sourceParser: "google",
    diagnostics: {
      endpoint,
    },
  });
}

function collectRequestParams(url, details = {}) {
  const eventData = {};
  mergeSearchParams(eventData, url.searchParams);
  mergeObjectParams(eventData, parseRequestBodyParams(details));
  return eventData;
}

function isGoogleAdsHost(host = "") {
  return (
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host === "googleadservices.com" ||
    host.endsWith(".googleadservices.com") ||
    host === "googleads.g.doubleclick.net" ||
    host.endsWith(".googleads.g.doubleclick.net") ||
    host === "doubleclick.net" ||
    host.endsWith(".doubleclick.net")
  );
}

function isGoogleAdsConversionEndpoint(pathname = "") {
  return (
    /^\/pagead\/(?:1p-)?conversion(?:\/|$)/.test(pathname) ||
    /^\/pagead\/viewthroughconversion(?:\/|$)/.test(pathname) ||
    /^\/conversion\/(?:aw-)?\d{6,}(?:\/|$)/.test(pathname)
  );
}

function googleAdsConversionEndpointName(pathname = "") {
  if (pathname.includes("/pagead/1p-conversion")) {
    return "google-ads-1p-conversion";
  }
  if (pathname.includes("/pagead/viewthroughconversion")) {
    return "google-ads-viewthroughconversion";
  }
  return "google-ads-conversion";
}

function isGoogleAdsRemarketingEndpoint(pathname = "") {
  return pathname.includes("/ads/ga-audiences");
}

function isCcmCollectEndpoint(pathname = "") {
  return /^\/ccm\/collect(?:\/|$)/.test(pathname);
}

function hasReliableCcmConversionEvidence(eventData, pixelId, conversionLabel) {
  if (pixelId === "Unknown") return false;
  if (sendToHasGoogleAdsConversionLabel(eventData)) return true;
  if (conversionLabel && normalizeEventName(eventData.en) === "conversion") {
    return true;
  }
  return false;
}

function sendToHasGoogleAdsConversionLabel(eventData) {
  const sendTo = String(eventData.send_to || eventData.sendTo || "");
  return /AW-\d+\/[^/?&#,\s]+/i.test(sendTo);
}

function isGoogleTagPing(eventData = {}) {
  return [
    "en",
    "gcs",
    "gcd",
    "gtm",
    "dl",
    "scrsrc",
    "tag_exp",
  ].some((key) => eventData[key] !== undefined && eventData[key] !== "");
}

function extractGoogleAdsLabel(eventData) {
  const sendTo = String(eventData.send_to || eventData.sendTo || "");
  const sendToMatch = sendTo.match(/AW-\d+\/([^/?&#,\s]+)/i);
  return (
    eventData.lbl ||
    eventData.label ||
    eventData.label_id ||
    eventData.google_conversion_label ||
    sendToMatch?.[1] ||
    ""
  );
}

function extractGoogleAdsId(pathname, eventData) {
  const decodedPath = decodeURIComponent(pathname);
  const sendTo = String(eventData.send_to || eventData.sendTo || "");
  const explicitAw =
    decodedPath.match(/AW-\d+/i)?.[0].toUpperCase() ||
    sendTo.match(/AW-\d+/i)?.[0].toUpperCase() ||
    normalizeAwId(
      eventData.awid ||
        eventData.google_conversion_id ||
        eventData.conversion_id ||
        eventData.conversionId ||
        eventData.tid,
    );
  if (explicitAw) return explicitAw;

  const numericPathMatch = decodedPath.match(
    /\/(?:pagead\/(?:1p-)?conversion|pagead\/viewthroughconversion|conversion)\/(\d{6,})(?:[/?]|$)/i,
  );
  if (numericPathMatch) return `AW-${numericPathMatch[1]}`;

  return "Unknown";
}

function normalizeAwId(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^AW-\d+$/i.test(raw)) return raw.toUpperCase();
  if (/^\d{6,}$/.test(raw)) return `AW-${raw}`;
  return "";
}

function normalizeEventName(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

