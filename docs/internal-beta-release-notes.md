# OmniSignal Internal Beta Release Notes

## v2.1.0 Internal Agency Beta

- Added a shared tracking catalog as the source of truth for platform metadata,
  endpoint coverage, expectation aliases, audit rules, parser schema, and
  evidence-source labels.
- Added normalized parser output fields: confidence, diagnostics,
  sourceParser, parserSchemaVersion, and evidenceSource.
- Added Hybrid Evidence report labeling so local network, DataLayer, and scanner
  evidence are clearly separated from future account-side diagnostics.
- Added an internal beta packaging command for unpacked Chrome distribution.
- Kept audit data local: captured events stay in IndexedDB, settings and drafts
  stay in `chrome.storage.local`, and temporary active-audit state stays in
  `chrome.storage.session`.

## Known V1 Limitations

- External account diagnostics are not connected. Confirm final server/account
  delivery in Meta, TikTok, Google, Shopify, or other platform tools when needed.
- Local scanner findings are heuristic and should be treated as supporting
  evidence, not final platform delivery proof.
- The internal beta targets Chrome/Chromium Manifest V3 only.
