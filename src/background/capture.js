import { parseMetaRequest } from "./parsers/meta.js";
import { parseTikTokRequest } from "./parsers/tiktok.js";
import { parseGoogleRequest } from "./parsers/google.js";
import {
  checkDeduplication,
  sanitizeCapturedData,
  sanitizeCapturedUrl,
} from "./utils.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { MESSAGE_TYPES } from "../shared/messages.js";

function createEventId(index = "") {
  return Date.now().toString() + index + Math.random().toString().slice(2, 6);
}

async function safeRuntimeSend(chromeApi, message) {
  try {
    await chromeApi.runtime.sendMessage(message);
  } catch (_e) {}
}

async function safeTabSend(chromeApi, tabId, message) {
  try {
    await chromeApi.tabs.sendMessage(tabId, message);
  } catch (_e) {}
}

const PARSER_SCHEMA_VERSION = 2;

export class CaptureEngine {
  /**
   * @param {Object} deps
   * @param {chrome} deps.chromeApi
   * @param {import("../shared/contracts.js").EventRepository} deps.repository
   * @param {import("./session.js").AuditSessionManager} deps.sessionManager
   * @param {() => import("../shared/contracts.js").Settings} deps.getSettings
   */
  constructor({ chromeApi, repository, sessionManager, getSettings }) {
    this.chrome = chromeApi;
    this.repository = repository;
    this.sessionManager = sessionManager;
    this.getSettings = getSettings;
  }

  async notifyEventsChanged(tabId = null) {
    await safeRuntimeSend(this.chrome, {
      type: MESSAGE_TYPES.EVENTS_CHANGED,
      tabId: tabId ? String(tabId) : null,
    });
  }

  async notifyOverlay(tabId) {
    if (Number(tabId) < 0) return;
    const eventCount = await this.repository.countEventsForTab(String(tabId), {
      includeDiagnostics: false,
    });
    await safeTabSend(this.chrome, Number(tabId), {
      type: MESSAGE_TYPES.PIXEL_EVENT_CAPTURED,
      eventCount,
    });
  }

  async persistEvent(eventRecord, maxEvents) {
    await this.repository.addEvent(eventRecord, { maxEvents });
    await this.notifyEventsChanged(eventRecord.tabId);
    await this.notifyOverlay(eventRecord.tabId);
  }

  async persistEvents(eventRecords, maxEvents) {
    const records = eventRecords.filter(Boolean);
    if (records.length === 0) return;
    await this.repository.addEvents(records, { maxEvents });
    await this.notifyEventsChanged(records[0].tabId);
    await this.notifyOverlay(records[0].tabId);
  }

  async persistDuplicate(match, eventData) {
    const updated = await this.repository.incrementDuplicateEvent(match, eventData);
    if (!updated) return;
    await this.notifyEventsChanged(updated.tabId);
    await this.notifyOverlay(updated.tabId);
  }

  async handleDataLayerMessage(message, sender) {
    const settings = this.getSettings();
    if (!settings.captureDataLayer) return;
    if (
      sender.tab?.id >= 0 &&
      !this.sessionManager.isAuditedTab(sender.tab.id)
    ) {
      return;
    }

    const tabId = sender.tab ? String(sender.tab.id) : "background_worker";
    const payloadArray =
      message.type === MESSAGE_TYPES.DATALAYER_HISTORY
        ? message.data.payload
        : [message.data.payload?.[0]];

    if (!Array.isArray(payloadArray)) return;

    const eventRecords = [];
    for (const [index, item] of payloadArray.entries()) {
      if (!item) continue;

      let eventName = "DataLayer Init";
      let isDiag = false;

      if (Array.isArray(item) && item.length > 0) {
        const command = item[0];
        if (typeof command === "string") {
          eventName =
            command === "event" && typeof item[1] === "string"
              ? item[1]
              : `DataLayer: ${command}`;
          if (["consent", "set", "js", "config"].includes(command)) {
            isDiag = true;
          }
        }
      } else if (typeof item === "object" && item.event) {
        eventName = item.event;
        if (eventName === "gtm.js") {
          eventName = "GTM Container Load";
          isDiag = true;
        }
        isDiag =
          isDiag ||
          eventName === "gtm.load" ||
          eventName === "gtm.dom" ||
          eventName.startsWith("connection__") ||
          eventName.startsWith("optimize.");
      }

      if (isDiag && !settings.captureDiagnostics) continue;

      const sanitizedItem = sanitizeCapturedData(item);
      const { isDuplicate, isWarning } = checkDeduplication(
        tabId,
        "DataLayer",
        "GTM / DOM",
        eventName,
        sanitizedItem,
        "DOM",
        settings.duplicateWindow,
      );

      if (isDuplicate) {
        await this.persistDuplicate(
          {
            tabId,
            platform: "DataLayer",
            pixelId: "GTM / DOM",
            eventName,
            method: "DOM",
          },
          sanitizedItem,
        );
        continue;
      }

      if (isWarning) sanitizedItem._duplicateWarning = true;

      const eventRecord = {
        id: createEventId(index),
        tabId,
        platform: "DataLayer",
        pixelId: "GTM / DOM",
        eventName,
        eventData: sanitizedItem,
        url: sender.tab ? sanitizeCapturedUrl(sender.tab.url) : "",
        method: "DOM",
        timestamp: (message.data.timestamp || Date.now()) + index,
        status: isDiag ? "diagnostic" : isWarning ? "duplicate" : "valid",
        isDiagnostic: isDiag,
        issues: [],
        duplicateCount: isWarning ? 1 : 0,
        auditRunId:
          this.sessionManager.getContextForTab(tabId)?.auditRunId ||
          this.sessionManager.getActiveRunId(),
        source: "datalayer",
        parserSchemaVersion: PARSER_SCHEMA_VERSION,
      };

      eventRecords.push(eventRecord);
    }
    await this.persistEvents(
      eventRecords,
      settings.maxEvents || DEFAULT_SETTINGS.maxEvents,
    );
  }

