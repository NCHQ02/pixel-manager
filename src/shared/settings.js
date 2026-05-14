export const DEFAULT_SETTINGS = Object.freeze({
  maxEvents: 500,
  sessionWindow: 1800000,
  duplicateWindow: 1500,
  captureNetwork: true,
  captureDataLayer: true,
  captureTagScanner: true,
  captureDiagnostics: true,
  restoreWorkspace: true,
  autoSaveWorkspace: true,
  defaultView: "overview",
  defaultPlatformFilter: "All",
  defaultStatusFilter: "All",
  defaultSessionView: false,
  compactEvents: false,
  autoOpenPayload: false,
  reportIncludeDiagnostics: true,
  reportIncludePayloads: true,
  rawExportScope: "all",
  expectedPixels: {},
  expectedEvents: [],
});

const ALLOWED_VALUES = Object.freeze({
  defaultView: ["overview", "live", "checklist", "issues", "report"],
  defaultPlatformFilter: ["All", "Meta", "TikTok", "Google", "Diagnostics"],
  defaultStatusFilter: [
    "All",
    "valid",
    "warning",
    "missing",
    "duplicate",
    "diagnostic",
  ],
  rawExportScope: ["all", "visible", "selected-tab"],
});

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function coerceNumber(value, fallback, { min, max }) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function coerceAllowedValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeExpectedPixels(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, pixelId]) => String(pixelId || "").trim())
      .map(([platform, pixelId]) => [platform, String(pixelId).trim()]),
  );
}

function normalizeExpectedEvents(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (event) =>
        event &&
        typeof event === "object" &&
        String(event.platform || "").trim() &&
        String(event.eventName || "").trim(),
    )
    .map((event) => ({
      platform: String(event.platform).trim(),
      eventName: String(event.eventName).trim(),
    }));
}

export function normalizeSettings(rawSettings = {}) {
  const raw =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? rawSettings
      : {};

  return {
    maxEvents: coerceNumber(raw.maxEvents, DEFAULT_SETTINGS.maxEvents, {
      min: 50,
      max: 5000,
    }),
    sessionWindow: coerceNumber(raw.sessionWindow, DEFAULT_SETTINGS.sessionWindow, {
      min: 60000,
      max: 7200000,
    }),
    duplicateWindow: coerceNumber(
      raw.duplicateWindow,
      DEFAULT_SETTINGS.duplicateWindow,
      { min: 250, max: 10000 },
    ),
    captureNetwork: coerceBoolean(
      raw.captureNetwork,
      DEFAULT_SETTINGS.captureNetwork,
    ),
    captureDataLayer: coerceBoolean(
      raw.captureDataLayer,
      DEFAULT_SETTINGS.captureDataLayer,
    ),
    captureTagScanner: coerceBoolean(
      raw.captureTagScanner,
      DEFAULT_SETTINGS.captureTagScanner,
    ),
    captureDiagnostics: coerceBoolean(
      raw.captureDiagnostics,
      DEFAULT_SETTINGS.captureDiagnostics,
    ),
    restoreWorkspace: coerceBoolean(
      raw.restoreWorkspace,
      DEFAULT_SETTINGS.restoreWorkspace,
    ),
    autoSaveWorkspace: coerceBoolean(
      raw.autoSaveWorkspace,
      DEFAULT_SETTINGS.autoSaveWorkspace,
    ),
    defaultView: coerceAllowedValue(
      raw.defaultView,
      ALLOWED_VALUES.defaultView,
      DEFAULT_SETTINGS.defaultView,
    ),
    defaultPlatformFilter: coerceAllowedValue(
      raw.defaultPlatformFilter,
      ALLOWED_VALUES.defaultPlatformFilter,
      DEFAULT_SETTINGS.defaultPlatformFilter,
    ),
    defaultStatusFilter: coerceAllowedValue(
      raw.defaultStatusFilter,
      ALLOWED_VALUES.defaultStatusFilter,
      DEFAULT_SETTINGS.defaultStatusFilter,
    ),
    defaultSessionView: coerceBoolean(
      raw.defaultSessionView,
      DEFAULT_SETTINGS.defaultSessionView,
    ),
    compactEvents: coerceBoolean(raw.compactEvents, DEFAULT_SETTINGS.compactEvents),
    autoOpenPayload: coerceBoolean(
      raw.autoOpenPayload,
      DEFAULT_SETTINGS.autoOpenPayload,
    ),
    reportIncludeDiagnostics: coerceBoolean(
      raw.reportIncludeDiagnostics,
      DEFAULT_SETTINGS.reportIncludeDiagnostics,
    ),
    reportIncludePayloads: coerceBoolean(
      raw.reportIncludePayloads,
      DEFAULT_SETTINGS.reportIncludePayloads,
    ),
    rawExportScope: coerceAllowedValue(
      raw.rawExportScope,
      ALLOWED_VALUES.rawExportScope,
      DEFAULT_SETTINGS.rawExportScope,
    ),
    expectedPixels: normalizeExpectedPixels(raw.expectedPixels),
    expectedEvents: normalizeExpectedEvents(raw.expectedEvents),
  };
}

export function mergeSettings(baseSettings, patchSettings) {
  return normalizeSettings({
    ...(baseSettings || {}),
    ...(patchSettings || {}),
  });
}
