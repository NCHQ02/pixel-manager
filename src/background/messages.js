import { MESSAGE_TYPES } from "../shared/messages.js";

export function openDashboard(chromeApi) {
  const dashboardUrl = chromeApi.runtime.getURL("src/dashboard/index.html");
  chromeApi.tabs.query({ url: dashboardUrl }, (tabs) => {
    if (tabs.length > 0) {
      chromeApi.windows.update(tabs[0].windowId, { focused: true });
      chromeApi.tabs.update(tabs[0].id, { active: true });
    } else {
      chromeApi.windows.create({
        url: dashboardUrl,
        type: "popup",
        width: 1400,
        height: 900,
      });
    }
  });
}

export function registerRuntimeMessages({
  chromeApi,
  sessionManager,
  captureEngine,
  ready = Promise.resolve(),
}) {
  chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MESSAGE_TYPES.OPEN_DASHBOARD) {
      (async () => {
        await ready;
        if (sender.tab) await sessionManager.enableAuditingForTab(sender.tab);
        openDashboard(chromeApi);
      })();
    }

    if (message.type === MESSAGE_TYPES.GET_AUDIT_STATE) {
      (async () => {
        await ready;
        sendResponse(await sessionManager.getStateResponse());
      })();
      return true;
    }

    if (message.type === MESSAGE_TYPES.START_AUDIT) {
      (async () => {
        await ready;
        const tab = sender.tab || (await sessionManager.getTargetTab());
        if (!tab) {
          sendResponse({ ok: false, error: "No auditable tab is available." });
          return;
        }

        const context = await sessionManager.enableAuditingForTab(tab, {
          createNewRun: true,
          reload: !!message.reload,
          reloadMode: message.reload ? "reload" : "none",
        });
        await captureEngine.notifyEventsChanged(tab.id);
        sendResponse({
          ok: true,
          tabId: String(tab.id),
          auditRunId: context?.auditRunId || sessionManager.getActiveRunId(),
        });
      })();
      return true;
    }

    if (
      message.type === MESSAGE_TYPES.DATALAYER_PUSH ||
      message.type === MESSAGE_TYPES.DATALAYER_HISTORY
    ) {
      ready.then(() => captureEngine.handleDataLayerMessage(message, sender));
    }

    if (message.type === MESSAGE_TYPES.TAG_SCAN_RESULT) {
      ready.then(() => captureEngine.handleTagScanMessage(message, sender));
    }
  });
}
