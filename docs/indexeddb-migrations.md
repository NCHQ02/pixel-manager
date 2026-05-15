# IndexedDB Migration Policy

OmniSignal stores captured events in `omnisignal-audit-db`. Public V1 ships with
`DB_VERSION = 1`, `events`, and `auditRuns`.

## Rules

- Never change the stored shape in a way that breaks existing records without
  incrementing `DB_VERSION`.
- Every `DB_VERSION` increment must add an `onupgradeneeded` branch that keeps
  old `events` and `auditRuns` readable.
- Migrations must be additive when possible: add stores, add indexes, or fill
  defaults at read time.
- Destructive migrations require a user-visible release note and an explicit
  test that proves old data is handled intentionally.
- Keep `migrateLegacyStorage()` for the Chrome storage to IndexedDB migration;
  do not reuse that marker for IndexedDB schema upgrades.

## Release Gate

Before any public release candidate:

- Run `npm test`.
- Confirm `tests/indexeddb-upgrade.test.js` passes.
- If `DB_VERSION` changed, add a seeded old-version test before shipping.
