import { auditEvent, classifyEventStatus } from "../utils.js";

export function selectActiveAuditRun(store) {
  const activeRunId = store.auditState?.activeAuditRunId;
  return activeRunId ? store.auditRuns?.[activeRunId] : null;
}

export function selectActiveAuditTab(store) {
  const activeRunId = store.auditState?.activeAuditRunId;
  const tabs = Object.values(store.auditState?.auditTabs || {});
  return tabs.find((tab) => tab.auditRunId === activeRunId) || null;
}

export function selectEvents(store, dashboardState, options = {}) {
  const {
    applyPlatform = true,
    applyStatus = true,
    applySearch = true,
    applyTag = true,
    applyTimeline = true,
    includeDiagnostics = false,
  } = options;
  let events =
    dashboardState.selectedTabId === "all"
      ? store.getAllEvents()
      : [...(store.events[dashboardState.selectedTabId] || [])].sort(
          (a, b) => b.timestamp - a.timestamp,
        );

  if (!includeDiagnostics && dashboardState.platformFilter !== "Diagnostics") {
    events = events.filter((event) => !event.isDiagnostic);
  }

  if (applyPlatform) {
    if (dashboardState.platformFilter === "Diagnostics") {
      events = events.filter((event) => event.isDiagnostic);
    } else if (dashboardState.platformFilter === "Google") {
      events = events.filter((event) =>
        ["GA4", "Google Ads", "Floodlight", "DataLayer"].includes(
          event.platform,
        ),
      );
    } else if (dashboardState.platformFilter !== "All") {
      events = events.filter(
        (event) => event.platform === dashboardState.platformFilter,
      );
    }
  }

  if (applyStatus && dashboardState.statusFilter !== "All") {
    events = events.filter((event) => {
      const status = classifyEventStatus(event, auditEvent(event));
      return status.key === dashboardState.statusFilter;
    });
  }

  if (applySearch && dashboardState.searchQuery) {
    const query = dashboardState.searchQuery.toLowerCase();
    events = events.filter((event) =>
      [event.eventName, event.pixelId, event.platform, event.url, event.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }

  const selectedTimelineFilter = normalizeSelectedTimelineFilter(dashboardState);
  if (applyTimeline && selectedTimelineFilter) {
    events = events.filter((event) =>
      timelineFilterMatches(event, selectedTimelineFilter),
    );
  }

  const selectedTags = normalizeSelectedTags(dashboardState);
  if (applyTag && selectedTags.length > 0) {
    const selectedKeys = new Set(
      selectedTags.map((tag) => tagKey(tag.platform, tag.pixelId)),
    );
    events = events.filter((event) =>
      selectedKeys.has(tagKey(event.platform, event.pixelId || "Unknown")),
    );
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function normalizeSelectedTimelineFilter(dashboardState = {}) {
  const rawFilter =
    dashboardState.selectedTimelineFilter ||
    (Array.isArray(dashboardState.selectedTimelineFilters)
      ? dashboardState.selectedTimelineFilters[0]
      : null);
  if (!rawFilter) return null;
  const filter = {
    platform: String(rawFilter.platform || "Any").trim() || "Any",
    eventName: String(rawFilter.eventName || "").trim(),
  };
  return filter.eventName ? filter : null;
}

function timelineFilterMatches(event, filter) {
  if (filter.platform !== "Any" && event.platform !== filter.platform) {
    return false;
  }
  const eventName = normalizeEventName(event.eventName);
  const filterName = normalizeEventName(filter.eventName);
  if (filterName === "pageview") return ["pageview"].includes(eventName);
  if (filterName === "viewcontent") return ["viewcontent"].includes(eventName);
  if (filterName === "addtocart") return ["addtocart"].includes(eventName);
  if (filterName === "lead") {
    return ["lead", "begincheckout", "checkout"].includes(eventName);
  }
  if (filterName === "purchase") {
    return ["purchase", "completepayment", "conversion", "floodlight"].some(
      (candidate) => eventName.includes(candidate),
    );
  }
  if (filterName === "conversion") {
    return eventName.startsWith("conversion");
  }
  if (filterName === "floodlight") return event.platform === "Floodlight";
  return eventName === filterName;
}

function normalizeEventName(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSelectedTags(dashboardState = {}) {
  const rawTags = Array.isArray(dashboardState.selectedTagFilters)
    ? dashboardState.selectedTagFilters
    : dashboardState.selectedTagFilter
      ? [dashboardState.selectedTagFilter]
      : [];
  return rawTags
    .filter(Boolean)
    .map((tag) => ({
      platform: String(tag.platform || "").trim(),
      pixelId: String(tag.pixelId || "").trim(),
    }))
    .filter((tag) => tag.platform && tag.pixelId);
}

function tagKey(platform, pixelId) {
  return `${platform}::${String(pixelId || "Unknown")}`;
}
