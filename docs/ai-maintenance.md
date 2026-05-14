# AI Maintenance Guide

## Safe Change Rules

- Preserve dashboard element IDs, CSS class names, and visible workflow labels
  unless a visual regression pass is part of the change.
- Preserve the current dashboard visual layer, including local packaged fonts
  and platform icons, unless a dedicated UI parity pass replaces them.
- Keep parser functions pure: input is URL/request details, output is parsed
  `ParsedSignal` data or `null`.
- Treat `src/shared/tracking-catalog.js` as the source of truth for platforms,
  event aliases, endpoint patterns, audit rules, UI metadata, evidence-source
  labels, and parser schema version.
- Keep parser output normalized through `src/background/parser-harness.js`
  before converting it into stored `TrackedEvent` records.
- Store captured events only through `event-repository.js`; do not reintroduce
  `trackedEvents` writes in `chrome.storage.local`.
- Keep privacy redaction before persistence. Raw payloads should be sanitized
  before they reach IndexedDB.
- Treat page load/reload in an audited tab as a fresh debugger canvas: clear
  that tab's captured events and fingerprints on `loading`, then reinject on
  `complete`.

## Before Shipping

- Run `npm.cmd test`.
- Run `npm.cmd run verify`.
- For an internal agency beta package, run `npm.cmd run package:internal`.
- Load the unpacked extension and confirm refresh/page load starts a clean
  event canvas.
- Export HTML, JSON, and CSV from the dashboard after closing the audited tab.
