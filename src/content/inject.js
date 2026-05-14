(function() {
  if (window.__OMNI_SIGNAL_INJECTED) return;
  window.__OMNI_SIGNAL_INJECTED = true;

  window.dataLayer = window.dataLayer || [];
  const originalPush = window.dataLayer.push;

  function isArgumentsObject(value) {
    return Object.prototype.toString.call(value) === '[object Arguments]';
  }

  function normalizeDataLayerItem(item) {
    if (isArgumentsObject(item)) {
      return Array.prototype.slice.call(item).map(normalizeDataLayerItem);
    }
    if (Array.isArray(item)) {
      return item.map(normalizeDataLayerItem);
    }
    return item;
  }

  function safeClone(obj) {
    const cache = new Set();
    const str = JSON.stringify(obj, (key, value) => {
      if (value === undefined) return '[undefined]';
      if (typeof value === 'object' && value !== null) {
        if (isArgumentsObject(value)) {
          return Array.prototype.slice.call(value).map(normalizeDataLayerItem);
        }
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
    const args = Array.prototype.slice.call(arguments).map(normalizeDataLayerItem);
    
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

  function safeUrlParts(rawUrl) {
    try {
      const parsed = new URL(rawUrl, window.location.href);
      return {
        host: parsed.hostname,
        path: parsed.pathname,
        id: parsed.searchParams.get('id') || parsed.searchParams.get('sdkid') || ''
      };
    } catch (e) {
      return { host: '', path: '', id: '' };
    }
  }

  function getDataLayerCommands() {
    const layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    return layer.slice(0, 100).map(function(item, index) {
      const normalizedItem = normalizeDataLayerItem(item);
      if (Array.isArray(normalizedItem)) {
        const type = typeof normalizedItem[0] === 'string' ? normalizedItem[0] : 'array';
        const state =
          type === 'consent' &&
          normalizedItem[2] &&
          typeof normalizedItem[2] === 'object' &&
          !Array.isArray(normalizedItem[2])
            ? safeClone(normalizedItem[2])
            : null;
        return {
          index: index,
          type: type,
          name: typeof normalizedItem[1] === 'string' ? normalizedItem[1] : '',
          mode: type === 'consent' && typeof normalizedItem[1] === 'string' ? normalizedItem[1] : '',
          state: state
        };
      }
      if (normalizedItem && typeof normalizedItem === 'object') {
        return {
          index: index,
          type: normalizedItem.event ? 'event' : 'object',
          name: normalizedItem.event || ''
        };
      }
      return { index: index, type: typeof normalizedItem, name: '' };
    });
  }

  function scanTags() {
    try {
      const scripts = Array.prototype.slice.call(document.scripts || [])
        .map(function(script) {
          const parts = script.src ? safeUrlParts(script.src) : null;
          return parts && (
            parts.host.includes('googletagmanager.com') ||
            parts.host.includes('google-analytics.com') ||
            parts.host.includes('googleadservices.com') ||
            parts.host.includes('facebook.net') ||
            parts.host.includes('facebook.com') ||
            parts.host.includes('tiktok.com') ||
            parts.host.includes('byteoversea.com') ||
            parts.host.includes('doubleclick.net')
          )
            ? {
                host: parts.host,
                path: parts.path,
                id: parts.id,
                inHead: !!document.head && document.head.contains(script),
                async: !!script.async,
                defer: !!script.defer
              }
            : null;
        })
        .filter(Boolean);

      const commands = getDataLayerCommands();
      const commandTypes = commands.map(function(command) { return command.type; });
      const firstConfigIndex = commandTypes.indexOf('config');
      const firstEventIndex = commandTypes.indexOf('event');
      const firstConsentIndex = commandTypes.indexOf('consent');
      const gtmContainers = scripts
        .filter(function(script) {
          return script.host.includes('googletagmanager.com') && script.path.includes('/gtm.js');
        })
        .map(function(script) { return script.id; })
        .filter(Boolean);
      const googleTagIds = scripts
        .filter(function(script) {
          return script.host.includes('googletagmanager.com') && script.path.includes('/gtag/js');
        })
        .map(function(script) { return script.id; })
        .filter(Boolean);
      const cookie = document.cookie || '';

      window.dispatchEvent(new CustomEvent('PixelTracker_TagScan', {
        detail: {
          timestamp: Date.now(),
          url: window.location.href,
          title: document.title || '',
          globals: {
            fbq: typeof window.fbq === 'function',
            ttq: !!window.ttq,
            gtag: typeof window.gtag === 'function',
            dataLayer: Array.isArray(window.dataLayer),
            dataLayerLength: Array.isArray(window.dataLayer) ? window.dataLayer.length : 0
          },
          scripts: scripts,
          platforms: {
            Meta: scripts.some(function(script) {
              return script.host.includes('facebook.net') || script.host.includes('facebook.com');
            }) || typeof window.fbq === 'function',
            TikTok: scripts.some(function(script) {
              return script.host.includes('tiktok.com') || script.host.includes('byteoversea.com');
            }) || !!window.ttq,
            Google: scripts.some(function(script) {
              return script.host.includes('googletagmanager.com') ||
                script.host.includes('google-analytics.com') ||
                script.host.includes('googleadservices.com') ||
                script.host.includes('doubleclick.net');
            }) || typeof window.gtag === 'function'
          },
          google: {
            gtmContainers: gtmContainers,
            googleTagIds: googleTagIds,
            firstConfigIndex: firstConfigIndex,
            firstEventIndex: firstEventIndex,
            firstConsentIndex: firstConsentIndex,
            eventBeforeConfig:
              firstEventIndex >= 0 &&
              (firstConfigIndex === -1 || firstEventIndex < firstConfigIndex),
            consentSeen: firstConsentIndex >= 0
          },
          cookies: {
            gclAw: /(?:^|; )_gcl_aw=/.test(cookie),
            gclAu: /(?:^|; )_gcl_au=/.test(cookie),
            fbp: /(?:^|; )_fbp=/.test(cookie),
            fbc: /(?:^|; )_fbc=/.test(cookie),
            ttclid: /(?:^|; )ttclid=/.test(cookie)
          },
          dataLayerCommands: commands
        }
      }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('PixelTracker_TagScan', {
        detail: {
          timestamp: Date.now(),
          scannerError: String(e && e.message ? e.message : e)
        }
      }));
    }
  }

  scanTags();
  window.setTimeout(scanTags, 1500);

})();
