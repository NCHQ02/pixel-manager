/**
 * State Management for the Dashboard
 */
export class PixelStore {
  constructor() {
    this.events = {};
    this.listeners = [];
    this.init();
  }

  async init() {
    // Initial load
    const result = await chrome.storage.local.get(["trackedEvents"]);
    this.events = result.trackedEvents || {};
    this.notify();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local" && changes.trackedEvents) {
        this.events = changes.trackedEvents.newValue || {};
        this.notify();
      }
    });
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
