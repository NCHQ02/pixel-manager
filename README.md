# OmniSignal Pixel Tracker

OmniSignal is a local Chrome extension for auditing Meta, TikTok, GA4, Google Ads, Floodlight, and GTM DataLayer events in real time.

## Beta Usage

1. Open `chrome://extensions`.
2. Turn on Developer Mode.
3. Click Load unpacked and select this `extension` folder.
4. Open the target website.
5. Click the OmniSignal extension icon to open the dashboard.
6. Use Start Audit or Start + Reload.
7. Trigger a page view, add-to-cart, lead, or purchase flow.
8. Inspect Live Stream, Audit Checklist, Issues, and Report.

## Privacy Model

Captured audit events stay in local IndexedDB by default. Settings and checklist drafts stay in `chrome.storage.local`. The extension has no backend service in v1 and redacts likely plaintext sensitive values before local storage.

## Development

Run parser and audit fixtures:

```powershell
npm.cmd test
```

Launch docs live in `docs/`.
