(() => {
  const previousOmniSignalState = globalThis.__OMNI_SIGNAL_CONTENT_STATE;
  if (previousOmniSignalState?.teardown) {
    previousOmniSignalState.teardown();
  }

  const omniSignalState = {
    active: true,
    cleanup: [],
    teardown() {
      this.active = false;
      this.cleanup.splice(0).forEach((fn) => {
        try {
          fn();
        } catch (_e) {}
      });
    },
  };

  globalThis.__OMNI_SIGNAL_CONTENT_STATE = omniSignalState;
  globalThis.__OMNI_SIGNAL_CONTENT_LOADED = true;

  function hasRuntimeContext() {
    try {
      return !!chrome?.runtime?.id;
    } catch (_e) {
      return false;
    }
  }

  function deactivateContentScript() {
    omniSignalState.teardown();
  }

  function safeSendMessage(message) {
    if (!omniSignalState.active || !hasRuntimeContext()) {
      deactivateContentScript();
      return;
    }

    try {
      chrome.runtime.sendMessage(message, () => {
        try {
          if (chrome.runtime.lastError) {
            const messageText = chrome.runtime.lastError.message || "";
            if (messageText.includes("Extension context invalidated")) {
              deactivateContentScript();
            }
          }
        } catch (_e) {
          deactivateContentScript();
        }
      });
    } catch (_e) {
      deactivateContentScript();
    }
  }

  function addWindowListener(type, handler, options) {
    window.addEventListener(type, handler, options);
    omniSignalState.cleanup.push(() =>
      window.removeEventListener(type, handler, options),
    );
  }

  function addRuntimeListener(handler) {
    if (!hasRuntimeContext()) return;
    try {
      chrome.runtime.onMessage.addListener(handler);
      omniSignalState.cleanup.push(() => {
        try {
          chrome.runtime.onMessage.removeListener(handler);
        } catch (_e) {}
      });
    } catch (_e) {
      deactivateContentScript();
    }
  }

  addWindowListener("PixelTracker_DataLayerPush", (event) => {
    safeSendMessage({
      type: "DATALAYER_PUSH",
      data: event.detail,
    });
  });

  addWindowListener("PixelTracker_DataLayerHistory", (event) => {
    safeSendMessage({
      type: "DATALAYER_HISTORY",
      data: event.detail,
    });
  });

  addWindowListener("PixelTracker_TagScan", (event) => {
    safeSendMessage({
      type: "TAG_SCAN_RESULT",
      data: event.detail,
    });
  });

  addRuntimeListener((message) => {
    if (message.type === "AUDIT_DEACTIVATED") {
      deactivateContentScript();
    }
  });
})();
