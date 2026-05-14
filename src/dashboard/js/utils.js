/**
 * Platform Metadata for consistent UI rendering
 */
export const PLATFORMS = {
  Meta: {
    label: "Meta Pixel",
    icon: "assets/icons/meta.png",
    color: "#0668E1",
    bgClass: "bg-meta",
    description:
      "Deep-packet inspection of standard events, Advanced Matching (PII), and custom conversions routed to Meta's tracking infrastructure.",
    heroTitle: "Meta Pixel Intelligence",
  },
  TikTok: {
    label: "TikTok Pixel",
    icon: "assets/icons/tiktok.png",
    color: "#000000",
    bgClass: "bg-tiktok",
    description:
      "Real-time monitoring of browser-side interactions, session signals, and performance pings dispatched to the TikTok Ads engine.",
    heroTitle: "TikTok Event Stream",
  },
  GA4: {
    label: "GA4",
    icon: "assets/icons/ga4.svg",
    color: "#E37400",
    bgClass: "bg-google",
    description:
      "High-fidelity interception of GA4 Measurement Protocol pings, Google Ads conversions, and Floodlight activity.",
    heroTitle: "Google Suite Analysis",
  },
  "Google Ads": {
    label: "Google Ads",
    icon: "assets/icons/google-ads.png",
    color: "#4285F4",
    bgClass: "bg-google",
    description:
      "Monitoring conversion signals, GCLID attribution, and dynamic remarketing events for Google Ads.",
    heroTitle: "Google Ads Tracking",
  },
  Floodlight: {
    label: "Floodlight",
    icon: "assets/icons/floodlight.svg",
    color: "#00A1E0",
    bgClass: "bg-google",
    description:
      "Interception of Campaign Manager 360 Floodlight tags and Search Ads 360 conversion signals.",
    heroTitle: "Floodlight Monitor",
  },
  DataLayer: {
    label: "DataLayer",
    icon: "assets/icons/google-tag-manager.png",
    color: "#2485FF",
    bgClass: "bg-google",
    description:
      "Real-time monitoring of the GTM DataLayer object, tracking state changes and variable pushes.",
    heroTitle: "DataLayer Inspection",
  },
  Google: {
    label: "Google Suite",
    icon: "assets/icons/google.png",
    color: "#4285F4",
    bgClass: "bg-google",
    description:
      "Unified monitoring of GA4 Measurement Protocol, Google Ads Conversions, and DV360 Floodlight activity across all properties.",
    heroTitle: "Google Ecosystem",
  },
  Diagnostics: {
    label: "Diagnostics",
    icon: "assets/icons/diagnostics.png",
    color: "#6B7280",
    bgClass: "bg-cream",
    description:
      "Subsurface system signals, automated microdata pings, and low-level diagnostic traces used for platform health.",
    heroTitle: "System Diagnostics",
  },
  All: {
    label: "Global Stream",
    icon: null,
    color: "#6366F1",
    bgClass: "bg-lilac",
    description:
      "A unified, unstructured view of all tracking signals intercepted from social and search platforms across this session.",
    heroTitle: "Universal Event Canvas",
  },
};

/**
 * Gets metadata for a platform
 * @param {string} platform
 * @returns {typeof PLATFORMS.Meta}
 */
export function getPlatformMeta(platform) {
  return PLATFORMS[platform] || PLATFORMS.Diagnostics;
}

/**
 * Formats a timestamp into HH:mm:ss.SSS
 * @param {number} timestamp
 * @returns {string}
 */
export function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
}

/**
 * Escapes HTML characters to prevent XSS
 * @param {string} unsafe
 * @returns {string}
 */
export function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Extracts specific rich details from raw event data
 * @param {object} eventData
 * @param {string} platform
 * @returns {object}
 */
