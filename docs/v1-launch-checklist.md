# V1 Public Chrome Web Store Launch Checklist

This checklist is the launch gate for public Chrome Web Store V1. Private beta
items are useful evidence, but public release requires every P0 item below to
pass.

## P0 Release Gates

- [ ] Unit and workflow tests pass: `npm test`.
- [ ] Chrome extension E2E smoke passes: `npm run test:e2e`.
- [ ] Chrome Web Store assets are current: `npm run assets:cws`.
- [ ] Public release package builds: `npm run package:cws`.
- [ ] Release verification passes: `npm run verify`.
- [ ] Dashboard performance sanity passes: `npm run perf:dashboard`.
- [ ] Manual Chrome smoke is complete on a real site:
  - Start Audit.
  - Start + Reload.
  - Live Stream.
  - Checklist.
  - Issues.
  - Report preview.
  - HTML, JSON, and CSV export.
  - Clear Canvas.
  - Settings save/reset.
- [ ] Chrome Web Store dashboard fields are final:
  - Listing name and descriptions match `docs/chrome-web-store.md`.
  - Privacy practices match `docs/privacy-policy.md`.
  - Support contact is set in the publisher account.
  - Visibility, category, and test instructions are complete.

## Automated Evidence

- `npm test` includes parser/catalog/audit/repository/session coverage plus the
  IndexedDB V1 readability guard.
- `npm run test:e2e` loads the unpacked extension in Chrome, starts an audit on
  a controlled fixture page, fires network and DataLayer tracking signals, checks
  the dashboard, and verifies JSON export wiring. The harness uses a temporary
  extension copy with localhost-only host permissions for the fixture; the public
  manifest remains limited to tracking domains.
- `npm run assets:cws` captures real extension screenshots and generates the
  required store icon and promotional image files.
- `npm run verify` validates manifest references, host permissions, remote URL
  policy, privacy/listing placeholders, and required Chrome Web Store PNG sizes.
- `npm run perf:dashboard` seeds 500, 2,000, and 5,000 event sessions in Chrome
  and writes timing evidence to `dist/v1-dashboard-performance.json`.
- `npm run release:candidate` runs the automated candidate chain:
  `test -> test:e2e -> package:cws -> verify`.

## Required Asset Files

- `assets/app-icon-16.png`
- `assets/app-icon-48.png`
- `assets/app-icon-128.png`
- `docs/cws-assets/screenshots/01-overview.png`
- `docs/cws-assets/screenshots/02-live-stream.png`
- `docs/cws-assets/screenshots/03-report-workspace.png`
- `docs/cws-assets/promotional/small-promo-440x280.png`
- `docs/cws-assets/promotional/marquee-promo-1400x560.png`

These sizes follow the Chrome Web Store image guidance: 128x128 extension icon,
440x280 small promotional image, optional 1400x560 marquee image, and 1280x800
screenshots.

## P1 Hardening After P0 Is Green

- Decompose `src/dashboard/js/audit.js` into audit/readiness/report modules
  without changing exports.
- Add local-only structured diagnostics for extension/dashboard errors.
- Reduce unnecessary full IndexedDB refreshes during live capture.
- Add lightweight `@ts-check` or no-emit type checks while keeping vanilla ESM
  for V1.

## P2 Post-Launch

- Consider Preact or a small component layer after E2E coverage is stable.
- Dark mode.
- Keyboard shortcuts.
- Saved report library or PDF/shareable reports.
- Opt-in remote telemetry only after privacy review and explicit consent UX.
