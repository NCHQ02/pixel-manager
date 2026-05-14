import fs from "node:fs";
import path from "node:path";

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
if (/Publishing Note|replace this section/i.test(privacy)) {
  fail("privacy policy still contains publishing placeholder text");
}

if (failures.length > 0) {
  console.error("Release verification failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Release verification passed.");
