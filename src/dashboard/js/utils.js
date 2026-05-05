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
