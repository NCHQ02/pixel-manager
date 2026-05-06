/**
 * State Management for the Dashboard
 */
export class PixelStore {
  constructor() {
    this.events = {};
    this.settings = { maxEvents: 500, sessionWindow: 1800000 };
    this.listeners = [];
    this.init();
  }

  async init() {
    // Initial load
    const result = await chrome.storage.local.get(["trackedEvents", "settings"]);
    this.events = result.trackedEvents || {};
    if (result.settings) this.settings = result.settings;
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
        if (shouldNotify) this.notify();
      }
    });
  }

  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({ settings: this.settings });
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback 
   */
  subscribe(callback) {
    this.listeners.push(callback);
    // Trigger immediately with current state
    callback(this.events);
  }

  notify() {
    this.listeners.forEach((callback) => callback(this.events));
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
    await chrome.storage.local.set({ trackedEvents: {} });
    this.events = {};
    this.notify();
  }
}

export const store = new PixelStore();
