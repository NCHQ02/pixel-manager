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

function getTabById(chromeApi, tabId) {
  return new Promise((resolve) => {
    chromeApi.tabs.get(Number(tabId), (tab) => {
      if (chromeApi.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
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
        if (sender.tab) {
          await sessionManager.enableAuditingForTab(sender.tab, {
            resumeExistingEvents: true,
          });
        }
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
        const requestedTabId = message.targetTabId ?? message.tabId;
        const senderTab = /^https?:\/\//i.test(sender.tab?.url || "")
          ? sender.tab
          : null;
        const tab =
          senderTab ||
          (requestedTabId !== undefined && requestedTabId !== null
            ? await getTabById(chromeApi, requestedTabId)
            : null) ||
          (await sessionManager.getTargetTab());
        if (!tab) {
          sendResponse({
            ok: false,
            activationMode: "blocked",
            warnings: ["No auditable tab is available."],
            error: "No auditable tab is available.",
          });
          return;
        }

        const context = await sessionManager.enableAuditingForTab(tab, {
          createNewRun: !!message.reload,
          resumeExistingEvents: !message.reload,
          reload: !!message.reload,
          reloadMode: message.reload ? "reload" : "none",
        });
        if (!context) {
          sendResponse({
            ok: false,
            activationMode: "blocked",
            warnings: ["The selected tab cannot be audited."],
            error: "The selected tab cannot be audited.",
          });
          return;
        }
        await captureEngine.notifyEventsChanged(tab.id);
        await captureEngine.notifyBadge(tab.id);
        sendResponse({
          ok: true,
          tabId: String(tab.id),
          auditRunId: context.auditRunId || sessionManager.getActiveRunId(),
          activationMode: context.activationMode || "full",
          warnings: context.activationWarnings || [],
        });
      })();
      return true;
    }

    if (message.type === MESSAGE_TYPES.CLEAR_AUDIT_STATE) {
      (async () => {
        await ready;
        const clearedTabIds = await sessionManager.clearAuditState();
        await Promise.all(
          clearedTabIds.map((tabId) => captureEngine.clearBadge(tabId)),
        );
        await captureEngine.clearBadge();
        await captureEngine.notifyEventsChanged();
        sendResponse({ ok: true });
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
