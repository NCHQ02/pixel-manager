import { parseTrackingRequest } from "./parser-harness.js";
import {
  checkDeduplication,
  sanitizeCapturedData,
  sanitizeCapturedUrl,
} from "./utils.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import {
  EVIDENCE_SOURCES,
  PARSER_SCHEMA_VERSION,
  classifyDataLayerItem,
} from "../shared/tracking-catalog.js";

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

function isNumericKeyArrayLike(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  if (item.event) return false;
  const keys = Object.keys(item);
  if (keys.length === 0 || !keys.every((key) => /^\d+$/.test(key))) return false;
  const maxIndex = Math.max(...keys.map((key) => Number(key)));
  return keys.every((key) => Number(key) >= 0) && maxIndex < 50;
}

function normalizeDataLayerItem(item) {
  if (Array.isArray(item)) return item.map(normalizeDataLayerItem);
  if (!isNumericKeyArrayLike(item)) return item;
  const normalized = [];
  Object.keys(item)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((key) => {
      normalized[Number(key)] = normalizeDataLayerItem(item[key]);
    });
  return normalized;
}

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
    for (const [index, rawItem] of payloadArray.entries()) {
      const item = normalizeDataLayerItem(rawItem);
      if (!item) continue;

      const classification = classifyDataLayerItem(item);
      const { eventName } = classification;
      const isDiag = classification.isDiagnostic;

      if (isDiag && !settings.captureDiagnostics) continue;

      const sanitizedItem = sanitizeCapturedData(item);
      const { isDuplicate, isWarning, dedupeKey, payloadHash } =
        checkDeduplication(
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
            dedupeKey,
            payloadHash,
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
        evidenceSource: EVIDENCE_SOURCES.LOCAL_DATALAYER,
        parserSchemaVersion: PARSER_SCHEMA_VERSION,
        confidence: isDiag ? "medium" : "high",
        sourceParser: "datalayer",
        diagnostics: {
          isDiagnostic: isDiag,
        },
        dedupeKey,
        payloadHash,
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
    const { isDuplicate, dedupeKey, payloadHash } = checkDeduplication(
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
      evidenceSource: EVIDENCE_SOURCES.LOCAL_SCANNER,
      parserSchemaVersion: PARSER_SCHEMA_VERSION,
      confidence: "medium",
      sourceParser: "local-scanner",
      diagnostics: {
        isDiagnostic: true,
        heuristic: true,
      },
      dedupeKey,
      payloadHash,
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
      const resultsArray = parseTrackingRequest(url, details);
      if (resultsArray.length === 0) return;
      const tabId = String(details.tabId);
      const eventRecords = [];

      for (const parsed of resultsArray) {
        if (parsed.isDiagnostic && !settings.captureDiagnostics) continue;

        const eventData = sanitizeCapturedData(parsed.eventData);
        const { isDuplicate, isWarning, dedupeKey, payloadHash } =
          checkDeduplication(
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
              dedupeKey,
              payloadHash,
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
          timestamp: Number(details.timeStamp || Date.now()),
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
          evidenceSource: EVIDENCE_SOURCES.LOCAL_NETWORK,
          parserSchemaVersion: PARSER_SCHEMA_VERSION,
          confidence: parsed.confidence,
          sourceParser: parsed.sourceParser,
          diagnostics: parsed.diagnostics || {},
          dedupeKey,
          payloadHash,
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
