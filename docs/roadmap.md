# Product Roadmap

## Commercial V1 Local Audit Tool

- Realtime event stream for Meta, TikTok, GA4, Google Ads, Floodlight, and
  DataLayer.
- Platform filters, search, sorting, session grouping, and tab scoping.
- Audit status labels: valid, warning, diagnostic, duplicate, and missing
  parameters.
- Persistent local audit sessions with Start Audit and Start + Reload flows.
- Media QA checklist for expected platform events and expected pixel IDs.
- Specialist presets for Meta browser+CAPI dedupe, TikTok Pixel/Events API,
  GA4 ecommerce, Google Ads conversion, Floodlight, Shopify, WooCommerce, and
  generic GTM launch QA.
- Central `AuditIssue` model with installation, event quality, required
  parameters, deduplication, consent, Google tag health, privacy, duplicate
  firing, and parser confidence categories.
- Local DOM/tag scanner for installed tags, globals, GTM containers, script
  placement, Google config/consent order, and visible linker cookie evidence.
- Issues view for duplicate firing, missing parameters, consent/tag health,
  parser confidence, installation gaps, and privacy redactions.
- HTML audit report export with issue summary, evidence snippets, fix steps,
  platform coverage, dedupe readiness, consent/tag health, and raw payload
  appendix toggles.
- JSON and CSV export.
- Local-only IndexedDB event storage with plaintext sensitive value redaction.
- Batched event writes, throttled dashboard refresh, bounded live rendering, and
  per-tab retention controls for long local sessions.
- Parser schema metadata in stored events and reports.

## Deferred Beyond Local Commercial V1

- Saved audit report library.
- Branded PDF or shareable report export.
- Account-side diagnostics through Meta, TikTok, Google, or Shopify APIs.
- Add opt-in cloud sync only after privacy review and user-facing consent.
