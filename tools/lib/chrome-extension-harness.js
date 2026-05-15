import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const DEFAULT_VIEWPORT = Object.freeze({
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});

const DEFAULT_TIMEOUT_MS = 30000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function windowsCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    path.join(
      process.env.PROGRAMFILES || "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
  ];
}

function unixCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
}

export function findChromeExecutable() {
  const candidates = process.platform === "win32" ? windowsCandidates() : unixCandidates();
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) || "";
}

export async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function readJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
  });
}

async function waitForDebugEndpoint(port, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      return await readJson(`http://127.0.0.1:${port}/json/version`);
    } catch (err) {
      lastError = err;
      await sleep(150);
    }
  }
  throw new Error(`Chrome DevTools endpoint did not become ready: ${lastError?.message || ""}`);
}

function createTempProfileDir() {
  const base = process.env.OMNISIGNAL_E2E_TMP || path.join(REPO_ROOT, "dist", "tmp");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, "omnisignal-chrome-"));
}

export async function launchChromeWithExtension(options = {}) {
  let extensionDir = path.resolve(
    options.extensionDir || process.env.OMNISIGNAL_EXTENSION_DIR || REPO_ROOT,
  );
  if (
    options.patchLocalhostPermission !== false &&
    normalizePathForCompare(extensionDir) === normalizePathForCompare(REPO_ROOT)
  ) {
    extensionDir = prepareE2eExtensionCopy(extensionDir);
  }
  const extensionFlagPath = extensionDir.replaceAll("\\", "/");
  const chromePath = options.chromePath || findChromeExecutable();
  if (!chromePath) {
    throw new Error(
      "Chrome executable not found. Set CHROME_PATH to run extension smoke tests.",
    );
  }

  const port = options.port || (await getFreePort());
  const profileDir = options.profileDir || createTempProfileDir();
  const headless = options.headless ?? process.env.OMNISIGNAL_E2E_HEADLESS === "1";
  const viewport = { ...DEFAULT_VIEWPORT, ...(options.viewport || {}) };
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionFlagPath}`,
    `--load-extension=${extensionFlagPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--edge-skip-compat-layer-relaunch",
    "--no-service-autorun",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-accelerated-2d-canvas",
    "--disable-accelerated-video-decode",
    "--disable-gpu-compositing",
    "--disable-gpu-rasterization",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
    "--disable-features=Translate,OptimizationHints,MediaRouter,VizDisplayCompositor,CanvasOopRasterization,msEdgeStartupBoost",
    "--host-resolver-rules=MAP www.facebook.com 127.0.0.1,MAP analytics.tiktok.com 127.0.0.1,MAP www.google-analytics.com 127.0.0.1,MAP www.googleadservices.com 127.0.0.1,EXCLUDE localhost,EXCLUDE 127.0.0.1",
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ];

  if (headless) {
    chromeArgs.splice(1, 0, "--headless=new", "--disable-gpu", "--in-process-gpu");
  }
  if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0) {
    chromeArgs.splice(1, 0, "--no-sandbox");
  }

  const browser = spawn(chromePath, chromeArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const logs = [];
  browser.stdout.on("data", (chunk) => logs.push(String(chunk)));
  browser.stderr.on("data", (chunk) => logs.push(String(chunk)));

  try {
    const version = await waitForDebugEndpoint(port, options.timeoutMs);
    const cdp = new CdpConnection(version.webSocketDebuggerUrl);
    await cdp.connect();
    const handle = {
      browser,
      cdp,
      chromePath,
      logs,
      port,
      profileDir,
      async close() {
        try {
          cdp.close();
        } catch (_e) {}
        killBrowserTree(browser);
        await sleep(300);
        if (process.env.OMNISIGNAL_CLEAN_PROFILE === "1") {
          try {
            fs.rmSync(profileDir, { recursive: true, force: true });
          } catch (_e) {}
        }
      },
    };
    const cleanup = () => {
      killBrowserTree(browser);
    };
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    return handle;
  } catch (err) {
    killBrowserTree(browser);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_e) {}
    err.message = `${err.message}\nChrome logs:\n${logs.join("")}`;
    throw err;
  }
}

