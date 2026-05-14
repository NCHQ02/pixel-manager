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
      const overlay = document.getElementById("omni-signal-overlay");
      if (overlay) overlay.remove();
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

  let overlayElement = null;
  let overlayCount = 0;

  function createOverlay() {
    if (!omniSignalState.active) return;
    if (overlayElement?.isConnected) return;

    const existingOverlay = document.getElementById("omni-signal-overlay");
    if (existingOverlay) existingOverlay.remove();

    overlayElement = document.createElement("div");
    overlayElement.id = "omni-signal-overlay";

    const styles = `
    #omni-signal-overlay {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      background: #111111;
      color: #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      border: 1px solid rgba(255,255,255,0.1);
      user-select: none;
    }
    #omni-signal-overlay:hover {
      transform: scale(1.1);
      background: #000000;
    }
    #omni-signal-overlay.pulse {
      animation: omni-pulse 0.4s cubic-bezier(0.19, 1, 0.22, 1);
    }
    @keyframes omni-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.2); background: #6366F1; }
      100% { transform: scale(1); }
    }
    #omni-signal-overlay .count-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #6366F1;
      color: white;
      border-radius: 99px;
      padding: 2px 6px;
      font-size: 10px;
      min-width: 14px;
      text-align: center;
    }
  `;

    const styleSheet = document.createElement("style");
    styleSheet.id = "omni-signal-overlay-style";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    omniSignalState.cleanup.push(() => styleSheet.remove());

    overlayElement.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="m22 12-4.3-4.3" />
      <path d="M22 12H2" />
      <path d="m6.3 16.3-4.3-4.3" />
      <path d="m6.3 7.7-4.3 4.3" />
    </svg>
    <div class="count-badge" style="display: none;">0</div>
  `;

    overlayElement.addEventListener("click", () => {
      safeSendMessage({ type: "OPEN_DASHBOARD" });
    });

    document.body.appendChild(overlayElement);
    omniSignalState.cleanup.push(() => overlayElement?.remove());
  }

  function updateOverlay(count) {
    if (!omniSignalState.active) return;
    if (!overlayElement?.isConnected) createOverlay();

    const badge = overlayElement?.querySelector(".count-badge");
    if (!badge) return;

    if (count > 0) {
      badge.style.display = "block";
      badge.textContent = count > 99 ? "99+" : count;

      if (count > overlayCount) {
        overlayElement.classList.remove("pulse");
        void overlayElement.offsetWidth;
        overlayElement.classList.add("pulse");
      }
    } else {
      badge.style.display = "none";
    }
    overlayCount = count;
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    createOverlay();
  } else {
    addWindowListener("DOMContentLoaded", createOverlay);
  }

  addRuntimeListener((message) => {
    if (message.type === "AUDIT_DEACTIVATED") {
      deactivateContentScript();
      return;
    }

    if (message.type === "PIXEL_EVENT_CAPTURED") {
      updateOverlay(message.eventCount);
    }
  });
})();
