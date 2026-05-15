import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  click,
  createFixtureServer,
  createPage,
  evaluate,
  launchChromeWithExtension,
  openDashboard,
  seedDashboardWithFixtureEvents,
  sleep,
  waitForExpression,
  waitForExtensionId,
} from "../tools/lib/chrome-extension-harness.js";

const logPath = path.resolve("dist", "tmp", "e2e-smoke-last.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, "");

function log(message) {
  console.log(message);
  fs.appendFileSync(logPath, `${message}\n`);
}

let browser;
let fixture;

try {
  log("Launching Chromium with OmniSignal...");
  browser = await launchChromeWithExtension();
  fixture = await createFixtureServer();
  const { cdp } = browser;
  log("Waiting for extension id...");
  const extensionId = await waitForExtensionId(cdp, {
    profileDir: browser.profileDir,
    timeoutMs: 60000,
  });
  log(`Extension loaded: ${extensionId}`);
  const dashboard = await openDashboard(cdp, extensionId);
  const fixturePage = await createPage(cdp, fixture.url);
  log("Starting audit and firing fixture events...");

  await seedDashboardWithFixtureEvents({
    cdp,
    fixtureSessionId: fixturePage.sessionId,
    dashboardSessionId: dashboard.sessionId,
  });

  const eventSummary = await evaluate(
    cdp,
    dashboard.sessionId,
    `(() => ({
      eventCount: Number(document.querySelector("#summary-events")?.textContent || 0),
      cards: [...document.querySelectorAll(".event-card")].map((card) => card.textContent),
      health: document.querySelector("#health-score-value")?.textContent || ""
    }))()`,
  );
  log(`Dashboard rendered ${eventSummary.eventCount} events.`);

  assert.ok(eventSummary.eventCount >= 3, "dashboard should render captured events");
  assert.ok(
    eventSummary.cards.some((text) => /DataLayer|GA4|Google Ads|Meta|TikTok/.test(text)),
    "dashboard should show real platform evidence",
  );
  assert.match(eventSummary.health, /\d+%/);

  await click(cdp, dashboard.sessionId, "#view-live");
  await waitForExpression(
    cdp,
    dashboard.sessionId,
    "document.querySelector('#live-view-pane')?.classList.contains('active') && document.querySelectorAll('.event-card').length > 0",
  );

  await evaluate(
    cdp,
    dashboard.sessionId,
    `(() => {
      window.__omniSignalLastDownload = null;
      HTMLAnchorElement.prototype.click = function() {
        window.__omniSignalLastDownload = {
          download: this.download,
          href: this.href,
        };
      };
      return true;
    })()`,
  );
  await click(cdp, dashboard.sessionId, "#export-json-btn");
  const download = await waitForExpression(
    cdp,
    dashboard.sessionId,
    "window.__omniSignalLastDownload && window.__omniSignalLastDownload.download",
  );
  assert.match(download, /\.json$/);

  log(
    `E2E smoke passed: extension=${extensionId}, captured=${eventSummary.eventCount}`,
  );
} catch (err) {
  console.error(err);
  fs.appendFileSync(logPath, `${err.stack || err}\n`);
  if (browser?.logs?.length) {
    console.error("Chrome logs:");
    console.error(browser.logs.join(""));
    fs.appendFileSync(logPath, `Chrome logs:\n${browser.logs.join("")}\n`);
  }
  process.exitCode = 1;
} finally {
  await fixture?.close();
  if (browser) {
    await Promise.race([browser.close(), sleep(5000)]);
  }
}

process.exit(process.exitCode || 0);
