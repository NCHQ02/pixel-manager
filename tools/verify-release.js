import fs from "node:fs";
import path from "node:path";
import { HOST_PERMISSIONS } from "../src/shared/tracking-catalog.js";

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const failures = [];

function fail(message) {
  failures.push(message);
}

function assertPathExists(relativePath, context) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`${context} references missing path: ${relativePath}`);
  }
}

function readPngDimensions(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`${relativePath} must be a PNG file`);
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function assertPngDimensions(relativePath, width, height, context) {
  assertPathExists(relativePath, context);
  const dimensions = readPngDimensions(relativePath);
  if (!dimensions) return;
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(
      `${context} must be ${width}x${height}px: ${relativePath} is ${dimensions.width}x${dimensions.height}px`,
    );
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (manifest.background?.service_worker) {
  assertPathExists(manifest.background.service_worker, "background.service_worker");
}
if (manifest.action?.default_icon) {
  assertPathExists(manifest.action.default_icon, "action.default_icon");
}
Object.values(manifest.icons || {}).forEach((icon) => {
  assertPathExists(icon, "icons");
});

if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version || "")) {
  fail("manifest.version must use Chrome's numeric dotted version format");
}

assertPngDimensions("assets/app-icon-16.png", 16, 16, "Chrome Web Store icon");
assertPngDimensions("assets/app-icon-48.png", 48, 48, "Chrome Web Store icon");
assertPngDimensions("assets/app-icon-128.png", 128, 128, "Chrome Web Store icon");

[
  "docs/cws-assets/screenshots/01-overview.png",
  "docs/cws-assets/screenshots/02-live-stream.png",
  "docs/cws-assets/screenshots/03-report-workspace.png",
].forEach((asset) =>
  assertPngDimensions(asset, 1280, 800, "Chrome Web Store screenshot"),
);
assertPngDimensions(
  "docs/cws-assets/promotional/small-promo-440x280.png",
  440,
  280,
  "Chrome Web Store small promotional tile",
);
assertPngDimensions(
  "docs/cws-assets/promotional/marquee-promo-1400x560.png",
  1400,
  560,
  "Chrome Web Store marquee promotional tile",
);

const manifestHosts = manifest.host_permissions || [];
if (JSON.stringify(manifestHosts) !== JSON.stringify(HOST_PERMISSIONS)) {
  fail("manifest host_permissions must match the shared tracking catalog");
}

if (manifest.web_accessible_resources?.length > 0) {
  fail("manifest should not expose web_accessible_resources for private beta build");
}

const sourceFiles = walk(path.join(root, "src")).filter((file) =>
  /\.(js|css|html|json|svg)$/.test(file),
);
const remoteUrlPattern = /https?:\/\//i;
sourceFiles.forEach((file) => {
  const content = fs
    .readFileSync(file, "utf8")
    .replaceAll("http://www.w3.org/2000/svg", "")
    .replaceAll("http://www.w3.org/1999/xlink", "");
  const urls = content.match(/https?:\/\/[^"'()\s]+/gi) || [];
  if (remoteUrlPattern.test(content) && urls.length > 0) {
    fail(
      `remote URL found in extension source: ${path.relative(root, file)} (${urls.join(", ")})`,
    );
  }
});

const privacy = fs.readFileSync(
  path.join(root, "docs", "privacy-policy.md"),
  "utf8",
);
if (/Publishing Note|replace this section|Private Beta Support|public Chrome Web Store submission should/i.test(privacy)) {
  fail("privacy policy still contains publishing placeholder text");
}

const cwsListing = fs.readFileSync(
  path.join(root, "docs", "chrome-web-store.md"),
  "utf8",
);
if (/TODO|TBD|replace this|placeholder/i.test(cwsListing)) {
  fail("Chrome Web Store listing doc still contains placeholder text");
}

if (failures.length > 0) {
  console.error("Release verification failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Release verification passed.");
