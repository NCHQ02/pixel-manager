export function parseMetaRequest(url, details) {
  const isMeta =
    url.hostname.includes("facebook.com") && url.pathname.includes("/tr");
  if (!isMeta) return null;

  let pixelId = url.searchParams.get("id") || "Unknown";
  let eventName = url.searchParams.get("ev") || "Unknown";
  let eventData = {};

  // Extract from URL params
  url.searchParams.forEach((value, key) => {
    if (key.startsWith("cd[")) {
      const cleanKey = key.replace("cd[", "").replace("]", "");
      eventData[cleanKey] = value;
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
        eventData[cleanKey] = value;
      } else if (key !== "id" && key !== "ev") {
        eventData[key] = value;
      }
    }
  }

  // Filter out noise like Microdata pings which are not "real" events in Meta Pixel Helper
  if (eventName === "Microdata" || eventName === "SubscribedButtonClick") {
    // We can still capture them, but maybe flag them?
    // For now, let's keep them but make sure deduplication handles them.
  }

  return { platform: "Meta", pixelId, eventName, eventData };
}
