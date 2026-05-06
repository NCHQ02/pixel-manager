// Inject the script into the main page context to access window.dataLayer
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/content/inject.js');
script.onload = function() {
  this.remove(); // Clean up after injection
};
(document.head || document.documentElement).appendChild(script);

// Listen for custom events dispatched by our injected script
window.addEventListener('PixelTracker_DataLayerPush', (e) => {
  chrome.runtime.sendMessage({
    type: 'DATALAYER_PUSH',
    data: e.detail
  });
});

window.addEventListener('PixelTracker_DataLayerHistory', (e) => {
  chrome.runtime.sendMessage({
    type: 'DATALAYER_HISTORY',
    data: e.detail
  });
});
