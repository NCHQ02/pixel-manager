# OmniSignal Architecture

## Runtime Shape

OmniSignal is a Manifest V3 extension with three runtime areas:

- `src/background/`: Chrome listeners, audit lifecycle, capture pipeline, and
  IndexedDB writes.
- `src/content/`: page bridge and visual overlay. `inject.js` runs in the main
  world; `content.js` relays page events to the extension context.
- `src/dashboard/`: local dashboard UI, selectors, renderers, export controls,
  and settings.

## Data Flow

1. The user clicks Start Audit or Start + Reload.
2. The background session manager creates or resumes an audit run and injects
   content scripts.
3. When an audited tab starts loading, the current tab event canvas is cleared
   and fingerprints are reset.
4. Network requests and DataLayer pushes are parsed, sanitized, deduplicated,
   and written to IndexedDB through `src/shared/event-repository.js`.
5. The background broadcasts `EVENTS_CHANGED`.
6. The dashboard store refreshes events and audit runs from IndexedDB, then
   existing render functions update the UI.

## Ownership Boundaries

- Parser changes belong in `src/background/parsers/` and should emit stable
  `TrackedEvent`-compatible data.
- Capture/session changes belong in `src/background/`; do not write directly to
  `chrome.storage.local` for events.
- Dashboard state selection belongs in `src/dashboard/js/state/`; rendering
  should not mutate IndexedDB directly.
- Shared contracts and storage adapters belong in `src/shared/`.
