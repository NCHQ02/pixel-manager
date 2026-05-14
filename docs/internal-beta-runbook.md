# OmniSignal Internal Beta Runbook

## Distribution

Use the unpacked beta package for internal agency users.

```powershell
npm.cmd run package:internal
```

Send the generated `dist/internal-beta/omnisignal-pixel-tracker-vX.Y.Z` folder to
the pilot team. Do not remove `src`, `manifest.json`, `logo.png`, or the docs
included in that folder.

## Pilot Team

Start with 5-10 internal users:

- Tracking specialist or GTM owner.
- Performance media buyer.
- Developer who can inspect checkout and tag-manager changes.

## QA Workflow

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked and select the versioned beta folder.
4. Open the target website in Chrome.
5. Click the OmniSignal extension icon.
6. Use Start Audit for a current-page check or Start + Reload for page-load tags.
7. Trigger the agreed funnel step: page view, view content, add-to-cart, lead,
   checkout, purchase, or conversion.
8. Review Live Stream, Audit Checklist, Issues, and Report.
9. Export HTML for client or internal handoff.

## Source Of Truth Rule

For this V1 internal beta, local browser evidence is the agency QA source of
truth:

- `local_network`: captured pixel requests.
- `local_datalayer`: GTM/DataLayer commands.
- `local_scanner`: heuristic DOM, tag, consent, and cookie evidence.
- `external_account`: reserved for future account-side API diagnostics and
  marked as not connected.

A pass means expected local browser signals are observed, required parameters
are present, duplicate firing has been reviewed, privacy redactions are
understood, and scanner/account limitations are visible in the report.

## Pre-Release Checks

Run these before packaging a beta build:

```powershell
npm.cmd test
npm.cmd run verify
```

Then load the unpacked package in Chrome and confirm Start Audit, Start +
Reload, tab reload clearing, HTML/JSON/CSV export, and sensitive-data redaction.