export function extractRichDetails(eventData, platform) {
  const details = {};

  if (platform === "TikTok") {
    if (eventData.message_id) details["Message ID"] = eventData.message_id;
    if (eventData.session_id) details["Session ID"] = eventData.session_id;
    if (eventData.event_id) details["Event ID"] = eventData.event_id;

    if (eventData.context) {
      if (eventData.context.page && eventData.context.page.url)
        details["Page URL"] = eventData.context.page.url;
      if (eventData.context.page && eventData.context.page.referrer)
        details["Referrer"] = eventData.context.page.referrer;
      if (eventData.context.user && eventData.context.user.anonymous_id)
        details["Anonymous ID"] = eventData.context.user.anonymous_id;
      if (eventData.context.device && eventData.context.device.platform)
        details["Device"] = eventData.context.device.platform;
      if (eventData.context.library && eventData.context.library.version)
        details["Library"] = `pixel.js v${eventData.context.library.version}`;
      if (eventData.context.userAgent)
        details["User Agent"] = eventData.context.userAgent;
    }
    if (eventData.properties && Object.keys(eventData.properties).length > 0) {
      Object.keys(eventData.properties).forEach((k) => {
        if (typeof eventData.properties[k] !== "object") {
          details[`Prop: ${k}`] = eventData.properties[k];
        }
      });
    }
    if (eventData.signal_diagnostic_labels) {
      const presentLabels = [];
      for (const k in eventData.signal_diagnostic_labels) {
        if (eventData.signal_diagnostic_labels[k].label !== "missing") {
          presentLabels.push(k);
        }
      }
      if (presentLabels.length > 0) {
        details["User Data"] = presentLabels.join(", ");
      }
    }
    if (
      eventData._rawParsed &&
      eventData._rawParsed.auto_collected_properties
    ) {
      const autoProps = eventData._rawParsed.auto_collected_properties;
      if (autoProps.action_event)
        details["Auto Action"] = autoProps.action_event;
    }
  } else if (
    ["GA4", "Google Ads", "Floodlight", "DataLayer"].includes(platform)
  ) {
    if (platform === "GA4") {
      if (eventData.tid) details["Measurement ID"] = eventData.tid;
      if (eventData.cid) details["Client ID"] = eventData.cid;
      if (eventData.sid) details["Session ID"] = eventData.sid;
      if (eventData.seg) details["Session Engagement"] = eventData.seg;

      // Consent Mode decoding
      if (eventData.gcs) {
        const gcs = eventData.gcs;
        if (gcs.length >= 4) {
          const ad = gcs[2] === "1" ? "Granted" : "Denied";
          const an = gcs[3] === "1" ? "Granted" : "Denied";
          details["Consent (gcs)"] = `Ads: ${ad} | Analytics: ${an}`;
        } else {
          details["Consent (gcs)"] = gcs;
        }
      }
      if (eventData.gcd) details["Consent (gcd)"] = eventData.gcd;

      // Extract Event Parameters (ep.) and User Properties (up.)
      Object.keys(eventData).forEach((k) => {
        if (k.startsWith("ep."))
          details[`Param: ${k.replace("ep.", "")}`] = eventData[k];
        else if (k.startsWith("epn."))
          details[`Param (Num): ${k.replace("epn.", "")}`] = eventData[k];
        else if (k.startsWith("up."))
          details[`User Prop: ${k.replace("up.", "")}`] = eventData[k];
      });

      // E-commerce extraction
      let items = [];
      let i = 1;
      while (eventData[`pr${i}id`] || eventData[`pr${i}nm`]) {
        let item = {};
        if (eventData[`pr${i}id`]) item.id = eventData[`pr${i}id`];
        if (eventData[`pr${i}nm`]) item.name = eventData[`pr${i}nm`];
        if (eventData[`pr${i}pr`]) item.price = eventData[`pr${i}pr`];
        if (eventData[`pr${i}qt`]) item.quantity = eventData[`pr${i}qt`];
        items.push(item);
        i++;
      }
      if (items.length > 0) {
        details["E-commerce Items"] = JSON.stringify(items, null, 2);
      }
    } else if (platform === "Google Ads") {
      if (eventData.gclid || eventData.gclaw)
        details["GCLID"] = eventData.gclid || eventData.gclaw;
      if (eventData.gbraid) details["GBRAID"] = eventData.gbraid;
      if (eventData.wbraid) details["WBRAID"] = eventData.wbraid;
      if (eventData.val || eventData.value)
        details["Conversion Value"] = eventData.val || eventData.value;
      if (eventData.cu || eventData.currency_code)
        details["Currency"] = eventData.cu || eventData.currency_code;
    } else if (platform === "Floodlight") {
      if (eventData.src) details["Advertiser ID"] = eventData.src;
      if (eventData.type) details["Group Tag"] = eventData.type;
      if (eventData.cat) details["Activity Tag"] = eventData.cat;
      if (eventData.ord) details["Order ID"] = eventData.ord;
      Object.keys(eventData).forEach((k) => {
        if (k.match(/^u\d+$/)) details[`Custom Var (${k})`] = eventData[k];
      });
    } else if (platform === "DataLayer") {
      Object.keys(eventData).forEach((k) => {
        if (k !== "event" && k !== "gtm.uniqueEventId") {
          details[k] =
            typeof eventData[k] === "object"
              ? JSON.stringify(eventData[k], null, 2)
              : eventData[k];
        }
      });
    }
  } else if (platform === "Meta") {
    if (eventData.ev) details["Event Type"] = eventData.ev;
    if (eventData.eid || eventData.event_id)
      details["Event ID"] = eventData.eid || eventData.event_id;
    if (eventData.dl) details["Page URL"] = eventData.dl;
    if (eventData.rl) details["Referrer"] = eventData.rl;
    if (eventData.v) details["Version"] = eventData.v;
    if (eventData.sw && eventData.sh)
      details["Screen"] = `${eventData.sw} x ${eventData.sh}`;
    if (eventData.fbp) details["FBP Cookie"] = eventData.fbp;
    if (eventData.fbc) details["FBC Cookie"] = eventData.fbc;

    if (eventData.ud) {
      const keys = Object.keys(eventData.ud).filter(
        (k) => eventData.ud[k] !== "",
      );
      if (keys.length > 0) details["User Data Keys"] = keys.join(", ");
    }
    if (eventData.cd) {
      Object.keys(eventData.cd).forEach((k) => {
        if (typeof eventData.cd[k] !== "object") {
          details[`Custom: ${k}`] = eventData.cd[k];
        }
      });
    }
  }

  return details;
}

