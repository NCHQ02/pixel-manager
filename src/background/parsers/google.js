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

  // 1. GA4
  if (hostname.includes("google-analytics.com") && pathname.includes("/g/collect")) {
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

      events.push({
        platform: "GA4",
        pixelId,
        eventName,
        eventData: data,
        isDiagnostic: isDiag,
      });
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

    const conversionLabel =
      eventData.lbl || eventData.label || eventData.label_id || eventData.cv;
    let pixelId = "Unknown";
    const match = pathname.match(/(AW-\d+)/);
    if (match) {
      pixelId = match[1];
    } else {
      pixelId =
        eventData.sst_id ||
        eventData.awid ||
        eventData.gclsrc ||
        conversionLabel ||
        "Unknown";
    }

    const eventName = conversionLabel
      ? `Conversion (${conversionLabel})`
      : "Remarketing";

    return {
      platform: "Google Ads",
      pixelId,
      eventName,
      eventData,
      isDiagnostic: false,
    };
  }

  // 3. Floodlight (DV360 / CM360)
  if (
    hostname.includes("doubleclick.net") &&
    (pathname.includes("/activity") || pathname.includes("/ddm/activity"))
  ) {
    const eventData = {};

    // Floodlight uses path parameters: /activity;src=123;type=abc;cat=def
    const pathParts = pathname.split(";");
    pathParts.forEach((part) => {
      const kv = part.split("=");
      if (kv.length === 2) {
        eventData[kv[0]] = kv[1];
      }
    });

    // Also grab any standard query parameters
    url.searchParams.forEach((value, key) => {
      eventData[key] = value;
    });

    const pixelId = eventData.src || "Unknown";
    const eventName =
      eventData.type && eventData.cat ? `${eventData.type} / ${eventData.cat}` : "Floodlight Ping";

    return {
      platform: "Floodlight",
      pixelId,
      eventName,
      eventData,
      isDiagnostic: false,
    };
  }

  return null;
}

