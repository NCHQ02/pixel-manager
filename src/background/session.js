import "../shared/contracts.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { sanitizeCapturedUrl } from "./utils.js";

const LOADING_EVENT_RACE_GRACE_MS = 500;
const NAVIGATION_CLEAR_SUPPRESS_LOADING_MS = 10000;

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

async function safeTabSend(chromeApi, tabId, message) {
  try {
    await chromeApi.tabs.sendMessage(Number(tabId), message);
  } catch (_e) {}
}

function buildActivationResult({
  contentInjected = false,
  mainWorldInjected = false,
  errors = [],
} = {}) {
  const warnings = errors.filter(Boolean).map((error) => String(error));
  return {
    activationMode:
      contentInjected && mainWorldInjected ? "full" : "network_only",
    contentInjected,
    mainWorldInjected,
    error: warnings[0] || "",
    warnings,
  };
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
    this.navigationClearTimestamps = {};
    this.loadingFallbackTimestamps = {};
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
    if (tab?.id === undefined || tab?.id === null || !isAuditableUrl(tab.url)) {
      return null;
    }

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

    const activation = await this.injectAuditScripts(tab.id);
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
      activationMode: activation.activationMode,
      contentInjected: activation.contentInjected,
      mainWorldInjected: activation.mainWorldInjected,
      activationError: activation.error,
      activationWarnings: activation.warnings,
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

    if (options.reload) {
      this.chrome.tabs.reload(tab.id);
    }

    return context;
  }

  async injectAuditScripts(tabId) {
    let contentInjected = false;
    let mainWorldInjected = false;
    const errors = [];

    try {
      await this.chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/content.js"],
      });
      contentInjected = true;
    } catch (err) {
      errors.push(err?.message || err);
    }

    try {
      await this.chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/inject.js"],
        world: "MAIN",
      });
      mainWorldInjected = true;
    } catch (err) {
      errors.push(err?.message || err);
    }

    const activation = buildActivationResult({
      contentInjected,
      mainWorldInjected,
      errors,
    });
    if (activation.activationMode !== "full") {
      console.warn("[OmniSignal] Audit activated in network-only mode:", errors);
    }
    return activation;
  }

  async clearAuditState() {
    const tabIds = new Set([
      ...this.auditedTabIds,
      ...Object.keys(this.auditTabContexts).map((tabId) => Number(tabId)),
    ]);

    await Promise.all(
      [...tabIds].map((tabId) =>
        safeTabSend(this.chrome, tabId, {
          type: MESSAGE_TYPES.AUDIT_DEACTIVATED,
        }),
      ),
    );

    [...tabIds].forEach((tabId) => this.clearFingerprints(String(tabId)));
    this.auditedTabIds.clear();
    this.auditTabContexts = {};
    this.activeAuditRunId = null;
    this.lastTargetTabId = null;
    this.navigationClearTimestamps = {};
    this.loadingFallbackTimestamps = {};
    await this.setSessionState({ auditTabs: {}, activeAuditRunId: null });
  }

  async handleTabRemoved(tabId) {
    const tabKey = String(tabId);
    this.auditedTabIds.delete(tabId);
    const removedContext = this.auditTabContexts[tabKey];
    const { auditTabs, activeAuditRunId } = await this.getSessionState();
    delete auditTabs[tabKey];
    delete this.auditTabContexts[tabKey];
    delete this.navigationClearTimestamps[tabKey];
    delete this.loadingFallbackTimestamps[tabKey];

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
    const now = Date.now();
    const lastNavigationClear = this.navigationClearTimestamps[tabKey] || 0;
    if (
      lastNavigationClear &&
      now - lastNavigationClear < NAVIGATION_CLEAR_SUPPRESS_LOADING_MS
    ) {
      return false;
    }
    const previousLoading = this.loadingFallbackTimestamps[tabKey] || 0;
    const cutoffTimestamp = Math.max(
      now - LOADING_EVENT_RACE_GRACE_MS,
      previousLoading + LOADING_EVENT_RACE_GRACE_MS,
    );
    this.loadingFallbackTimestamps[tabKey] = now;
    await this.repository.clearEventsForTabBefore(
      tabKey,
      cutoffTimestamp,
    );
    this.clearFingerprints(tabKey);
    return true;
  }

  async handleNavigationStarted(tabId, url) {
    if (!this.isAuditedTab(tabId) || !isAuditableUrl(url)) return false;
    const tabKey = String(tabId);
    const now = Date.now();
    this.navigationClearTimestamps[tabKey] = now;
    this.loadingFallbackTimestamps[tabKey] = now;
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
