# Product Roadmap

## Free V1

- Realtime event stream for Meta, TikTok, GA4, Google Ads, Floodlight, and
  DataLayer.
- Platform filters, search, sorting, session grouping, and tab scoping.
- Audit status labels: valid, warning, diagnostic, duplicate, and missing
  parameters.
- Persistent local audit sessions with Start Audit and Start + Reload flows.
- Media QA checklist for expected platform events and expected pixel IDs.
- Issues view for duplicate firing, missing parameters, and privacy redactions.
- HTML audit report export for client or developer handoff.
- JSON and CSV export.
- Local-only IndexedDB event storage with plaintext sensitive value redaction.

## Pro V2

- Saved audit reports.
- Expected-vs-actual event checklists.
- Rule presets for Shopify, WooCommerce, GTM, Meta browser/CAPI matching, and
  common paid media launch QA.
- Branded PDF or shareable report export.
- Team workspace only after explicit cloud sync consent.

## Scale Work Before Paid Launch

- Add retention controls and a bounded ring buffer for long audit histories.
- Batch IndexedDB writes and dashboard updates during high-traffic event bursts.
- Virtualize the event table for long sessions.
- Version parser output schemas and migration behavior.
- Add opt-in cloud sync only after privacy review and user-facing consent.
