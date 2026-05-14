# OmniSignal Pixel Tracker

OmniSignal is a local Chrome extension for auditing Meta, TikTok, GA4, Google Ads, Floodlight, and GTM DataLayer events in real time. Commercial V1 is focused on tracking specialists who need local evidence, issue categories, workflow presets, and polished HTML reports without account API access or a backend.

## Usage

1. Open `chrome://extensions`.
2. Turn on Developer Mode.
3. Click Load unpacked and select this `extension` folder.
4. Open the target website.
5. Click the OmniSignal extension icon to open the dashboard.
6. Use Start Audit or Start + Reload.
7. Trigger a page view, add-to-cart, lead, or purchase flow.
8. Inspect Live Stream, Audit Checklist, Issues, and Report.

## Commercial V1 Diagnostics

- Central `AuditIssue` output for dashboard and HTML reports: severity, category, platform, event, pixel ID, evidence, fix suggestion, source, and event ID.
- Local DOM tag scanner for `fbq`, `ttq`, `gtag`, GTM containers, relevant script placement, Google consent/config order, and locally visible linker cookies.
- Specialist presets for Meta browser+CAPI dedupe, TikTok Pixel/Events API, GA4 ecommerce, Google Ads conversion, Floodlight, Shopify, WooCommerce, and GTM launch QA.
- HTML report sections for issue summary, evidence snippets, dedupe readiness, consent/tag health, platform coverage, and raw payload appendix toggles.

## Privacy Model

Captured audit events stay in local IndexedDB by default. Settings and checklist drafts stay in `chrome.storage.local`. The extension has no backend service in v1 and redacts likely plaintext sensitive values before local storage.

Reports use a Hybrid Evidence model. Local network, DataLayer, and scanner
evidence are treated as the internal agency QA source of truth; external
account-side diagnostics are reserved for future integrations and shown as not
connected in v1.

## Development

Run parser and audit fixtures:

```powershell
npm.cmd test
npm.cmd run verify
npm.cmd run package:internal
```

Launch docs live in `docs/`.
