(function() {
  if (window.__OMNI_SIGNAL_INJECTED) return;
  window.__OMNI_SIGNAL_INJECTED = true;

  window.dataLayer = window.dataLayer || [];
  const originalPush = window.dataLayer.push;

  function safeClone(obj) {
    const cache = new Set();
    const str = JSON.stringify(obj, (key, value) => {
      if (value === undefined) return '[undefined]';
      if (typeof value === 'object' && value !== null) {
        // Drop DOM Nodes (which usually contain circular React Fiber references)
        if (value.nodeType || value === window || value === document) {
          return '[DOM Element]';
        }
        if (cache.has(value)) {
          return '[Circular Reference]';
        }
        cache.add(value);
      }
      if (typeof value === 'function') return '[Function]';
      return value;
    });
    return JSON.parse(str || "{}");
  }

  window.dataLayer.push = function() {
    const args = Array.prototype.slice.call(arguments);
    
    try {
      const clonedArgs = safeClone(args);
      
      window.dispatchEvent(new CustomEvent('PixelTracker_DataLayerPush', {
        detail: {
          timestamp: Date.now(),
          payload: clonedArgs
        }
      }));
    } catch (e) {
      console.warn('[PixelTracker] Could not serialize dataLayer payload', e);
    }

    return originalPush.apply(window.dataLayer, args);
  };

  // Capture existing dataLayer items that were pushed before our script loaded
  try {
    const existing = safeClone(window.dataLayer);
    window.dispatchEvent(new CustomEvent('PixelTracker_DataLayerHistory', {
      detail: {
        timestamp: Date.now(),
        payload: existing
      }
    }));
  } catch (e) {}

})();
