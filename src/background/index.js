import { eventRepository } from "../shared/event-repository.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import { CaptureEngine } from "./capture.js";
import { TRACKING_URL_PATTERNS } from "./constants.js";
import { openDashboard, registerRuntimeMessages } from "./messages.js";
import { AuditSessionManager } from "./session.js";
import { clearFingerprints } from "./utils.js";

const sessionManager = new AuditSessionManager({
  chromeApi: chrome,
  repository: eventRepository,
  clearFingerprints,
});

let runtimeSettings = { ...DEFAULT_SETTINGS };

const captureEngine = new CaptureEngine({
  chromeApi: chrome,
  repository: eventRepository,
  sessionManager,
  getSettings: () => runtimeSettings,
});

chrome.storage.local.get(["settings"], (res) => {
  runtimeSettings = normalizeSettings(res.settings);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.settings) {
    runtimeSettings = normalizeSettings(changes.settings.newValue);
  }
});

const ready = eventRepository
  .init()
  .then(() => eventRepository.migrateLegacyStorage(chrome.storage.local))
  .then(() => sessionManager.hydrate())
  .catch((err) => {
    console.error("[OmniSignal] Background initialization failed:", err);
    throw err;
  });

registerRuntimeMessages({
  chromeApi: chrome,
  sessionManager,
  captureEngine,
  ready,
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    ready.then(() => captureEngine.handleNetworkRequest(details));
  },
  { urls: TRACKING_URL_PATTERNS },
  ["requestBody"],
);

chrome.action.onClicked.addListener(async (tab) => {
  await ready;
  await sessionManager.enableAuditingForTab(tab, { createNewRun: true });
  await captureEngine.notifyEventsChanged(tab.id);
  openDashboard(chrome);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  ready.then(async () => {
    const cleared = await sessionManager.handleNavigationStarted(
      details.tabId,
      details.url,
    );
    if (cleared) {
      await captureEngine.notifyEventsChanged(details.tabId);
      await captureEngine.notifyOverlay(details.tabId);
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  ready.then(() => sessionManager.handleTabRemoved(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    ready.then(async () => {
      const cleared = await sessionManager.handleTabLoading(tabId, tab);
      if (cleared) {
        await captureEngine.notifyEventsChanged(tabId);
        await captureEngine.notifyOverlay(tabId);
      }
    });
  }

  if (changeInfo.status === "complete") {
    ready.then(() => sessionManager.handleTabComplete(tabId, tab));
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime
    .sendMessage({ type: MESSAGE_TYPES.EVENTS_CHANGED })
    .catch(() => {});
});
