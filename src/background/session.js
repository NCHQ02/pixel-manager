import "../shared/contracts.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { sanitizeCapturedUrl } from "./utils.js";

function getStorageSession(chromeApi) {
  return chromeApi.storage.session;
}

function storageGet(storageArea, keys) {
  return new Promise((resolve) => {
    storageArea.get(keys, (res) => resolve(res || {}));
  });
}

function storageSet(storageArea, value) {
  return new Promise((resolve) => {
    storageArea.set(value, () => resolve());
  });
}

export function isAuditableUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

export function safeHostname(url = "") {
  try {
    return new URL(url).hostname;
  } catch (_e) {
    return "Unknown URL";
  }
}

export function createAuditRunId(tabId, now = Date.now()) {
  return `audit-${tabId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Manages the active audit tab/run lifecycle. A page load in an audited tab is
 * treated as a fresh event canvas, matching common pixel debugger behavior.
 */
export class AuditSessionManager {
  /**
   * @param {Object} deps
   * @param {chrome} deps.chromeApi
   * @param {import("../shared/contracts.js").EventRepository} deps.repository
   * @param {(tabId: string) => void} deps.clearFingerprints
   */
  constructor({ chromeApi, repository, clearFingerprints }) {
    this.chrome = chromeApi;
    this.repository = repository;
    this.clearFingerprints = clearFingerprints;
    this.auditedTabIds = new Set();
    /** @type {Record<string, import("../shared/contracts.js").AuditTabContext>} */
    this.auditTabContexts = {};
    this.activeAuditRunId = null;
    this.lastTargetTabId = null;
  }

  async hydrate() {
    const { auditTabs, activeAuditRunId } = await this.getSessionState();
    Object.entries(auditTabs).forEach(([tabId, context]) => {
      this.auditedTabIds.add(Number(tabId));
      this.auditTabContexts[tabId] = context;
    });
    this.activeAuditRunId = activeAuditRunId;
    this.lastTargetTabId = Number(Object.keys(auditTabs).at(-1)) || null;
  }

  async getSessionState() {
    const res = await storageGet(getStorageSession(this.chrome), [
      "auditTabs",
      "activeAuditRunId",
    ]);
    return {
      auditTabs: res.auditTabs || {},
      activeAuditRunId: res.activeAuditRunId || null,
    };
  }

  async setSessionState(state) {
    await storageSet(getStorageSession(this.chrome), state);
  }

  isAuditedTab(tabId) {
    return this.auditedTabIds.has(Number(tabId));
  }

  getContextForTab(tabId) {
    return this.auditTabContexts[String(tabId)] || null;
  }

  getActiveRunId() {
    return this.activeAuditRunId;
  }

  async getTargetTab() {
    if (this.lastTargetTabId) {
      try {
        return await this.chrome.tabs.get(this.lastTargetTabId);
      } catch (_e) {}
    }

    const tabs = await this.chrome.tabs.query({ active: true });
    return tabs.find((tab) => isAuditableUrl(tab.url));
  }

  async enableAuditingForTab(tab, options = {}) {
    if (!tab?.id || !isAuditableUrl(tab.url)) return null;

    const tabKey = String(tab.id);
    const existingContext = this.auditTabContexts[tabKey];
    const createNewRun = options.createNewRun || !existingContext?.auditRunId;
    const startedAt = createNewRun
      ? Date.now()
      : existingContext.startedAt || Date.now();
    const auditRunId =
      options.auditRunId ||
      (createNewRun
        ? createAuditRunId(tab.id)
        : existingContext.auditRunId);
    const reloadMode =
      options.reloadMode ||
      (createNewRun ? "none" : existingContext?.reloadMode || "none");
    const hostname = safeHostname(tab.url);

    this.auditedTabIds.add(tab.id);
    this.lastTargetTabId = tab.id;
    this.activeAuditRunId = auditRunId;

    if (createNewRun && options.clearExistingEvents !== false) {
      await this.repository.clearEventsForTab(tabKey);
      this.clearFingerprints(tabKey);
    }

    const { auditTabs } = await this.getSessionState();
    const context = {
      ...existingContext,
      tabId: tabKey,
      auditRunId,
      url: sanitizeCapturedUrl(tab.url),
      hostname,
      startedAt,
      reloadMode,
      startedAfterLoad: createNewRun
        ? tab.status === "complete" && reloadMode !== "reload"
        : !!existingContext?.startedAfterLoad,
    };
    auditTabs[tabKey] = context;
    this.auditTabContexts[tabKey] = context;
    await this.setSessionState({ auditTabs, activeAuditRunId: auditRunId });

    const existingRun = (await this.repository.getAuditRunsMap())[auditRunId];
    await this.repository.putAuditRun({
      id: auditRunId,
      tabId: tabKey,
      domain: hostname,
      url: sanitizeCapturedUrl(tab.url),
      startedAt: existingRun?.startedAt || startedAt,
      endedAt: existingRun?.endedAt || null,
      reloadMode: existingRun?.reloadMode || reloadMode,
      expectedPixels: existingRun?.expectedPixels || {},
      expectedEvents: existingRun?.expectedEvents || [],
    });

    await this.injectAuditScripts(tab.id);

    if (options.reload) {
      this.chrome.tabs.reload(tab.id);
    }

    return context;
  }

  async injectAuditScripts(tabId) {
    try {
      await this.chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/content.js"],
      });
      await this.chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/inject.js"],
        world: "MAIN",
      });
    } catch (err) {
      console.warn("[OmniSignal] Could not activate tab audit:", err);
    }
  }

  async handleTabRemoved(tabId) {
    const tabKey = String(tabId);
    this.auditedTabIds.delete(tabId);
    const removedContext = this.auditTabContexts[tabKey];
    const { auditTabs, activeAuditRunId } = await this.getSessionState();
    delete auditTabs[tabKey];
    delete this.auditTabContexts[tabKey];

    const remainingContexts = Object.values(auditTabs);
    const nextContext = remainingContexts.at(-1);
    if (activeAuditRunId === removedContext?.auditRunId) {
      this.activeAuditRunId = nextContext?.auditRunId || null;
      this.lastTargetTabId = nextContext ? Number(nextContext.tabId) : null;
    }

    await this.setSessionState({
      auditTabs,
      activeAuditRunId: this.activeAuditRunId,
    });
  }

  async handleTabLoading(tabId, tab) {
    if (!this.isAuditedTab(tabId) || !isAuditableUrl(tab?.url)) return false;
    const tabKey = String(tabId);
    await this.repository.clearEventsForTab(tabKey);
    this.clearFingerprints(tabKey);
    return true;
  }

  async handleTabComplete(tabId, tab) {
    if (!this.isAuditedTab(tabId) || !isAuditableUrl(tab.url)) return;
    await this.enableAuditingForTab(tab, {
      createNewRun: false,
      clearExistingEvents: false,
    });
  }

  async getStateResponse() {
    const sessionState = await this.getSessionState();
    const auditRuns = await this.repository.getAuditRunsMap();
    return {
      ...sessionState,
      auditRuns,
      lastTargetTabId: this.lastTargetTabId ? String(this.lastTargetTabId) : null,
    };
  }
}

export const DEFAULT_AUDIT_RUN = Object.freeze({
  reloadMode: "none",
  expectedPixels: DEFAULT_SETTINGS.expectedPixels,
  expectedEvents: DEFAULT_SETTINGS.expectedEvents,
});