  async handleTagScanMessage(message, sender) {
    const settings = this.getSettings();
    if (!settings.captureTagScanner) return;
    if (
      sender.tab?.id >= 0 &&
      !this.sessionManager.isAuditedTab(sender.tab.id)
    ) {
      return;
    }

    const tabId = sender.tab ? String(sender.tab.id) : "background_worker";
    const eventData = sanitizeCapturedData(message.data || {});
    const { isDuplicate } = checkDeduplication(
      tabId,
      "Diagnostics",
      "Local Scanner",
      "Tag Scanner Snapshot",
      eventData,
      "DOM",
      settings.duplicateWindow,
    );
    if (isDuplicate) return;

    const eventRecord = {
      id: createEventId("scanner"),
      tabId,
      platform: "Diagnostics",
      pixelId: "Local Scanner",
      eventName: "Tag Scanner Snapshot",
      eventData,
      url: sender.tab ? sanitizeCapturedUrl(sender.tab.url) : "",
      method: "DOM",
      timestamp: message.data?.timestamp || Date.now(),
      status: "diagnostic",
      isDiagnostic: true,
      issues: [],
      duplicateCount: 0,
      auditRunId:
        this.sessionManager.getContextForTab(tabId)?.auditRunId ||
        this.sessionManager.getActiveRunId(),
      source: "scanner",
      parserSchemaVersion: PARSER_SCHEMA_VERSION,
    };

    await this.persistEvent(
      eventRecord,
      settings.maxEvents || DEFAULT_SETTINGS.maxEvents,
    );
  }

  async handleNetworkRequest(details) {
    try {
      const settings = this.getSettings();
      if (!settings.captureNetwork) return;
      if (details.tabId < 0 || !this.sessionManager.isAuditedTab(details.tabId)) {
        return;
      }

      const url = new URL(details.url);
      const rawResults =
        parseMetaRequest(url, details) ||
        parseTikTokRequest(url, details) ||
        parseGoogleRequest(url, details);
      if (!rawResults) return;

      const resultsArray = Array.isArray(rawResults) ? rawResults : [rawResults];
      const tabId = String(details.tabId);
      const eventRecords = [];

      for (const parsed of resultsArray) {
        if (parsed.isDiagnostic && !settings.captureDiagnostics) continue;

        const eventData = sanitizeCapturedData(parsed.eventData);
        const { isDuplicate, isWarning } = checkDeduplication(
          tabId,
          parsed.platform,
          parsed.pixelId,
          parsed.eventName,
          eventData,
          details.method,
          settings.duplicateWindow,
        );

        if (isDuplicate) {
          await this.persistDuplicate(
            {
              tabId,
              platform: parsed.platform,
              pixelId: parsed.pixelId,
              eventName: parsed.eventName,
              method: details.method,
            },
            eventData,
          );
          continue;
        }
        if (isWarning) eventData._duplicateWarning = true;

        let pageUrl = details.initiator || details.documentUrl || details.url;
        if (parsed.platform === "Meta" && parsed.eventData.dl) {
          pageUrl = parsed.eventData.dl;
        } else if (
          parsed.platform === "TikTok" &&
          parsed.eventData.context?.page?.url
        ) {
          pageUrl = parsed.eventData.context.page.url;
        } else if (parsed.platform === "GA4" && parsed.eventData.dl) {
          pageUrl = parsed.eventData.dl;
        }

        const eventRecord = {
          id: createEventId(),
          tabId,
          platform: parsed.platform,
          pixelId: parsed.pixelId,
          eventName: parsed.eventName,
          eventData,
          url: sanitizeCapturedUrl(pageUrl),
          pixelUrl: sanitizeCapturedUrl(details.url),
          method: details.method,
          timestamp: Date.now(),
          status: parsed.isDiagnostic
            ? "diagnostic"
            : isWarning
              ? "duplicate"
              : "valid",
          isDiagnostic: !!parsed.isDiagnostic,
          issues: [],
          duplicateCount: isWarning ? 1 : 0,
          auditRunId:
            this.sessionManager.getContextForTab(tabId)?.auditRunId ||
            this.sessionManager.getActiveRunId(),
          source: "network",
          parserSchemaVersion: PARSER_SCHEMA_VERSION,
        };

        eventRecords.push(eventRecord);
      }

      await this.persistEvents(
        eventRecords,
        settings.maxEvents || DEFAULT_SETTINGS.maxEvents,
      );
    } catch (err) {
      console.error("[PixelTracker] Network Parse Error:", err);
    }
  }
}
