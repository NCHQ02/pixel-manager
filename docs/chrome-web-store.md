# Chrome Web Store Launch Assets

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
platform domains rather than every URL.

## Screenshot Checklist

- Empty dashboard with activation guidance.
- Live stream showing Meta, TikTok, GA4, and Google Ads events.
- Expanded event details with raw payload and copy controls.
- Warning example for missing purchase `value` or `currency`.
- Export controls and settings modal.

## Pre-Submission Checklist

- Confirm `docs/privacy-policy.md` has final publisher contact details.
- Replace current remote font/icon references with packaged local assets before
  public submission.
- Run `npm.cmd test`.
- Load unpacked extension in Chrome and test one live site.
- Capture fresh screenshots after the final UI pass.
