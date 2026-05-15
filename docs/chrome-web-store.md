# Chrome Web Store Launch Assets

Source of truth for image sizing: Chrome's Chrome Web Store image guidance.
Public V1 ships with a 128x128 extension icon, a required 440x280 small
promotional image, an optional 1400x560 marquee image, and 1280x800 screenshots.

## Listing Name

OmniSignal Pixel Tracker

## Short Description

Audit Meta, TikTok, GA4, Google Ads, Floodlight, and GTM tracking events in real
time from your browser.

## Long Description

OmniSignal Pixel Tracker helps marketers, agencies, and growth engineers verify
browser-side tracking before ads go live.

Use it to inspect pixel events, DataLayer pushes, request payloads, expected
event checklists, duplicate firing warnings, missing purchase parameters, and
local audit reports. Captured data stays in the user's browser by default and
likely plaintext sensitive values are redacted before local storage.

Core workflows:

- Confirm that expected events are firing.
- Check pixel IDs, event names, page URLs, and raw payloads.
- Spot duplicate firing and missing required conversion fields.
- Export HTML, JSON, or CSV for QA notes and client handoff.

## Permission Explanation

OmniSignal asks for permissions needed to activate auditing on a selected tab,
inspect supported marketing tracking requests, store audit results locally, and
render the dashboard. Host permissions are limited to supported tracking
platform domains rather than every URL. The `*.google.com/*` host permission is
kept because Google Ads conversion hits can use `www.google.com/pagead/conversion`
endpoints.

## Screenshot Checklist

- `docs/cws-assets/screenshots/01-overview.png`: Overview with an active audit,
  tracking health, guided QA, and summary tiles.
- `docs/cws-assets/screenshots/02-live-stream.png`: Live Stream showing captured
  DataLayer/network tracking evidence.
- `docs/cws-assets/screenshots/03-report-workspace.png`: Report workspace with
  preview/export controls.

## Promotional Images

- `docs/cws-assets/promotional/small-promo-440x280.png`
- `docs/cws-assets/promotional/marquee-promo-1400x560.png`

## Extension Icons

- `assets/app-icon-16.png`
- `assets/app-icon-48.png`
- `assets/app-icon-128.png`

Regenerate all image assets with `npm run assets:cws`.

## Pre-Submission Checklist

- Confirm the public Chrome Web Store publisher account has the final support
  contact configured.
- Confirm dashboard fonts and platform icons are packaged in local assets and
  the extension source contains no remote font, icon, script, or style URLs.
- Run `npm.cmd test`.
- Run `npm.cmd run test:e2e`.
- Run `npm.cmd run assets:cws`.
- Run `npm.cmd run package:cws`.
- Run `npm.cmd run verify`.
- Run `npm.cmd run perf:dashboard`.
- Load unpacked extension in Chrome and test one live site.
