import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

const version = manifest.version || packageJson.version || "0.0.0";
const outputRoot = path.join(root, "dist", "internal-beta");
const outputDir = path.join(outputRoot, `omnisignal-pixel-tracker-v${version}`);

const entries = [
  "manifest.json",
  "logo.png",
  "assets",
  "src",
  "docs/privacy-policy.md",
  "docs/internal-beta-runbook.md",
  "docs/internal-beta-release-notes.md",
];

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

entries.forEach((relativePath) => {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing package entry: ${relativePath}`);
  }
  const target = path.join(outputDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
});

fs.writeFileSync(
  path.join(outputDir, "README-INTERNAL-BETA.txt"),
  [
    `OmniSignal Pixel Tracker v${version}`,
    "",
    "Install:",
    "1. Open chrome://extensions.",
    "2. Enable Developer Mode.",
    "3. Click Load unpacked.",
    "4. Select this versioned folder.",
    "",
    "Run docs/internal-beta-runbook.md for the agency QA workflow.",
  ].join("\n"),
);

console.log(`Internal beta package created: ${outputDir}`);
