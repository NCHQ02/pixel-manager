let currentFilter = "All"; // 'All', 'Meta', 'TikTok'

const eventsTable = document.getElementById("events-table");
const eventsTableBody = document.getElementById("events-table-body");
const emptyState = document.getElementById("empty-state");
const clearBtn = document.getElementById("clear-all-btn");

const tabAll = document.getElementById("tab-all");
const tabMeta = document.getElementById("tab-meta");
const tabTikTok = document.getElementById("tab-tiktok");

const heroSection = document.getElementById("hero-section");
const heroEyebrow = document.getElementById("hero-eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroSubtitle = document.getElementById("hero-subtitle");

const heroContent = {
  All: {
    eyebrow: "The Event Canvas",
    title: "A real-time, unstructured stream of tracking pixels.",
    subtitle:
      "No secrets, no obfuscation. Watch data dispatch from your browser as it happens.",
    bg: "bg-lilac",
  },
  Meta: {
    eyebrow: "Meta Pixel",
    title: "Facebook event interception.",
    subtitle:
      "Monitoring PageViews, Lead events, and custom conversions dispatched to Meta.",
    bg: "bg-meta",
  },
  TikTok: {
    eyebrow: "TikTok Pixel",
    title: "TikTok tracking analytics.",
    subtitle:
      "Capturing auto-events, page interactions, and custom events routed to ByteDance.",
    bg: "bg-tiktok",
  },
};

// Format Date
function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
}

