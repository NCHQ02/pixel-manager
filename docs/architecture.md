# OmniSignal Architecture

## Runtime Shape

OmniSignal is a Manifest V3 extension with three runtime areas:

- `src/background/`: Chrome listeners, audit lifecycle, capture pipeline, and
  IndexedDB writes.
- `src/content/`: page bridge and visual overlay. `inject.js` runs in the main
  world; `content.js` relays page events to the extension context.
- `src/dashboard/`: local dashboard UI, selectors, renderers, export controls,
  and settings.

## Data Flow

1. The user clicks Start Audit or Start + Reload.
2. The background session manager creates or resumes an audit run and injects
   content scripts.
3. When an audited tab starts loading, the current tab event canvas is cleared
   and fingerprints are reset.
4. Network requests, DataLayer pushes, and DOM tag scanner snapshots are parsed,
   sanitized, deduplicated, and written to IndexedDB through
   `src/shared/event-repository.js`.
5. The background broadcasts `EVENTS_CHANGED`.
6. The dashboard store refreshes events and audit runs from IndexedDB, then
   existing render functions update the UI.

## Commercial V1 Diagnostics

- `src/dashboard/js/audit.js` owns the central `AuditIssue` shape used by the
  dashboard, event drawer, and HTML report. Every issue carries severity,
  category, platform, event name, pixel ID, evidence, suggestion, source, and
  event ID when available.
- Issue categories are installation, event quality, required parameters,
  deduplication, consent, Google tag health, privacy, duplicate firing, and
  parser confidence.
- `src/content/inject.js` performs local-only DOM/tag scanning for social pixel
  globals, Google tags, GTM containers, script placement, DataLayer command
  order, consent command evidence, and visible `_gcl_*` cookies. `content.js`
  relays scanner snapshots with `TAG_SCAN_RESULT`.
- Scanner snapshots are stored as diagnostic `TrackedEvent` records with
  `source: "scanner"` and are included in audit/report models even when normal
  diagnostic events are hidden from the live stream.
- `src/shared/tracking-catalog.js` is the source of truth for platform metadata,
  endpoint coverage, expectation aliases, audit rules, parser schema, and
  Hybrid Evidence labels.
- Parser output includes `parserSchemaVersion`, `sourceParser`, `confidence`,
  `diagnostics`, and `evidenceSource` so fixtures and reports can identify
  which local parsing contract produced the evidence.
- V1 reports use Hybrid Evidence: local network, local DataLayer, and local
  scanner evidence are the agency QA source of truth; external account
  diagnostics are reserved for future API integrations and shown as not
  connected.

## Scale Notes

- Network and DataLayer capture write in batches through `addEvents`.
- Dashboard store refreshes are throttled with `requestAnimationFrame`.
- The live event stream renders a bounded window while exports and reports still
  use the retained event set.
- Retention remains local and bounded by the per-tab max event setting.

## Ownership Boundaries

- Parser changes belong in `src/background/parsers/` and should emit stable
  `ParsedSignal` data validated through `src/background/parser-harness.js`.
- Platform, event alias, audit rule, UI metadata, parser schema, and evidence
  label changes belong in `src/shared/tracking-catalog.js`.
- Capture/session changes belong in `src/background/`; do not write directly to
  `chrome.storage.local` for events.
- Dashboard state selection belongs in `src/dashboard/js/state/`; rendering
  should not mutate IndexedDB directly.
- Shared contracts and storage adapters belong in `src/shared/`.
