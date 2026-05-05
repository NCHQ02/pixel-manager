import { formatTime, escapeHtml, extractRichDetails, auditEvent, detectAdvancedMatching } from './utils.js';

const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ba360" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

export class PixelRenderer {
  constructor(tableBodyId, emptyStateId) {
    this.tableBody = document.getElementById(tableBodyId);
    this.emptyState = document.getElementById(emptyStateId);
    this.table = this.tableBody.closest('table');
  }

  /**
   * Renders the event list
   * @param {Array} data 
   * @param {boolean} isSessionView 
   */
  render(data, isSessionView = false) {
    this.tableBody.innerHTML = "";

    if (data.length === 0) {
      this.emptyState.style.display = "flex";
      this.table.style.display = "none";
      return;
    }

    this.emptyState.style.display = "none";
    this.table.style.display = "table";

    if (isSessionView) {
      this.renderSessions(data);
    } else {
      this.renderStream(data);
    }
  }

  renderStream(events) {
    const fragment = document.createDocumentFragment();
    events.forEach((event) => {
      const { tr, detailsTr } = this.createEventRows(event);
      fragment.appendChild(tr);
      fragment.appendChild(detailsTr);
    });
    this.tableBody.appendChild(fragment);
  }

  renderSessions(sessions) {
    const fragment = document.createDocumentFragment();

    sessions.forEach((session) => {
      // Session Header Row (acts as a separator)
      const headerTr = document.createElement("tr");
      headerTr.className = "session-header-row";
      headerTr.innerHTML = `
        <td colspan="5">
          <div class="session-divider">
            <span class="eyebrow">${formatTime(session.startTime)}</span>
            <span class="session-url body-sm">${session.hostname}</span>
            <span class="badge">${session.events.length} events</span>
          </div>
        </td>
      `;
      fragment.appendChild(headerTr);

      session.events.sort((a, b) => b.timestamp - a.timestamp).forEach((event) => {
        const { tr, detailsTr } = this.createEventRows(event);
        fragment.appendChild(tr);
        fragment.appendChild(detailsTr);
      });
    });

    this.tableBody.appendChild(fragment);
  }

  /**
   * Creates the main and detail rows for an event
   * @param {object} event 
   */
  createEventRows(event) {
    // Main Row
    const tr = document.createElement("tr");
    tr.className = "event-row";

    const isMeta = event.platform === "Meta";
    const platformIconUrl = isMeta
      ? "https://img.icons8.com/fluency/48/meta.png"
      : "https://img.icons8.com/color/48/tiktok--v1.png";

    const warnings = auditEvent(event);
    const hasWarning = warnings.length > 0;
    const amKeys = detectAdvancedMatching(event.eventData, event.platform);
    const hasAM = amKeys.length > 0;

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
        <div style="display: flex; flex-direction: column; position: relative;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600;" class="body-sm">${event.eventName}</span>
            ${hasAM ? '<span class="badge-am">AM</span>' : ''}
            ${hasWarning ? '<span class="warning-dot"></span>' : ''}
          </div>
          <span class="caption" style="opacity: 0.6; font-size: 10px;">ID: ${event.pixelId}</span>
        </div>
      </td>
      <td class="action-col">
        <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
      </td>
    `;

    // Details Row
    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.style.display = "none";

    const detailsContent = this.createDetailsContent(event);
    detailsTr.appendChild(detailsContent);

    // Toggle logic
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

    return { tr, detailsTr };
  }

  /**
   * Creates the expanded details cell
   * @param {object} event 
   */
  createDetailsContent(event) {
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "details-cell";

    let cleanEventData = { ...event.eventData };
    if (cleanEventData._rawBodyString) {
      try {
        cleanEventData._rawParsed = JSON.parse(cleanEventData._rawBodyString);
      } catch (e) {}
      delete cleanEventData._rawBodyString;
    }

    const paramsJson = JSON.stringify(cleanEventData, null, 2);
    const richDetails = extractRichDetails(event.eventData, event.platform);

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

    const warnings = auditEvent(event);
    let auditHtml = "";
    if (warnings.length > 0) {
      auditHtml = `
        <div class="audit-banner">
          <p class="eyebrow" style="color: #c53030; margin-bottom: 8px;">Audit Warnings</p>
          <ul class="audit-list">
            ${warnings.map(w => `<li class="body-sm">${w}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    td.innerHTML = `
      <div class="details-pane">
        ${auditHtml}
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
    `;

    // Attach local events within the detail pane
    td.querySelectorAll(".copy-icon-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy);
        btn.innerHTML = checkSvg;
        setTimeout(() => {
          btn.innerHTML = copySvg;
        }, 1500);
      });
    });

    const payloadToggle = td.querySelector(".payload-toggle");
    const payloadContent = td.querySelector(".raw-payload-content");
    const copyRawBtn = td.querySelector(".copy-raw-btn");

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

    return td;
  }
}
