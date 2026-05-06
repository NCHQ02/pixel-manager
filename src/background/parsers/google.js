export function parseGoogleRequest(url, details) {
  const hostname = url.hostname;
  const pathname = url.pathname;

  // 1. GA4
  if (hostname.includes("google-analytics.com") && pathname.includes("/g/collect")) {
    let baseData = {};
    url.searchParams.forEach((value, key) => {
      baseData[key] = value;
    });

    let pixelId = baseData.tid || "Unknown";
    let events = [];

    // Parse batched events from POST body
    if (details.method === "POST" && details.requestBody && details.requestBody.raw) {
      try {
        const rawBytes = details.requestBody.raw[0].bytes;
        if (rawBytes) {
          const bodyString = new TextDecoder("utf-8").decode(rawBytes);
          const batches = bodyString.split('\n');
          
          batches.forEach(batch => {
            if (!batch.trim()) return;
            const batchParams = new URLSearchParams(batch);
            let eventData = { ...baseData };
            batchParams.forEach((val, key) => {
              eventData[key] = val;
            });
            
            let eventName = eventData.en;
            let isImplicitPing = false;
            
            if (!eventName) {
              eventName = eventData._et ? "engagement_time_ping" : "system_ping";
              isImplicitPing = true;
            }
            
            // Hard-drop Tag Assistant and implicit pings
            if (eventName.startsWith("connection__") || isImplicitPing) return;
            
            const internalGaEvents = [
              "open_container_view_sp",
              "worker_install_success",
              "guided_tag_install_enabled",
              "sp__init",
              "init",
              "install_success",
              "engagement_time_ping",
              "system_ping"
            ];
            
            let isDiag = isImplicitPing || 
                         eventName.startsWith("gtm.") || 
                         eventName.startsWith("optimize.") ||
                         internalGaEvents.includes(eventName);

            events.push({
              platform: "GA4",
              pixelId: pixelId,
              eventName: eventName,
              eventData: eventData,
              isDiagnostic: isDiag
            });
          });
        }
      } catch (e) {}
    }

    // If no batches found (e.g. GET request or empty POST)
    if (events.length === 0) {
      let eventName = baseData.en;
      let isImplicitPing = false;
      
      if (!eventName) {
        eventName = baseData._et ? "engagement_time_ping" : "system_ping";
        isImplicitPing = true;
      }

      // Hard-drop Tag Assistant and implicit pings
      if (eventName.startsWith("connection__") || isImplicitPing) return [];
      
      const internalGaEvents = [
        "open_container_view_sp",
        "worker_install_success",
        "guided_tag_install_enabled",
        "sp__init",
        "init",
        "install_success",
        "engagement_time_ping",
        "system_ping"
      ];
      
      let isDiag = isImplicitPing || 
                   eventName.startsWith("gtm.") || 
                   eventName.startsWith("optimize.") ||
                   internalGaEvents.includes(eventName);

      events.push({
        platform: "GA4",
        pixelId: pixelId,
        eventName: eventName,
        eventData: baseData,
        isDiagnostic: isDiag
      });
    }

    return events;
  }
  
  // 2. Google Ads Conversion & Remarketing
  else if (hostname.includes("google.com") && (pathname.includes("/pagead/conversion") || pathname.includes("/ads/ga-audiences"))) {
    let eventData = {};
    url.searchParams.forEach((value, key) => {
      eventData[key] = value;
    });

    let pixelId = "Unknown";
    const match = pathname.match(/(AW-\d+)/);
    if (match) {
      pixelId = match[1];
    } else {
      pixelId = eventData.sst_id || eventData.lbl || "Unknown";
    }

    let eventName = eventData.lbl ? `Conversion (${eventData.lbl})` : "Remarketing";
    
    return { platform: "Google Ads", pixelId, eventName, eventData, isDiagnostic: false };
  }
  
  // 3. Floodlight (DV360 / CM360)
  else if (hostname.includes("doubleclick.net") && (pathname.includes("/activity") || pathname.includes("/ddm/activity"))) {
    let eventData = {};
    
    // Floodlight uses path parameters: /activity;src=123;type=abc;cat=def
    const pathParts = pathname.split(';');
    pathParts.forEach(part => {
      const kv = part.split('=');
      if (kv.length === 2) {
        eventData[kv[0]] = kv[1];
      }
    });

    // Also grab any standard query parameters
    url.searchParams.forEach((value, key) => {
      eventData[key] = value;
    });

    let pixelId = eventData.src || "Unknown";
    let eventName = (eventData.type && eventData.cat) ? `${eventData.type} / ${eventData.cat}` : "Floodlight Ping";

    return { platform: "Floodlight", pixelId, eventName, eventData, isDiagnostic: false };
  }

  return null;
}
