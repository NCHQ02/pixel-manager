/**
 * State Management for the Dashboard
 */
export class PixelStore {
  constructor() {
    this.events = {};
    this.settings = { maxEvents: 500, sessionWindow: 1800000 };
    this.auditRuns = {};
    this.auditState = { auditTabs: {}, activeAuditRunId: null };
    this.workspaceDraft = {};
    this.ready = false;
    this.listeners = [];
    this.init();
  }

  async init() {
    // Initial load
    const result = await chrome.storage.local.get([
      "trackedEvents",
      "settings",
      "auditRuns",
      "auditWorkspaceDraft",
    ]);
    this.events = result.trackedEvents || {};
    if (result.settings) this.settings = result.settings;
    this.auditRuns = result.auditRuns || {};
    this.workspaceDraft = result.auditWorkspaceDraft || {};
    await this.refreshAuditState();
    this.ready = true;
    this.notify();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        let shouldNotify = false;
        if (changes.trackedEvents) {
          this.events = changes.trackedEvents.newValue || {};
          shouldNotify = true;
        }
        if (changes.settings) {
          this.settings = changes.settings.newValue || this.settings;
          shouldNotify = true;
        }
        if (changes.auditRuns) {
          this.auditRuns = changes.auditRuns.newValue || {};
          shouldNotify = true;
        }
        if (changes.auditWorkspaceDraft) {
          this.workspaceDraft = changes.auditWorkspaceDraft.newValue || {};
          shouldNotify = true;
        }
        if (shouldNotify) this.notify();
      }
    });
  }

  async refreshAuditState() {
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_AUDIT_STATE" });
      if (state) {
        this.auditState = state;
        this.auditRuns = state.auditRuns || this.auditRuns;
      }
    } catch (_e) {}
  }

  async startAudit({ reload = false } = {}) {
    const result = await chrome.runtime.sendMessage({
      type: "START_AUDIT",
      reload,
    });
    await this.refreshAuditState();
    this.notify();
    return result;
  }

  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({ settings: this.settings });
  }

  async updateActiveAuditRun(patch) {
    const activeRunId = this.auditState?.activeAuditRunId;
    if (!activeRunId) return;

    const auditRuns = {
      ...this.auditRuns,
      [activeRunId]: {
        ...(this.auditRuns[activeRunId] || { id: activeRunId }),
        ...patch,
      },
    };
    this.auditRuns = auditRuns;
    await chrome.storage.local.set({ auditRuns });
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
    await chrome.storage.local.set({
      auditWorkspaceDraft: this.workspaceDraft,
    });
  }

  async clearWorkspaceDraft() {
    this.workspaceDraft = {};
    await chrome.storage.local.set({ auditWorkspaceDraft: {} });
    this.notify();
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback 
   */
  subscribe(callback) {
    this.listeners.push(callback);
    // Trigger immediately with current state
    callback(this.events, this);
  }

  notify() {
    this.listeners.forEach((callback) => callback(this.events, this));
  }

  /**
   * Returns a flattened list of all events, sorted by timestamp
   */
  getAllEvents() {
    let all = [];
    for (const tabId in this.events) {
      all = all.concat(this.events[tabId]);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear all stored events
   */
  async clearAll() {
    await chrome.storage.local.set({ trackedEvents: {}, auditRuns: {} });
    this.events = {};
    this.auditRuns = {};
    this.notify();
  }
}

export const store = new PixelStore();