function prepareE2eExtensionCopy(sourceDir) {
  const targetDir = fs.mkdtempSync(
    path.join(REPO_ROOT, "dist", "tmp", "extension-under-test-"),
  );
  for (const entry of ["manifest.json", "logo.png", "assets", "src"]) {
    fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
      recursive: true,
    });
  }
  const manifestPath = path.join(targetDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = [
    ...new Set([
      ...(manifest.host_permissions || []),
      "http://127.0.0.1/*",
      "http://localhost/*",
    ]),
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return targetDir;
}

function killBrowserTree(browser) {
  if (!browser || browser.killed) return;
  if (process.platform === "win32" && browser.pid) {
    const killer = spawn("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    try {
      browser.kill();
    } catch (_e) {}
    try {
      browser.stdout?.destroy();
      browser.stderr?.destroy();
    } catch (_e) {}
    return;
  }
  browser.kill();
}

export class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting to Chrome DevTools WebSocket")),
        DEFAULT_TIMEOUT_MS,
      );
      this.ws.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      this.ws.addEventListener(
        "error",
        (event) => {
          clearTimeout(timeout);
          reject(event.error || new Error("Chrome DevTools WebSocket error"));
        },
        { once: true },
      );
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(`${message.error.message}: ${message.error.data || ""}`));
        } else {
          resolve(message.result || {});
        }
        return;
      }

      const key = this.eventKey(message.sessionId, message.method);
      const handlers = this.listeners.get(key) || [];
      handlers.slice().forEach((handler) => handler(message.params || {}));
    });
    this.ws.addEventListener("close", () => {
      for (const [id, { reject }] of this.pending) {
        reject(new Error(`Chrome DevTools WebSocket closed with pending command ${id}`));
      }
      this.pending.clear();
    });
  }

  close() {
    this.ws?.close();
  }

  eventKey(sessionId, method) {
    return `${sessionId || "browser"}:${method}`;
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const id = this.nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });
    this.ws.send(JSON.stringify(payload));
    return promise;
  }

  waitForEvent(sessionId, method, predicate = () => true, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const key = this.eventKey(sessionId, method);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        if (!predicate(params)) return;
        cleanup();
        resolve(params);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        const handlers = this.listeners.get(key) || [];
        this.listeners.set(
          key,
          handlers.filter((candidate) => candidate !== handler),
        );
      };
      this.listeners.set(key, [...(this.listeners.get(key) || []), handler]);
    });
  }
}

export async function createPage(cdp, url = "about:blank", viewport = DEFAULT_VIEWPORT) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await sleep(300);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { ...DEFAULT_VIEWPORT, ...viewport },
    sessionId,
  );
  if (url !== "about:blank") {
    await navigate(cdp, sessionId, url);
  }
  return { targetId, sessionId };
}

export async function navigate(cdp, sessionId, url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const load = cdp.waitForEvent(sessionId, "Page.loadEventFired", () => true, timeoutMs);
  await cdp.send("Page.navigate", { url }, sessionId);
  await load.catch(() => {});
  await waitForPageReady(cdp, sessionId, timeoutMs);
}

export async function waitForPageReady(cdp, sessionId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await waitForExpression(
    cdp,
    sessionId,
    "document.readyState === 'complete' || document.readyState === 'interactive'",
    { timeoutMs },
  );
}

export async function evaluate(cdp, sessionId, expression, options = {}) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: options.awaitPromise ?? true,
      returnByValue: options.returnByValue ?? true,
      userGesture: options.userGesture ?? false,
    },
    sessionId,
  );
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Evaluation failed: ${text}`);
  }
  return result.result?.value;
}

export async function waitForExpression(cdp, sessionId, expression, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs || 150;
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeoutMs) {
    lastValue = await evaluate(cdp, sessionId, expression, { awaitPromise: true });
    if (lastValue) return lastValue;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for expression: ${expression}. Last value: ${lastValue}`);
}

export async function click(cdp, sessionId, selector) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`,
    { userGesture: true },
  );
}

export async function waitForExtensionId(cdp, options = {}) {
  const timeoutMs =
    typeof options === "number" ? options : options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const profileDir = typeof options === "object" ? options.profileDir : "";
  const extensionDir = path.resolve(
    typeof options === "object" ? options.extensionDir || REPO_ROOT : REPO_ROOT,
  );
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const target = targetInfos.find((info) =>
      /^chrome-extension:\/\/[^/]+\/src\/background\/index\.js/.test(info.url || ""),
    );
    if (target) {
      return new URL(target.url).hostname;
    }
    const profileId = profileDir
      ? findExtensionIdFromProfile(profileDir, extensionDir)
      : "";
    if (profileId) return profileId;
    await sleep(150);
  }
  throw new Error("Could not find OmniSignal extension service worker target.");
}

function findExtensionIdFromProfile(profileDir, extensionDir) {
  const preferencesPath = path.join(profileDir, "Default", "Preferences");
  if (!fs.existsSync(preferencesPath)) return "";
  try {
    const preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    const settings = preferences.extensions?.settings || {};
    const expectedPath = normalizePathForCompare(extensionDir);
    const match = Object.entries(settings).find(([, value]) => {
      const extensionPath = normalizePathForCompare(value?.path || "");
      return (
        extensionPath === expectedPath ||
        value?.manifest?.name === "OmniSignal Pixel Console"
      );
    });
    return match?.[0] || "";
  } catch (_e) {
    return "";
  }
}

function normalizePathForCompare(value) {
  return path.resolve(String(value || "")).toLowerCase();
}

export async function openDashboard(cdp, extensionId, viewport = DEFAULT_VIEWPORT) {
  return createPage(
    cdp,
    `chrome-extension://${extensionId}/src/dashboard/index.html`,
    viewport,
  );
}

export async function captureScreenshot(cdp, sessionId, filePath, options = {}) {
  const result = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false, ...options },
    sessionId,
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

