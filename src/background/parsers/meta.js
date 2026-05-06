export function parseMetaRequest(url, details) {
  const isMeta =
    url.hostname.includes("facebook.com") && url.pathname.includes("/tr");
  if (!isMeta) return null;

  let pixelId = url.searchParams.get("id") || "Unknown";
  let eventName = url.searchParams.get("ev") || "Unknown";
  let eventData = { cd: {} };

  // Extract from URL params
  url.searchParams.forEach((value, key) => {
    if (key.startsWith("cd[")) {
      // Accumulate under eventData.cd so auditEvent() can find cd.value / cd.currency
      const cleanKey = key.replace("cd[", "").replace("]", "");
      eventData.cd[cleanKey] = value;
    } else if (key !== "id" && key !== "ev") {
      eventData[key] = value;
    }
  });

  // Extract from Form Data if POST
  if (
    details.method !== "GET" &&
    details.requestBody &&
    details.requestBody.formData
  ) {
    const formData = details.requestBody.formData;
    if (formData.id) pixelId = formData.id[0];
    if (formData.ev) eventName = formData.ev[0];
    for (const key in formData) {
      const value = formData[key][0];
      if (key.startsWith("cd[")) {
        const cleanKey = key.replace("cd[", "").replace("]", "");
        eventData.cd[cleanKey] = value;
      } else if (key !== "id" && key !== "ev") {
        eventData[key] = value;
      }
    }
  }

  // Meta sometimes sends `cd` as a serialized JSON string in the POST body.
  // Merge it into eventData.cd so audit checks (cd.value, cd.currency) work correctly.
  if (eventData.cd && typeof eventData.cd === 'string') {
    try {
      eventData.cd = JSON.parse(eventData.cd);
    } catch (_e) {
      // Not valid JSON — keep raw string
    }
  }

  // Filter out noise like Microdata pings which are not "real" events in Meta Pixel Helper
  const isDiagnostic = eventName === "Microdata" || eventName === "SubscribedButtonClick";

  return { platform: "Meta", pixelId, eventName, eventData, isDiagnostic };
}
