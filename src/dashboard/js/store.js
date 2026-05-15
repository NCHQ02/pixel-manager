import { eventRepository } from "../../shared/event-repository.js";
import { MESSAGE_TYPES } from "../../shared/messages.js";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeSettings,
} from "../../shared/settings.js";

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res || {}));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

/**
 * Dashboard state facade. Settings and drafts stay in chrome.storage.local;
 * audit events and runs live in IndexedDB through the shared repository.
 */
export class PixelStore {
  constructor(repository = eventRepository) {
    this.repository = repository;
    this.events = {};
    this.settings = { ...DEFAULT_SETTINGS };
    this.auditRuns = {};
    this.auditState = { auditTabs: {}, activeAuditRunId: null };
    this.workspaceDraft = {};
    this.ready = false;
    this.listeners = [];
    this.init();
  }

  async init() {
    await this.repository.init();
    await this.repository.migrateLegacyStorage(chrome.storage.local);

    const result = await storageGet([
      "settings",
      "auditWorkspaceDraft",
    ]);
    this.settings = normalizeSettings(result.settings);
    this.workspaceDraft = result.auditWorkspaceDraft || {};
    await this.refreshEvents();
    await this.refreshAuditState();
    this.ready = true;
    this.notify();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== "local") return;
      let shouldNotify = false;
      if (changes.settings) {
        this.settings = normalizeSettings(
          changes.settings.newValue || this.settings,
        );
        shouldNotify = true;
      }
      if (changes.auditWorkspaceDraft) {
        this.workspaceDraft = changes.auditWorkspaceDraft.newValue || {};
        shouldNotify = true;
      }
      if (shouldNotify) this.notify();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === MESSAGE_TYPES.EVENTS_CHANGED) {
        this.refreshEvents().then(() => {
          this.refreshAuditState().then(() => this.notify());
        });
      }
    });
  }

  async refreshEvents() {
    this.events = await this.repository.getEventsMap();
    this.auditRuns = await this.repository.getAuditRunsMap();
  }

  async refreshAuditState() {
    try {
      const state = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIT_STATE,
      });
      if (state) {
        this.auditState = state;
        this.auditRuns = state.auditRuns || this.auditRuns;
      }
    } catch (_e) {}
  }

  async startAudit({ reload = false, tabId = null } = {}) {
    const result = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.START_AUDIT,
      reload,
      targetTabId: tabId,
    });
    await this.refreshEvents();
    await this.refreshAuditState();
    this.notify();
    return result;
  }

  async saveSettings(newSettings) {
    this.settings = mergeSettings(this.settings, newSettings);
    await storageSet({ settings: this.settings });
    await this.trimEventsToMax(this.settings.maxEvents);
  }

  async replaceSettings(newSettings) {
    this.settings = normalizeSettings(newSettings);
    await storageSet({ settings: this.settings });
    await this.trimEventsToMax(this.settings.maxEvents);
  }

  async trimEventsToMax(maxEvents = this.settings.maxEvents) {
    const limit = Number.parseInt(maxEvents, 10) || DEFAULT_SETTINGS.maxEvents;
    const changed = await this.repository.trimEventsToMax(limit);
    if (!changed) return false;
    await this.refreshEvents();
    this.notify();
    return true;
  }

  async updateActiveAuditRun(patch) {
    const activeRunId = this.auditState?.activeAuditRunId;
    if (!activeRunId) return;

    await this.repository.patchAuditRun(activeRunId, patch);
    this.auditRuns = await this.repository.getAuditRunsMap();
    this.notify();
  }

  async saveWorkspaceDraft(partialDraft) {
    this.workspaceDraft = {
      ...this.workspaceDraft,
      ...partialDraft,
      filters: {
        ...(this.workspaceDraft.filters || {}),
        ...(partialDraft.filters || {}),
      },
      expectedPixels:
        partialDraft.expectedPixels !== undefined
          ? { ...(partialDraft.expectedPixels || {}) }
          : { ...(this.workspaceDraft.expectedPixels || {}) },
      expectedEvents:
        partialDraft.expectedEvents !== undefined
          ? [...(partialDraft.expectedEvents || [])]
          : [...(this.workspaceDraft.expectedEvents || [])],
    };
    await storageSet({
      auditWorkspaceDraft: this.workspaceDraft,
    });
  }

  async clearWorkspaceDraft() {
    this.workspaceDraft = {};
    await storageSet({ auditWorkspaceDraft: {} });
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.events, this);
  }

  notify() {
    this.listeners.forEach((callback) => callback(this.events, this));
  }

  getAllEvents() {
    let all = [];
    for (const tabId in this.events) {
      all = all.concat(this.events[tabId]);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  async clearAll() {
    await this.repository.clearAll();
    await storageRemove(["trackedEvents", "auditRuns"]);
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CLEAR_AUDIT_STATE,
      });
    } catch (_e) {}
    await this.refreshEvents();
    await this.refreshAuditState();
    this.events = {};
    this.auditRuns = {};
    this.notify();
  }
}

export const store = new PixelStore();