export async function createFixtureServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url?.startsWith("/fixture")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fixtureHtml());
      return;
    }
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/fixture`,
    async close() {
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OmniSignal E2E Fixture</title>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){ window.dataLayer.push(arguments); }
      window.gtag = gtag;
      window.dataLayer.push({ event: "gtm.js", "gtm.start": Date.now() });
    </script>
    <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-OMNIQA"></script>
    <script async src="https://connect.facebook.net/en_US/fbevents.js"></script>
    <script async src="https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=C12345ABCDE"></script>
  </head>
  <body>
    <main>
      <h1>OmniSignal fixture checkout</h1>
      <button id="fire-events" type="button">Fire tracking events</button>
    </main>
    <script>
      window.fireOmniSignalFixtureEvents = async function fireOmniSignalFixtureEvents() {
        const page = encodeURIComponent(location.href);
        const trackingPort = location.port;
        const requests = [
          "http://www.facebook.com:" + trackingPort + "/tr/?id=123456789012345&ev=Purchase&eid=e2e-meta-1&dl=" + page + "&cd[value]=199&cd[currency]=USD",
          "http://analytics.tiktok.com:" + trackingPort + "/api/v2/pixel/track?pixel_code=C12345ABCDE&event=Purchase&properties=" + encodeURIComponent(JSON.stringify({ value: 199, currency: "USD" })),
          "http://www.google-analytics.com:" + trackingPort + "/g/collect?v=2&tid=G-TEST1234&cid=555.123&en=purchase&dl=" + page + "&ep.transaction_id=T123&epn.value=199&cu=USD",
          "http://www.googleadservices.com:" + trackingPort + "/pagead/conversion/AW-123456789/?label=purchase_a&value=199&currency_code=USD&url=" + page
        ];
        window.dataLayer.push({
          event: "purchase",
          ecommerce: { transaction_id: "T123", value: 199, currency: "USD" },
          user_email: "qa@example.com"
        });
        gtag("consent", "default", { ad_storage: "denied", analytics_storage: "granted", ad_user_data: "denied", ad_personalization: "denied" });
        gtag("config", "G-TEST1234");
        gtag("event", "conversion", { send_to: "DC-123456/group1/checkout+transactions", value: 199, currency: "USD", transaction_id: "T123" });
        requests.forEach(function(url) {
          fetch(url, { mode: "no-cors", keepalive: true }).catch(function() {});
        });
        return true;
      };
      document.getElementById("fire-events").addEventListener("click", function() {
        window.fireOmniSignalFixtureEvents();
      });
    </script>
  </body>
</html>`;
}

export async function seedDashboardWithFixtureEvents({ cdp, fixtureSessionId, dashboardSessionId }) {
  const targetTabId = await evaluate(
    cdp,
    dashboardSessionId,
    `chrome.tabs.query({}).then(async (tabs) => {
      const target = tabs.find((tab) => /^http:\\/\\/127\\.0\\.0\\.1:\\d+\\/fixture/.test(tab.url || ""));
      if (!target) return null;
      await chrome.tabs.update(target.id, { active: true });
      return target.id;
    })`,
    { awaitPromise: true },
  );
  if (!targetTabId) {
    throw new Error("Could not activate the local E2E fixture tab before starting audit.");
  }
  const startResult = await evaluate(
    cdp,
    dashboardSessionId,
    `chrome.runtime.sendMessage({
      type: "START_AUDIT",
      reload: false,
      targetTabId: ${JSON.stringify(targetTabId)}
    })`,
    { awaitPromise: true },
  );
  if (!startResult?.ok) {
    throw new Error(`Could not start audit for fixture tab: ${startResult?.error || "unknown error"}`);
  }
  await sleep(500);
  await evaluate(cdp, fixtureSessionId, "window.fireOmniSignalFixtureEvents()", {
    awaitPromise: true,
  });
  await waitForExpression(
    cdp,
    dashboardSessionId,
    `import(chrome.runtime.getURL("src/shared/event-repository.js"))
      .then((module) => module.eventRepository.getAllEvents())
      .then((events) => events.length >= 3)`,
    { timeoutMs: 20000 },
  );
  const load = cdp.waitForEvent(
    dashboardSessionId,
    "Page.loadEventFired",
    () => true,
    20000,
  );
  await cdp.send("Page.reload", { ignoreCache: true }, dashboardSessionId);
  await load.catch(() => {});
  await waitForPageReady(cdp, dashboardSessionId);
  await waitForExpression(
    cdp,
    dashboardSessionId,
    "!!globalThis.__OMNI_SIGNAL_DEBUG__?.refreshAndRender",
    { timeoutMs: 10000 },
  );
  await evaluate(
    cdp,
    dashboardSessionId,
    "globalThis.__OMNI_SIGNAL_DEBUG__.refreshAndRender()",
    { awaitPromise: true },
  );
  await waitForExpression(
    cdp,
    dashboardSessionId,
    "Number(document.querySelector('#summary-events')?.textContent || 0) >= 3",
    { timeoutMs: 20000 },
  );
}