/**
 * Detects if an event contains Advanced Matching (User Data)
 * @param {object} eventData
 * @param {string} platform
 * @returns {Array} List of found user data keys
 */
export function detectAdvancedMatching(eventData, platform) {
  const amKeys = [];
  const d = eventData;

  if (platform === "Meta") {
    if (d.fbp) amKeys.push("fbp");
    if (d.fbc) amKeys.push("fbc");
    if (d.ud) {
      Object.keys(d.ud).forEach((k) => {
        if (d.ud[k]) amKeys.push(`ud:${k}`);
      });
    }
  } else if (platform === "TikTok") {
    // TikTok often sends user data in context or as top-level hashed params
    if (d.external_id) amKeys.push("external_id");
    if (d.em) amKeys.push("email (hashed)");
    if (d.ph) amKeys.push("phone (hashed)");
    if (d.context && d.context.user) {
      if (d.context.user.external_id) amKeys.push("external_id");
      if (d.context.user.email) amKeys.push("email");
    }
  } else if (platform === "Google Ads") {
    if (d.em) amKeys.push("email");
    if (d.ph) amKeys.push("phone");
    if (d.tv) {
      if (d.tv.includes("~em")) amKeys.push("email (tv)");
      if (d.tv.includes("~ph")) amKeys.push("phone (tv)");
    }
  }

  return amKeys;
}

/**
 * Detects plaintext PII (Email, Phone) in event data.
 * @param {object} obj 
 * @param {Array} warnings 
 * @param {string} path 
 */
function detectPlaintextPII(obj, warnings, path = "data") {
  if (!obj || typeof obj !== "object") return;

  const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  const PHONE_REGEX = /(\+?\d{1,4}[\s-])?\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}/;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = `${path}.${key}`;
    
    if (typeof value === "string") {
      if (EMAIL_REGEX.test(value)) {
        warnings.push(`Plaintext Email detected at '${currentPath}'. This violates privacy policies if not hashed (SHA-256).`);
      } else if (PHONE_REGEX.test(value)) {
        warnings.push(`Plaintext Phone Number detected at '${currentPath}'. This violates privacy policies if not hashed (SHA-256).`);
      }
    } else if (typeof value === "object" && value !== null) {
      detectPlaintextPII(value, warnings, currentPath);
    }
  }
}

/**
 * Advanced Audit & Validation for Pixel events
 * @param {object} event
 * @returns {Array} List of warning messages
 */
export function auditEvent(event) {
  const warnings = [];
  const { platform, eventName, eventData } = event;

  if (eventData._privacyRedactions?.length > 0) {
    warnings.push(
      `${eventData._privacyRedactions.length} plaintext sensitive value(s) were redacted before local storage.`,
    );
  }

  if (eventData._duplicateWarning) {
    warnings.push(
      "Duplicate Firing Detected: This event was fired multiple times simultaneously. Check for duplicate pixel installations or double tag triggers.",
    );
  }

  // Generic PII Check for all platforms
  detectPlaintextPII(eventData, warnings);

  const isSha256 = (str) => /^[a-f0-9]{64}$/i.test(String(str).trim());
  const isCurrency = (str) => /^[A-Z]{3}$/i.test(String(str).trim());

  if (platform === "Meta") {
    // Schema validation for Purchase
    if (eventName === "Purchase") {
      if (!eventData.cd || eventData.cd.value === undefined) {
        warnings.push("Missing 'value' parameter for Purchase event.");
      } else if (isNaN(parseFloat(eventData.cd.value))) {
        warnings.push("'value' parameter must be a valid number.");
      }

      if (!eventData.cd || !eventData.cd.currency) {
        warnings.push("Missing 'currency' parameter for Purchase event.");
      } else if (!isCurrency(eventData.cd.currency)) {
        warnings.push(
          "'currency' parameter should be a valid 3-letter ISO code.",
        );
      }
    }

    // PII / Advanced Matching validation (Specific keys)
    if (eventData.ud) {
      Object.keys(eventData.ud).forEach((k) => {
        const val = eventData.ud[k];
        if (val && !isSha256(val) && (k === "em" || k === "ph")) {
          if (!warnings.some(w => w.includes(`'${k}'`))) {
             warnings.push(`User Data '${k}' is unhashed plaintext. It must be SHA-256 hashed for privacy compliance.`);
          }
        }
      });
    }
  } else if (platform === "TikTok") {
    // Schema validation for purchase-style events, including legacy aliases.
    if (["Purchase", "CompletePayment", "PlaceAnOrder"].includes(eventName)) {
      if (!eventData.properties || eventData.properties.value === undefined) {
        warnings.push(`Missing 'value' parameter for ${eventName}.`);
      } else if (isNaN(parseFloat(eventData.properties.value))) {
        warnings.push("'value' parameter must be a valid number.");
      }

      if (eventData.properties && eventData.properties.currency) {
        if (!isCurrency(eventData.properties.currency)) {
          warnings.push(
            "'currency' parameter should be a valid 3-letter ISO code.",
          );
        }
      } else {
        warnings.push(`Missing 'currency' parameter for ${eventName}.`);
      }
    }
  }

  return warnings;
}

