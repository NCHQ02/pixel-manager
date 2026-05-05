export function parseTikTokRequest(url, details) {
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i)
  ) {
    return null;
  }

  const isTikTok =
    (url.hostname.includes("tiktok.com") ||
      url.hostname.includes("byteoversea.com")) &&
    (url.pathname.includes("pixel") ||
      url.pathname.includes("event") ||
      url.pathname.includes("track") ||
      url.pathname.includes("api") ||
      url.pathname.includes("log") ||
      url.hostname.includes("analytics") ||
      url.hostname.includes("tr."));

  if (!isTikTok) return null;

  let pixelId =
    url.searchParams.get("pixel_code") ||
    url.searchParams.get("id") ||
    "Unknown";
  let eventName =
    url.searchParams.get("event") ||
    url.searchParams.get("event_name") ||
    url.searchParams.get("type") ||
    "Unknown";
  let eventData = {};

  url.searchParams.forEach((value, key) => {
    if (key !== "pixel_code" && key !== "event") {
      eventData[key] = value;
    }
  });

  if (
    details.method !== "GET" &&
    details.requestBody &&
    details.requestBody.formData
  ) {
    for (const key in details.requestBody.formData) {
      eventData[key] = details.requestBody.formData[key][0];
    }
  }

  const isDiagnostic = eventName === "Unknown";

  return { platform: "TikTok", pixelId, eventName, eventData, isDiagnostic };
}