// Extract rich data for display
function extractRichDetails(eventData, platform) {
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

// Render Events
function renderEvents(allEventsMap) {
  let allEvents = [];
  for (const tabId in allEventsMap) {
    allEvents = allEvents.concat(allEventsMap[tabId]);
  }

  if (currentFilter !== "All") {
    allEvents = allEvents.filter((e) => e.platform === currentFilter);
  }

  allEvents.sort((a, b) => b.timestamp - a.timestamp);
  eventsTableBody.innerHTML = "";

  if (allEvents.length === 0) {
    emptyState.style.display = "flex";
    eventsTable.style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  eventsTable.style.display = "table";

  allEvents.forEach((event) => {
    // Main Row
    const tr = document.createElement("tr");
    tr.className = "event-row";

    const isMeta = event.platform === "Meta";
    const platformIconUrl = isMeta
      ? "https://img.icons8.com/fluency/48/meta.png"
      : "https://img.icons8.com/color/48/tiktok--v1.png";

    tr.innerHTML = `
      <td class="caption time-col">${formatTime(event.timestamp)}</td>
      <td class="method-col"><span class="method-badge">${event.method || "GET"}</span></td>
      <td class="platform-col">
        <div class="platform-label">
          <img src="${platformIconUrl}" width="16" height="16" aria-hidden="true" />
          <span>${event.platform}</span>
        </div>
      </td>
      <td class="event-col">
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600;" class="body-sm">${event.eventName}</span>
          <span class="caption" style="opacity: 0.6; font-size: 10px;">ID: ${event.pixelId}</span>
        </div>
      </td>
      <td class="action-col">
        <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
      </td>
    `;

    // Details Row (Accordion)
    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.style.display = "none";

    // Clean up Raw Body if it exists
    let cleanEventData = { ...event.eventData };
    if (cleanEventData._rawBodyString) {
      try {
        cleanEventData._rawParsed = JSON.parse(cleanEventData._rawBodyString);
      } catch (e) {}
      delete cleanEventData._rawBodyString; // keep the raw json payload clean
    }

    const paramsJson = JSON.stringify(cleanEventData, null, 2);

    const richDetails = extractRichDetails(event.eventData, event.platform);

    const escapeHtml = (unsafe) => {
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ba360" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    let richDetailsHtml = `
      <div class="detail-group">
        <div class="detail-header-row">
          <span class="detail-label">Page URL</span>
          <button class="copy-icon-btn" data-copy="${escapeHtml(event.url)}" title="Copy URL">${copySvg}</button>
        </div>
        <span class="detail-value truncate-2" title="${escapeHtml(event.url)}">${escapeHtml(event.url)}</span>
      </div>
      <div class="detail-group">
        <div class="detail-header-row">
          <span class="detail-label">Pixel ID</span>
          <button class="copy-icon-btn" data-copy="${escapeHtml(event.pixelId)}" title="Copy ID">${copySvg}</button>
        </div>
        <span class="detail-value truncate-2" title="${escapeHtml(event.pixelId)}">${escapeHtml(event.pixelId)}</span>
      </div>
    `;

    Object.keys(richDetails).forEach((k) => {
      const val = richDetails[k];
      const safeValStr = escapeHtml(val);
      richDetailsHtml += `
        <div class="detail-group">
          <div class="detail-header-row">
            <span class="detail-label">${escapeHtml(k)}</span>
            <button class="copy-icon-btn" data-copy="${safeValStr}" title="Copy">${copySvg}</button>
          </div>
          <span class="detail-value truncate-2" title="${safeValStr}">${safeValStr}</span>
        </div>
      `;
    });

    detailsTr.innerHTML = `
      <td colspan="5" class="details-cell">
        <div class="details-pane">
          <div class="details-header">
            <h3 class="headline">Event Details</h3>
            <span class="event-id caption">ID: ${event.id}</span>
          </div>
          
          <div class="details-grid">
            ${richDetailsHtml}
          </div>
          
          <div style="margin-top: var(--spacing-xl); margin-bottom: var(--spacing-sm); display: flex; align-items: center; justify-content: space-between;">
            <h4 class="eyebrow" style="margin: 0;">Raw Payload</h4>
            <div style="display: flex; gap: 8px;">
              <button class="copy-raw-btn button-outline" style="display: none; padding: 6px 12px; font-size: 11px; border-radius: 99px; cursor: pointer; font-family: var(--font-mono); text-transform: uppercase;">Copy JSON</button>
              <button class="payload-toggle button-outline" style="padding: 6px 12px; font-size: 11px; border-radius: 99px; cursor: pointer; font-family: var(--font-mono); text-transform: uppercase;">Show All</button>
            </div>
          </div>
          <div class="code-block raw-payload-content" style="display: none;">
            <pre>${paramsJson}</pre>
          </div>
        </div>
      </td>
    `;

    detailsTr.querySelectorAll(".copy-icon-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy);
        btn.innerHTML = checkSvg;
        setTimeout(() => {
          btn.innerHTML = copySvg;
        }, 1500);
      });
    });

    const payloadToggle = detailsTr.querySelector(".payload-toggle");
    const payloadContent = detailsTr.querySelector(".raw-payload-content");
    const copyRawBtn = detailsTr.querySelector(".copy-raw-btn");

    if (payloadToggle && payloadContent) {
      payloadToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (payloadContent.style.display === "none") {
          payloadContent.style.display = "block";
          if (copyRawBtn) copyRawBtn.style.display = "block";
          payloadToggle.textContent = "Hide";
        } else {
          payloadContent.style.display = "none";
          if (copyRawBtn) copyRawBtn.style.display = "none";
          payloadToggle.textContent = "Show All";
        }
      });
    }

    if (copyRawBtn) {
      copyRawBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(paramsJson);
        const originalText = copyRawBtn.textContent;
        copyRawBtn.textContent = "Copied!";
        setTimeout(() => {
          copyRawBtn.textContent = originalText;
        }, 1500);
      });
    }
    tr.addEventListener("click", () => {
      const isExpanded = detailsTr.style.display === "table-row";

      if (isExpanded) {
        detailsTr.style.display = "none";
        tr.classList.remove("expanded");
        tr.querySelector(".chevron").innerHTML = `<path d="m6 9 6 6 6-6"/>`;
      } else {
        detailsTr.style.display = "table-row";
        tr.classList.add("expanded");
        tr.querySelector(".chevron").innerHTML = `<path d="m18 15-6-6-6 6"/>`;
      }
    });

    eventsTableBody.appendChild(tr);
    eventsTableBody.appendChild(detailsTr);
  });
}

function loadData() {
  chrome.storage.local.get(["trackedEvents"], (result) => {
    renderEvents(result.trackedEvents || {});
  });
}

// Handle Tabs
function setTab(filter, btn) {
  currentFilter = filter;
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  const content = heroContent[filter];
  if (content && heroSection) {
    heroEyebrow.textContent = content.eyebrow;
    heroTitle.textContent = content.title;
    heroSubtitle.textContent = content.subtitle;
    heroSection.classList.remove("bg-lilac", "bg-meta", "bg-tiktok");
    heroSection.classList.add(content.bg);
  }

  loadData();
}

tabAll.addEventListener("click", () => setTab("All", tabAll));
tabMeta.addEventListener("click", () => setTab("Meta", tabMeta));
tabTikTok.addEventListener("click", () => setTab("TikTok", tabTikTok));

clearBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all events?")) {
    chrome.storage.local.set({ trackedEvents: {} });
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.trackedEvents) {
    renderEvents(changes.trackedEvents.newValue || {});
  }
});

loadData();
