# OmniSignal Privacy Policy

Last updated: 2026-05-13

OmniSignal Pixel Tracker is a local browser extension for auditing marketing
tracking events from Meta, TikTok, GA4, Google Ads, Floodlight, and GTM
DataLayer activity.

## What The Extension Collects

When activated on a browser tab, OmniSignal can inspect matching tracking
requests and DataLayer pushes for that tab. Captured records can include event
names, pixel IDs, request URLs, page URLs, request methods, timestamps, and
event payload parameters.

## Where Data Is Stored

Captured audit events and audit runs are stored only in the extension's local
IndexedDB database on the user's browser. Settings and draft checklist
preferences are stored in `chrome.storage.local`. OmniSignal does not include a
backend service, does not transmit audit data to the developer, and does not
sell or share captured data.

Temporary audit activation state is stored in `chrome.storage.session` so the
extension can continue an active audit if the extension service worker restarts.

## Sensitive Data Handling

OmniSignal redacts likely plaintext sensitive values, such as email addresses
and phone numbers, before storing event payloads locally. Hashed values that
look like SHA-256 strings are preserved because they are commonly used by
advertising platforms for advanced matching audits.

## Permissions

OmniSignal uses tab activation, scripting, storage, tabs, web request, and
limited host permissions for known tracking domains. These permissions are used
to activate auditing on the user's selected tab, inspect supported pixel
requests, show results in the dashboard, and keep audit history local.

## User Controls

Users can clear captured audit data from the dashboard at any time. Users can
also export local audit data as HTML, JSON, or CSV for their own analysis.

## Private Beta Support

Private beta users receive support through the contact channel included in their
beta invitation. A public Chrome Web Store submission should use the same public
developer account and support contact in the store listing and this policy.