/**
 * Classifies an event into the user-facing audit status buckets.
 * @param {object} event
 * @param {Array} warnings
 * @returns {{key: string, label: string}}
 */
export function classifyEventStatus(event, warnings = auditEvent(event)) {
  if (event.isDiagnostic || event.status === "diagnostic") {
    return { key: "diagnostic", label: "Diagnostic" };
  }

  if (event.eventData?._duplicateWarning || event.status === "duplicate") {
    return { key: "duplicate", label: "Duplicate" };
  }

  if (event.status === "missing_params") {
    return { key: "missing", label: "Missing Params" };
  }

  if (
    warnings.some((warning) =>
      /^Missing/i.test(String(warning)) ||
      String(warning).includes("Missing '"),
    )
  ) {
    return { key: "missing", label: "Missing Params" };
  }

  if (warnings.length > 0 || event.status === "warning") {
    return { key: "warning", label: "Warning" };
  }

  return { key: "valid", label: "Valid" };
}


/**
 * Groups events by Session (Tab ID + Inactivity window)
 * @param {Array} events
 * @param {number} windowMs
 * @returns {Array} Array of sessions
 */
export function groupEventsBySession(events, windowMs = 1800000) {
  if (!events || events.length === 0) return [];

  // 1. Group events by tabId first to ensure we don't mix tabs in a single session
  const eventsByTab = {};
  events.forEach((e) => {
    const tid = e.tabId || "unknown";
    if (!eventsByTab[tid]) eventsByTab[tid] = [];
    eventsByTab[tid].push(e);
  });

  const allSessions = [];

  // 2. For each tab, group events by inactivity window (Standard 30 min)
  Object.values(eventsByTab).forEach((tabEvents) => {
    const sorted = [...tabEvents].sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length === 0) return;

    let currentSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: sorted[0].url,
      hostname: safeHostname(sorted[0].url),
      startTime: sorted[0].timestamp,
      endTime: sorted[0].timestamp,
      events: [sorted[0]],
    };

    for (let i = 1; i < sorted.length; i++) {
      const event = sorted[i];
      const lastEvent = sorted[i - 1];

      // If gap is less than windowMs, it's the same session
      if (event.timestamp - lastEvent.timestamp < windowMs) {
        currentSession.events.push(event);
        currentSession.endTime = event.timestamp;
      } else {
        allSessions.push(currentSession);
        currentSession = {
          id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: event.url,
          hostname: safeHostname(event.url),
          startTime: event.timestamp,
          endTime: event.timestamp,
          events: [event],
        };
      }
    }
    allSessions.push(currentSession);
  });

  return allSessions.sort((a, b) => b.startTime - a.startTime);
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "Unknown URL";
  }
}

/**
 * Converts events to CSV string
 * @param {Array} events
 */
export function eventsToCsv(events) {
  const headers = [
    "Time",
    "Platform",
    "Event Name",
    "Pixel ID",
    "Method",
    "Status",
    "Duplicate Count",
    "Source",
    "URL",
    "Raw Data",
  ];
  const rows = events.map((e) => [
    new Date(e.timestamp).toISOString(),
    e.platform,
    e.eventName,
    e.pixelId,
    e.method || "GET",
    e.status || classifyEventStatus(e).key,
    e.duplicateCount || 0,
    e.source || "network",
    e.url,
    JSON.stringify(e.eventData),
  ]);

  const escapeCsvCell = (cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}
