// --- DataLayer Interception ---
const script = document.createElement("script");
script.src = chrome.runtime.getURL("src/content/inject.js");
script.onload = function () {
  this.remove(); // Clean up after injection
};
(document.head || document.documentElement).appendChild(script);

window.addEventListener("PixelTracker_DataLayerPush", (e) => {
  chrome.runtime.sendMessage({
    type: "DATALAYER_PUSH",
    data: e.detail,
  });
});

window.addEventListener("PixelTracker_DataLayerHistory", (e) => {
  chrome.runtime.sendMessage({
    type: "DATALAYER_HISTORY",
    data: e.detail,
  });
});

// --- Visual Overlay (Floating Bubble) ---
let overlayElement = null;
let overlayCount = 0;

function createOverlay() {
  if (overlayElement) return;

  overlayElement = document.createElement("div");
  overlayElement.id = "omni-signal-overlay";

  // Bauhaus-style Premium Aesthetic
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
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

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
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  });

  document.body.appendChild(overlayElement);
}

function updateOverlay(count) {
  if (!overlayElement) createOverlay();

  const badge = overlayElement.querySelector(".count-badge");
  if (count > 0) {
    badge.style.display = "block";
    badge.textContent = count > 99 ? "99+" : count;

    if (count > overlayCount) {
      overlayElement.classList.remove("pulse");
      void overlayElement.offsetWidth; // trigger reflow
      overlayElement.classList.add("pulse");
    }
  } else {
    badge.style.display = "none";
  }
  overlayCount = count;
}

// Initial creation
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  createOverlay();
} else {
  window.addEventListener("DOMContentLoaded", createOverlay);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PIXEL_EVENT_CAPTURED") {
    updateOverlay(message.eventCount);
  }
});

