import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  captureScreenshot,
  click,
  createFixtureServer,
  createPage,
  evaluate,
  launchChromeWithExtension,
  openDashboard,
  REPO_ROOT,
  seedDashboardWithFixtureEvents,
  waitForExtensionId,
  waitForPageReady,
} from "./lib/chrome-extension-harness.js";

const screenshotsDir = path.join(REPO_ROOT, "docs", "cws-assets", "screenshots");
const promoDir = path.join(REPO_ROOT, "docs", "cws-assets", "promotional");
const iconDir = path.join(REPO_ROOT, "assets");
const logoDataUrl = `data:image/png;base64,${fs
  .readFileSync(path.join(REPO_ROOT, "logo.png"))
  .toString("base64")}`;
let crcTable;

generateAppIcons();

const browser = await launchChromeWithExtension({
  viewport: { width: 1280, height: 800 },
});
const fixture = await createFixtureServer();

try {
  const { cdp } = browser;
  const extensionId = await waitForExtensionId(cdp, {
    profileDir: browser.profileDir,
  });
  const dashboard = await openDashboard(cdp, extensionId, {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const fixturePage = await createPage(cdp, fixture.url);

  await seedDashboardWithFixtureEvents({
    cdp,
    fixtureSessionId: fixturePage.sessionId,
    dashboardSessionId: dashboard.sessionId,
  });

  await captureScreenshot(
    cdp,
    dashboard.sessionId,
    path.join(screenshotsDir, "01-overview.png"),
  );

  await click(cdp, dashboard.sessionId, "#view-live");
  await captureScreenshot(
    cdp,
    dashboard.sessionId,
    path.join(screenshotsDir, "02-live-stream.png"),
  );

  await click(cdp, dashboard.sessionId, "#view-report");
  await captureScreenshot(
    cdp,
    dashboard.sessionId,
    path.join(screenshotsDir, "03-report-workspace.png"),
  );

  await renderAsset(cdp, {
    width: 440,
    height: 280,
    filePath: path.join(promoDir, "small-promo-440x280.png"),
    html: promoHtml({ width: 440, height: 280, compact: true }),
  });
  await renderAsset(cdp, {
    width: 1400,
    height: 560,
    filePath: path.join(promoDir, "marquee-promo-1400x560.png"),
    html: promoHtml({ width: 1400, height: 560 }),
  });

  console.log(`Chrome Web Store assets captured for extension ${extensionId}.`);
} finally {
  await fixture.close();
  await browser.close();
}

async function renderAsset(cdp, { html, width, height, filePath, omitBackground = false }) {
  const page = await createPage(cdp, "about:blank", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send(
    "Page.navigate",
    { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` },
    page.sessionId,
  );
  await waitForPageReady(cdp, page.sessionId);
  await evaluate(
    cdp,
    page.sessionId,
    "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
    { awaitPromise: true },
  );
  await captureScreenshot(cdp, page.sessionId, filePath, { omitBackground });
}

function promoHtml({ width, height, compact = false }) {
  const titleSize = compact ? 32 : 72;
  const bodySize = compact ? 16 : 30;
  const logoSize = compact ? 88 : 190;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        display: grid;
        grid-template-columns: ${compact ? "112px 1fr" : "260px 1fr"};
        align-items: center;
        gap: ${compact ? "22px" : "56px"};
        padding: ${compact ? "32px" : "64px 82px"};
        color: #111827;
        font-family: Inter, Arial, sans-serif;
        background:
          linear-gradient(135deg, #ffffff 0%, #f7f4ea 42%, #dff4f0 100%);
      }
      .mark {
        width: ${logoSize}px;
        height: ${logoSize}px;
        border-radius: ${compact ? "22px" : "42px"};
        display: grid;
        place-items: center;
        background: #ffffff;
        box-shadow: 0 24px 60px rgba(17, 24, 39, 0.18);
      }
      img { width: 76%; height: 76%; object-fit: contain; }
      h1 {
        margin: 0 0 ${compact ? "10px" : "20px"};
        font-size: ${titleSize}px;
        line-height: 0.98;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        max-width: ${compact ? "260px" : "900px"};
        font-size: ${bodySize}px;
        line-height: 1.25;
        color: #374151;
      }
      strong { color: #0f766e; }
    </style>
  </head>
  <body>
    <div class="mark"><img alt="" src="${logoDataUrl}" /></div>
    <main>
      <h1>OmniSignal Pixel Tracker</h1>
      <p>Audit <strong>Meta, TikTok, GA4, Google Ads, and Floodlight</strong> events from your browser.</p>
    </main>
  </body>
</html>`;
}

function generateAppIcons() {
  fs.mkdirSync(iconDir, { recursive: true });
  for (const size of [16, 48, 128]) {
    fs.writeFileSync(path.join(iconDir, `app-icon-${size}.png`), drawIconPng(size));
  }
}

function drawIconPng(size) {
  return encodePng(size, size, (x, y) => {
    const nx = (x + 0.5) / size;
    const ny = (y + 0.5) / size;
    const radius = 0.22;
    const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - radius), 0);
    const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - radius), 0);
    if (Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];

    const centerDistance = Math.hypot(nx - 0.48, ny - 0.5);
    const ring = centerDistance > 0.19 && centerDistance < 0.34;
    const dot = Math.hypot(nx - 0.7, ny - 0.3) < 0.09;
    const spark = nx > 0.59 && nx < 0.75 && Math.abs(ny - (0.76 - nx * 0.58)) < 0.035;
    if (ring || dot || spark) return [255, 255, 255, 255];
    if (centerDistance < 0.11) return [248, 214, 109, 255];
    return [15, 118, 110, 255];
  });
}

function encodePng(width, height, pixelAt) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buffer) {
  crcTable ||= buildCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  return new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}
