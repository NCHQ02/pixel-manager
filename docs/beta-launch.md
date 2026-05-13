# Private Beta Launch Plan

## Audience

Start with 10-20 users who already feel tracking pain:

- Performance marketing agencies running Meta, TikTok, or Google Ads.
- Tracking specialists responsible for GTM, GA4, and conversion QA.
- Founders or growth marketers setting up Shopify, WooCommerce, or custom
  checkout tracking.

## Install Flow

1. Send the extension folder as a private beta build.
2. Ask testers to open `chrome://extensions`.
3. Turn on Developer Mode.
4. Click Load unpacked and select the `extension` folder.
5. Open a target site, click the OmniSignal extension icon, then use Start
   Audit or Start + Reload from the dashboard.
6. Trigger a test flow such as page view, add-to-cart, lead, or purchase.
7. Review Live Stream, Audit Checklist, Issues, and Report.

Target: a new tester should complete setup in under 3 minutes.

## Data Handling During Beta

Captured audit events are stored locally in the browser extension's IndexedDB
database. Settings and draft checklist preferences stay in `chrome.storage.local`.
OmniSignal does not send captured audit data to a backend service during private
beta. Users can export local data as HTML, JSON, or CSV and can clear captured
events from the dashboard.

## Success Criteria

- Tester can install and activate the extension without live support.
- Tester can audit at least one real website.
- Dashboard remains stable during a 30 minute audit session.
- Refreshing or loading a new page in an audited tab starts a clean event
  canvas so the dashboard stays focused on the current page/session.
- Tester can immediately identify valid events, warnings, diagnostics, and
  missing required parameters.
- Exported HTML, JSON, or CSV contains enough context to share with a teammate.

## Feedback Questions

Ask every beta tester these four questions:

1. Did OmniSignal capture the events you expected?
2. Was the dashboard easy to read while events were firing?
3. Were the warnings useful and accurate?
4. Which platform, event type, or audit rule was missing?

## Beta Exit Bar

Move from private beta to public listing only after at least 8 testers complete
one real audit and no blocker remains in privacy, capture accuracy, or dashboard
stability.
