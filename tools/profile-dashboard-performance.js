import fs from "node:fs";
import path from "node:path";

import {
  click,
  createPage,
  evaluate,
  launchChromeWithExtension,
  openDashboard,
  REPO_ROOT,
  waitForExpression,
  waitForExtensionId,
} from "./lib/chrome-extension-harness.js";

const EVENT_COUNTS = [500, 2000, 5000];
const OUTPUT_PATH = path.join(REPO_ROOT, "dist", "v1-dashboard-performance.json");

const browser = await launchChromeWithExtension({
  viewport: { width: 1280, height: 800 },
});

try {
  const { cdp } = browser;
  const extensionId = await waitForExtensionId(cdp, {
    profileDir: browser.profileDir,
  });
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dashboard = await openDashboard(cdp, extensionId);
  const results = [];

  for (const count of EVENT_COUNTS) {
    await seedEvents(cdp, dashboard.sessionId, extensionId, count);
    const loadStarted = Date.now();
    await cdp.send("Page.navigate", { url: dashboardUrl }, dashboard.sessionId);
    await waitForExpression(
      cdp,
      dashboard.sessionId,
      `Number(document.querySelector("#summary-events")?.textContent || 0) === ${count}`,
      { timeoutMs: 30000 },
    );
    const loadMs = Date.now() - loadStarted;

    const filterMs = await evaluate(
      cdp,
      dashboard.sessionId,
      `new Promise((resolve) => {
        const start = performance.now();
        const input = document.querySelector("#global-search");
        input.value = "Purchase";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
      })`,
      { awaitPromise: true },
    );

    const drawerMs = await evaluate(
      cdp,
      dashboard.sessionId,
      `new Promise((resolve) => {
        const card = document.querySelector(".event-card");
        const start = performance.now();
        card.click();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve(performance.now() - start);
        }));
      })`,
      { awaitPromise: true, userGesture: true },
    );

    const exportMs = await evaluate(
      cdp,
      dashboard.sessionId,
      `new Promise((resolve, reject) => {
        window.__omniSignalPerfDownload = null;
        HTMLAnchorElement.prototype.click = function() {
          window.__omniSignalPerfDownload = this.download;
        };
        const start = performance.now();
        document.querySelector("#download-report-btn").click();
        let attempts = 0;
        const timer = setInterval(() => {
          attempts += 1;
          if (window.__omniSignalPerfDownload) {
            clearInterval(timer);
            resolve(performance.now() - start);
          } else if (attempts > 100) {
            clearInterval(timer);
            reject(new Error("Timed out waiting for report export"));
          }
        }, 50);
      })`,
      { awaitPromise: true, userGesture: true },
    );

    results.push({
      eventCount: count,
      dashboardLoadMs: Math.round(loadMs),
      filterRenderMs: Math.round(filterMs),
      drawerOpenMs: Math.round(drawerMs),
      reportExportMs: Math.round(exportMs),
    });
  }

  const failures = results.flatMap((result) => {
    if (result.eventCount !== 2000) return [];
    const messages = [];
    if (result.filterRenderMs > 1000) {
      messages.push(`2,000-event filter render exceeded 1s (${result.filterRenderMs}ms)`);
    }
    if (result.drawerOpenMs > 1000) {
      messages.push(`2,000-event drawer open exceeded 1s (${result.drawerOpenMs}ms)`);
    }
    return messages;
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
  );

  console.table(results);
  console.log(`Performance evidence written to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);

  if (failures.length > 0) {
    console.error("Dashboard performance sanity check failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
} finally {
  await browser.close();
}

async function seedEvents(cdp, sessionId, extensionId, count) {
  const chunkSize = 500;
  await evaluate(
    cdp,
    sessionId,
    `import("chrome-extension://${extensionId}/src/shared/event-repository.js").then(async ({ eventRepository }) => {
      await eventRepository.clearAll();
      await eventRepository.putAuditRun({
        id: "perf-run",
        tabId: "perf-tab",
        domain: "checkout.example",
        url: "https://checkout.example/order/thank-you",
        startedAt: Date.now() - 60000,
        endedAt: null,
        reloadMode: "none",
        expectedPixels: { Meta: "123456789012345", TikTok: "C12345ABCDE", GA4: "G-TEST1234", "Google Ads": "AW-123456789" },
        expectedEvents: [
          { platform: "Meta", eventName: "Purchase" },
          { platform: "TikTok", eventName: "Purchase" },
          { platform: "GA4", eventName: "purchase" },
          { platform: "Google Ads", eventName: "Conversion (purchase_a)" }
        ]
      });
      return true;
    })`,
    { awaitPromise: true },
  );

  for (let offset = 0; offset < count; offset += chunkSize) {
    const size = Math.min(chunkSize, count - offset);
    await evaluate(
      cdp,
      sessionId,
      `import("chrome-extension://${extensionId}/src/shared/event-repository.js").then(async ({ eventRepository }) => {
        const now = Date.now();
        const platforms = ["Meta", "TikTok", "GA4", "Google Ads"];
        const events = Array.from({ length: ${size} }, (_, index) => {
          const n = ${offset} + index;
          const platform = platforms[n % platforms.length];
          return {
            id: "perf-" + n,
            tabId: "perf-tab",
            platform,
            pixelId: platform === "TikTok" ? "C12345ABCDE" : platform === "GA4" ? "G-TEST1234" : platform === "Google Ads" ? "AW-123456789" : "123456789012345",
            eventName: platform === "GA4" ? "purchase" : platform === "Google Ads" ? "Conversion (purchase_a)" : "Purchase",
            eventData: {
              value: 199,
              currency: "USD",
              event_id: "evt-" + n,
              transaction_id: "T-" + n,
              source_url: "https://checkout.example/order/thank-you"
            },
            url: "https://checkout.example/order/thank-you",
            pixelUrl: "https://tracking.example/collect",
            method: "GET",
            timestamp: now - n,
            status: n % 17 === 0 ? "warning" : "valid",
            isDiagnostic: false,
            issues: [],
            duplicateCount: n % 31 === 0 ? 1 : 0,
            auditRunId: "perf-run",
            source: "network",
            evidenceSource: "local_network",
            parserSchemaVersion: 2,
            confidence: "high",
            sourceParser: "perf-fixture",
            diagnostics: {},
            dedupeKey: "evt-" + n,
            payloadHash: "hash-" + n
          };
        });
        await eventRepository.addEvents(events);
        return true;
      })`,
      { awaitPromise: true },
    );
  }
}
