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
        (k) => eventData.ud[k] !== ""
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
      Object.keys(d.ud).forEach(k => {
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
  }

  return amKeys;
}

/**
 * Advanced Audit & Validation for Pixel events
 * @param {object} event 
 * @returns {Array} List of warning messages
 */
export function auditEvent(event) {
  const warnings = [];
  const { platform, eventName, eventData } = event;
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
        warnings.push("'currency' parameter should be a valid 3-letter ISO code.");
      }
    }

    // PII / Advanced Matching validation
    if (eventData.ud) {
      Object.keys(eventData.ud).forEach(k => {
        const val = eventData.ud[k];
        if (val && !isSha256(val) && (k === 'em' || k === 'ph')) {
          warnings.push(`User Data '${k}' is unhashed plaintext. It must be SHA-256 hashed for privacy compliance.`);
        }
      });
    }
  } else if (platform === "TikTok") {
    // Schema validation for CompletePayment
    if (eventName === "CompletePayment") {
      if (!eventData.properties || eventData.properties.value === undefined) {
        warnings.push("Missing 'value' parameter for CompletePayment.");
      } else if (isNaN(parseFloat(eventData.properties.value))) {
        warnings.push("'value' parameter must be a valid number.");
      }

      if (eventData.properties && eventData.properties.currency) {
         if (!isCurrency(eventData.properties.currency)) {
           warnings.push("'currency' parameter should be a valid 3-letter ISO code.");
         }
      } else {
         warnings.push("Missing 'currency' parameter for CompletePayment.");
      }
    }

    // PII validation
    const checkTikTokPII = (val, fieldName) => {
      if (val && !isSha256(val)) {
        warnings.push(`User Data '${fieldName}' is unhashed plaintext. It must be SHA-256 hashed.`);
      }
    };

    if (eventData.em) checkTikTokPII(eventData.em, "em");
    if (eventData.ph) checkTikTokPII(eventData.ph, "ph");
    
    if (eventData.context && eventData.context.user) {
      if (eventData.context.user.email) checkTikTokPII(eventData.context.user.email, "context.user.email");
      if (eventData.context.user.phone_number) checkTikTokPII(eventData.context.user.phone_number, "context.user.phone_number");
    }
  }
  
  return warnings;
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
  events.forEach(e => {
    const tid = e.tabId || "unknown";
    if (!eventsByTab[tid]) eventsByTab[tid] = [];
    eventsByTab[tid].push(e);
  });

  const allSessions = [];

  // 2. For each tab, group events by inactivity window (Standard 30 min)
  Object.values(eventsByTab).forEach(tabEvents => {
    const sorted = [...tabEvents].sort((a, b) => a.timestamp - b.timestamp);
    
    let currentSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: sorted[0].url,
      hostname: new URL(sorted[0].url).hostname,
      startTime: sorted[0].timestamp,
      endTime: sorted[0].timestamp,
      events: [sorted[0]]
    };

    for (let i = 1; i < sorted.length; i++) {
      const event = sorted[i];
      const lastEvent = sorted[i - 1];
      
      // If gap is less than windowMs, it's the same session
      if ((event.timestamp - lastEvent.timestamp) < windowMs) {
        currentSession.events.push(event);
        currentSession.endTime = event.timestamp;
      } else {
        allSessions.push(currentSession);
        currentSession = {
          id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: event.url,
          hostname: new URL(event.url).hostname,
          startTime: event.timestamp,
          endTime: event.timestamp,
          events: [event]
        };
      }
    }
    allSessions.push(currentSession);
  });
  
  return allSessions.sort((a, b) => b.startTime - a.startTime);
}

/**
 * Converts events to CSV string
 * @param {Array} events 
 */
export function eventsToCsv(events) {
  const headers = ["Time", "Platform", "Event Name", "Pixel ID", "Method", "URL", "Raw Data"];
  const rows = events.map(e => [
    new Date(e.timestamp).toISOString(),
    e.platform,
    e.eventName,
    e.pixelId,
    e.method || "GET",
    e.url,
    JSON.stringify(e.eventData).replace(/"/g, '""')
  ]);
  
  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
}
