import {
  auditEvent,
  classifyEventStatus,
  detectAdvancedMatching,
  escapeHtml,
  formatTime,
  getPlatformMeta,
} from "./utils.js";

export class PixelRenderer {
  constructor(containerId, emptyStateId, options = {}) {
    this.container = document.getElementById(containerId);
    this.emptyState = document.getElementById(emptyStateId);
    this.onSelectEvent = options.onSelectEvent || (() => {});
    this.selectedEventId = null;
  }

  setSelectedEvent(eventId) {
    this.selectedEventId = eventId;
  }

  render(data, isSessionView = false) {
    if (!this.container || !this.emptyState) return;
    this.container.innerHTML = "";

    if (!data || data.length === 0) {
      this.emptyState.style.display = "grid";
      this.container.style.display = "none";
      return;
    }

    this.emptyState.style.display = "none";
    this.container.style.display = "grid";

    if (isSessionView) {
      this.renderSessions(data);
    } else {
      this.renderStream(data);
    }
  }

  renderStream(events) {
    const fragment = document.createDocumentFragment();
    events.forEach((event) => {
      fragment.appendChild(this.createEventCard(event));
    });
    this.container.appendChild(fragment);
  }

  renderSessions(sessions) {
    const fragment = document.createDocumentFragment();

    sessions.forEach((session) => {
      const header = document.createElement("div");
      header.className = "session-divider";
      header.innerHTML = `
        <span class="eyebrow">${formatTime(session.startTime)}</span>
        <strong>${escapeHtml(session.hostname)}</strong>
        <span class="status-pill status-valid">${session.events.length} events</span>
      `;
      fragment.appendChild(header);

      session.events
        .sort((a, b) => b.timestamp - a.timestamp)
        .forEach((event) => {
          fragment.appendChild(this.createEventCard(event));
        });
    });

    this.container.appendChild(fragment);
  }

  createEventCard(event) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `event-card ${this.selectedEventId === event.id ? "selected" : ""}`;
    button.dataset.eventId = event.id;

    const meta = getPlatformMeta(event.platform);
    const warnings = auditEvent(event);
    const status = classifyEventStatus(event, warnings);
    const amKeys = detectAdvancedMatching(event.eventData, event.platform);
    const duplicateBadge = event.duplicateCount
      ? `<span class="status-pill status-duplicate">Dup ${event.duplicateCount}</span>`
      : "";
    const amBadge = amKeys.length
      ? `<span class="mini-badge">AM</span>`
      : "";

    button.innerHTML = `
      <span class="event-time caption">${formatTime(event.timestamp)}</span>
      <span class="event-platform">
        ${meta.icon ? `<img src="${escapeHtml(meta.icon)}" width="18" height="18" aria-hidden="true" />` : ""}
        ${escapeHtml(event.platform)}
      </span>
      <span class="event-name">
        <strong>${escapeHtml(event.eventName)}</strong>
        <span class="caption">ID: ${escapeHtml(event.pixelId || "Unknown")}</span>
      </span>
      <span class="event-statuses">
        <span class="status-pill status-${status.key}">${escapeHtml(status.label)}</span>
        ${duplicateBadge}
        ${amBadge}
      </span>
      <span class="event-method caption">${escapeHtml(event.method || "GET")}</span>
    `;

    button.addEventListener("click", () => {
      this.selectedEventId = event.id;
      this.onSelectEvent(event.id);
    });

    return button;
  }
}
