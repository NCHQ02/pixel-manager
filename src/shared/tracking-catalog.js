/**
 * Central tracking catalog for OmniSignal.
 *
 * This module is the source of truth for supported platforms, parser schema,
 * audit rules, expectation aliases, UI metadata, and evidence-source labels.
 * Keep it dependency-free so background, dashboard, tests, and release tooling
 * can all import the same definitions.
 */

export const PARSER_SCHEMA_VERSION = 2;

export const EVIDENCE_SOURCES = Object.freeze({
  LOCAL_NETWORK: "local_network",
  LOCAL_DATALAYER: "local_datalayer",
  LOCAL_SCANNER: "local_scanner",
  EXTERNAL_ACCOUNT: "external_account",
});

export const EVIDENCE_SOURCE_META = Object.freeze({
  [EVIDENCE_SOURCES.LOCAL_NETWORK]: {
    label: "Local Network",
    status: "observed",
    source: "network",
    description: "Captured browser pixel requests from the audited tab.",
  },
  [EVIDENCE_SOURCES.LOCAL_DATALAYER]: {
    label: "Local DataLayer",
    status: "observed",
    source: "datalayer",
    description: "Captured GTM/DataLayer commands from the audited page.",
  },
  [EVIDENCE_SOURCES.LOCAL_SCANNER]: {
    label: "Local Scanner",
    status: "heuristic",
    source: "scanner",
    description: "Heuristic DOM, tag, consent, and cookie evidence from the page.",
  },
  [EVIDENCE_SOURCES.EXTERNAL_ACCOUNT]: {
    label: "External Account",
    status: "not_connected",
    source: "audit",
    description:
      "Reserved for Meta, TikTok, Google, or Shopify account-side diagnostics.",
  },
});

export const CAPTURE_SOURCE_TO_EVIDENCE_SOURCE = Object.freeze({
  network: EVIDENCE_SOURCES.LOCAL_NETWORK,
  datalayer: EVIDENCE_SOURCES.LOCAL_DATALAYER,
  scanner: EVIDENCE_SOURCES.LOCAL_SCANNER,
  audit: EVIDENCE_SOURCES.EXTERNAL_ACCOUNT,
});

export const TRACKING_URL_PATTERNS = Object.freeze([
  "*://*.facebook.com/*",
  "*://*.tiktok.com/*",
  "*://*.byteoversea.com/*",
  "*://*.google-analytics.com/*",
  "*://*.google.com/*",
  "*://*.googleadservices.com/*",
  "*://*.doubleclick.net/*",
]);

export const HOST_PERMISSIONS = TRACKING_URL_PATTERNS;

export const PLATFORM_FILTERS = Object.freeze([
  "All",
  "Meta",
  "TikTok",
  "Google",
  "Diagnostics",
]);

export const PLATFORM_UI_META = Object.freeze({
  Meta: {
    label: "Meta Pixel",
    icon: "assets/icons/meta.png",
    color: "#0668E1",
    bgClass: "bg-meta",
    description:
      "Deep-packet inspection of standard events, Advanced Matching (PII), and custom conversions routed to Meta's tracking infrastructure.",
    heroTitle: "Meta Pixel Intelligence",
  },
  TikTok: {
    label: "TikTok Pixel",
    icon: "assets/icons/tiktok.png",
    color: "#000000",
    bgClass: "bg-tiktok",
    description:
      "Real-time monitoring of browser-side interactions, session signals, and performance pings dispatched to the TikTok Ads engine.",
    heroTitle: "TikTok Event Stream",
  },
  GA4: {
    label: "GA4",
    icon: "assets/icons/ga4.svg",
    color: "#E37400",
    bgClass: "bg-google",
    description:
      "High-fidelity interception of GA4 Measurement Protocol pings, Google Ads conversions, and Floodlight activity.",
    heroTitle: "Google Suite Analysis",
  },
  "Google Ads": {
    label: "Google Ads",
    icon: "assets/icons/google-ads.png",
    color: "#4285F4",
    bgClass: "bg-google",
    description:
      "Monitoring conversion signals, GCLID attribution, and dynamic remarketing events for Google Ads.",
    heroTitle: "Google Ads Tracking",
  },
  Floodlight: {
    label: "Floodlight",
    icon: "assets/icons/floodlight.svg",
    color: "#00A1E0",
    bgClass: "bg-google",
    description:
      "Interception of Campaign Manager 360 Floodlight tags and Search Ads 360 conversion signals.",
    heroTitle: "Floodlight Monitor",
  },
  DataLayer: {
    label: "DataLayer",
    icon: "assets/icons/google-tag-manager.png",
    color: "#2485FF",
    bgClass: "bg-google",
    description:
      "Real-time monitoring of the GTM DataLayer object, tracking state changes and variable pushes.",
    heroTitle: "DataLayer Inspection",
  },
  Google: {
    label: "Google Suite",
    icon: "assets/icons/google.png",
    color: "#4285F4",
    bgClass: "bg-google",
    description:
      "Unified monitoring of GA4 Measurement Protocol, Google Ads Conversions, and DV360 Floodlight activity across all properties.",
    heroTitle: "Google Ecosystem",
  },
  Diagnostics: {
    label: "Diagnostics",
    icon: "assets/icons/diagnostics.png",
    color: "#6B7280",
    bgClass: "bg-cream",
    description:
      "Subsurface system signals, automated microdata pings, and low-level diagnostic traces used for platform health.",
    heroTitle: "System Diagnostics",
  },
  All: {
    label: "Global Stream",
    icon: null,
    color: "#6366F1",
    bgClass: "bg-lilac",
    description:
      "A unified, unstructured view of all tracking signals intercepted from social and search platforms across this session.",
    heroTitle: "Universal Event Canvas",
  },
});

export const SUPPORTED_EXPECTATION_PLATFORMS = new Set([
  "Meta",
  "TikTok",
  "GA4",
  "Google Ads",
  "Floodlight",
]);

export const EXPECTATION_PLATFORM_ALIASES = new Map([
  ["meta", "Meta"],
  ["facebook", "Meta"],
  ["fb", "Meta"],
  ["tiktok", "TikTok"],
  ["tik tok", "TikTok"],
  ["ga4", "GA4"],
  ["google analytics 4", "GA4"],
  ["google ads", "Google Ads"],
  ["googleads", "Google Ads"],
  ["adwords", "Google Ads"],
  ["floodlight", "Floodlight"],
  ["doubleclick", "Floodlight"],
  ["datalayer", "DataLayer"],
  ["data layer", "DataLayer"],
  ["diagnostics", "Diagnostics"],
]);

export const PLATFORM_DEFINITIONS = Object.freeze({
  Meta: {
    parser: "meta",
    family: "social",
    expectedIdPattern: /^(\d{5,}|Unknown)$/i,
    endpointHints: ["facebook.com/tr"],
    diagnosticEventKeys: new Set(["microdata", "subscribedbuttonclick"]),
  },
  TikTok: {
    parser: "tiktok",
    family: "social",
    expectedIdPattern: /^(C[A-Z0-9]{4,}|Unknown)$/i,
    endpointHints: ["analytics.tiktok.com", "byteoversea.com"],
    diagnosticEventKeys: new Set([
      "unknown",
      "metadata",
      "subscribedbuttonclick",
      "performanceping",
    ]),
  },
  GA4: {
    parser: "google",
    family: "google",
    expectedIdPattern: /^(G-[A-Z0-9]+|Unknown)$/i,
    endpointHints: ["google-analytics.com/g/collect"],
    diagnosticEventKeys: new Set([
      "open_container_view_sp",
      "worker_install_success",
      "guided_tag_install_enabled",
      "sp__init",
      "init",
      "install_success",
      "engagement_time_ping",
      "system_ping",
    ]),
  },
  "Google Ads": {
    parser: "google",
    family: "google",
    expectedIdPattern: /^(AW-\d+|Unknown)$/i,
    endpointHints: ["pagead/conversion", "1p-conversion", "ccm/collect"],
    diagnosticEventKeys: new Set(),
  },
  Floodlight: {
    parser: "google",
    family: "google",
    expectedIdPattern: /^(\d+|Unknown)$/i,
    endpointHints: ["doubleclick.net/activity", "doubleclick.net/ddm/activity"],
    diagnosticEventKeys: new Set(),
  },
  DataLayer: {
    parser: "datalayer",
    family: "google",
    expectedIdPattern: /.*/,
    endpointHints: ["window.dataLayer"],
    diagnosticEventKeys: new Set([
      "datalayerconfig",
      "datalayerconsent",
      "datalayerset",
      "datalayerjs",
      "gtmcontainerload",
      "gtmload",
      "gtmdom",
    ]),
  },
  Diagnostics: {
    parser: "local-scanner",
    family: "diagnostics",
    expectedIdPattern: /.*/,
    endpointHints: ["DOM scanner"],
    diagnosticEventKeys: new Set(["tagscannersnapshot"]),
  },
});

const EVENT_NAME_ALIASES = Object.freeze({
  Meta: new Map([
    ["pageview", "PageView"],
    ["viewcontent", "ViewContent"],
    ["addtocart", "AddToCart"],
    ["lead", "Lead"],
    ["purchase", "Purchase"],
  ]),
  TikTok: new Map([
    ["pageview", "Pageview"],
    ["page_view", "Pageview"],
    ["viewcontent", "ViewContent"],
    ["addtocart", "AddToCart"],
    ["completepayment", "Purchase"],
    ["placeanorder", "Purchase"],
    ["purchase", "Purchase"],
  ]),
  GA4: new Map([
    ["pageview", "page_view"],
    ["page_view", "page_view"],
    ["viewitem", "view_item"],
    ["view_item", "view_item"],
    ["addtocart", "add_to_cart"],
    ["add_to_cart", "add_to_cart"],
    ["begincheckout", "begin_checkout"],
    ["begin_checkout", "begin_checkout"],
    ["purchase", "purchase"],
  ]),
  "Google Ads": new Map([["conversion", "Conversion"]]),
  Floodlight: new Map([["floodlight", "Floodlight"]]),
  DataLayer: new Map([["gtmjs", "GTM Container Load"]]),
});

const BASE_AUDIT_RULES = [
  {
    platform: "Meta",
    eventName: "PageView",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.fbp", "eventData.fbc"],
  },
  {
    platform: "Meta",
    eventName: "ViewContent",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "Meta",
    eventName: "AddToCart",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.event_id|eventData.eid",
      "eventData.cd.value",
      "eventData.cd.currency",
    ],
  },
  {
    platform: "Meta",
    eventName: "Lead",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "Meta",
    eventName: "Purchase",
    requiredParams: ["pixelId", "eventData.cd.value", "eventData.cd.currency"],
    recommendedParams: ["eventData.event_id|eventData.eid"],
  },
  {
    platform: "TikTok",
    eventName: "Pageview",
    requiredParams: ["pixelId"],
    recommendedParams: ["eventData.event_id"],
  },
  {
    platform: "TikTok",
    eventName: "ViewContent",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.properties.content_ids|eventData.properties.content_id",
    ],
  },
  {
    platform: "TikTok",
    eventName: "AddToCart",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.properties.value",
      "eventData.properties.currency",
    ],
  },
  {
    platform: "TikTok",
    eventName: "Purchase",
    requiredParams: [
      "pixelId",
      "eventData.properties.value",
      "eventData.properties.currency",
    ],
    recommendedParams: ["eventData.event_id"],
  },
  {
    platform: "GA4",
    eventName: "page_view",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.dl"],
  },
  {
    platform: "GA4",
    eventName: "add_to_cart",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.ep.currency", "eventData.epn.value"],
  },
  {
    platform: "GA4",
    eventName: "begin_checkout",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: ["eventData.ep.currency", "eventData.epn.value"],
  },
  {
    platform: "GA4",
    eventName: "purchase",
    requiredParams: ["pixelId", "eventData.cid"],
    recommendedParams: [
      "eventData.ep.transaction_id",
      "eventData.ep.currency|eventData.cu",
      "eventData.epn.value",
    ],
  },
  {
    platform: "Google Ads",
    eventName: "Conversion",
    requiredParams: ["pixelId"],
    recommendedParams: [
      "eventData.label|eventData.lbl",
      "eventData.value|eventData.val",
      "eventData.currency_code|eventData.currency|eventData.cu",
    ],
    matchMode: "prefix",
  },
  {
    platform: "Floodlight",
    eventName: "Floodlight",
    requiredParams: ["eventData.src", "eventData.type", "eventData.cat"],
    recommendedParams: ["eventData.ord"],
    matchMode: "any",
  },
];

export const AUDIT_RULES = Object.freeze(
  BASE_AUDIT_RULES.map((rule) => ({
    severity: rule.severity || "warning",
    message:
      rule.message ||
      `${rule.platform} ${rule.eventName} should match the pre-launch tracking checklist.`,
    ...rule,
    eventName: canonicalEventName(rule.platform, rule.eventName),
  })),
);

export const DEFAULT_EXPECTED_EVENTS = Object.freeze(
  AUDIT_RULES.map((rule) => ({
    platform: rule.platform,
    eventName: rule.eventName,
  })),
);

export const FALLBACK_TIMELINE = Object.freeze([
  { platform: "Any", eventName: "PageView", label: "Page View" },
  { platform: "Any", eventName: "ViewContent", label: "View Content" },
  { platform: "Any", eventName: "AddToCart", label: "Add To Cart" },
  { platform: "Any", eventName: "Lead", label: "Lead / Checkout" },
  { platform: "Any", eventName: "Purchase", label: "Purchase / Conversion" },
]);

export const FUNNEL_RANKS = new Map([
  ["pageview", 10],
  ["page_view", 10],
  ["page view", 10],
  ["viewcontent", 20],
  ["view_content", 20],
  ["view content", 20],
  ["addtocart", 30],
  ["add_to_cart", 30],
  ["add to cart", 30],
  ["lead", 40],
  ["begin_checkout", 45],
  ["checkout", 45],
  ["purchase", 60],
  ["completepayment", 60],
  ["conversion", 60],
  ["floodlight", 65],
]);

export const AUDIT_PRESETS = Object.freeze([
  {
    id: "meta-capi-dedupe",
    label: "Meta Browser + CAPI Dedupe",
    description:
      "PageView, funnel events, event_id/eid, value/currency, and expected Meta pixel ID.",
    expectedEvents: [
      { platform: "Meta", eventName: "PageView" },
      { platform: "Meta", eventName: "ViewContent" },
      { platform: "Meta", eventName: "AddToCart" },
      { platform: "Meta", eventName: "Purchase" },
    ],
  },
  {
    id: "tiktok-events-api-dedupe",
    label: "TikTok Pixel + Events API",
    description:
      "TikTok Pageview through Purchase with event_id and ecommerce parameters.",
    expectedEvents: [
      { platform: "TikTok", eventName: "Pageview" },
      { platform: "TikTok", eventName: "ViewContent" },
      { platform: "TikTok", eventName: "AddToCart" },
      { platform: "TikTok", eventName: "Purchase" },
    ],
  },
  {
    id: "ga4-ecommerce",
    label: "GA4 Ecommerce",
    description:
      "GA4 page view, cart, checkout, and purchase with transaction and revenue fields.",
    expectedEvents: [
      { platform: "GA4", eventName: "page_view" },
      { platform: "GA4", eventName: "add_to_cart" },
      { platform: "GA4", eventName: "begin_checkout" },
      { platform: "GA4", eventName: "purchase" },
    ],
  },
  {
    id: "google-ads-conversion",
    label: "Google Ads Conversion",
    description:
      "Google Ads conversion hit, label, value/currency, and local Google tag health checks.",
    expectedEvents: [{ platform: "Google Ads", eventName: "Conversion" }],
  },
  {
    id: "floodlight",
    label: "Floodlight",
    description:
      "Floodlight src/type/cat/ord validation for CM360 or DV360 tags.",
    expectedEvents: [{ platform: "Floodlight", eventName: "Floodlight" }],
  },
  {
    id: "shopify-launch",
    label: "Shopify Launch QA",
    description:
      "Common Shopify paid-media funnel across Meta, TikTok, GA4, and Google Ads.",
    expectedEvents: [
      { platform: "Meta", eventName: "PageView" },
      { platform: "Meta", eventName: "AddToCart" },
      { platform: "Meta", eventName: "Purchase" },
      { platform: "TikTok", eventName: "Pageview" },
      { platform: "TikTok", eventName: "Purchase" },
      { platform: "GA4", eventName: "purchase" },
      { platform: "Google Ads", eventName: "Conversion" },
    ],
  },
  {
    id: "woocommerce-launch",
    label: "WooCommerce Launch QA",
    description:
      "WordPress/WooCommerce purchase funnel and common paid-media conversion tags.",
    expectedEvents: [
      { platform: "Meta", eventName: "ViewContent" },
      { platform: "Meta", eventName: "AddToCart" },
      { platform: "Meta", eventName: "Purchase" },
      { platform: "GA4", eventName: "add_to_cart" },
      { platform: "GA4", eventName: "purchase" },
      { platform: "Google Ads", eventName: "Conversion" },
    ],
  },
  {
    id: "generic-gtm-launch",
    label: "Generic GTM Launch",
    description:
      "Broad GTM launch checklist for social pixels, GA4 ecommerce, and Ads conversion tags.",
    expectedEvents: [
      { platform: "Meta", eventName: "PageView" },
      { platform: "TikTok", eventName: "Pageview" },
      { platform: "GA4", eventName: "page_view" },
      { platform: "GA4", eventName: "purchase" },
      { platform: "Google Ads", eventName: "Conversion" },
    ],
  },
]);

export const EXPECTATION_IMPORT_TEMPLATE = Object.freeze({
  expectedPixels: {
    Meta: "",
    TikTok: "",
    GA4: "",
    "Google Ads": "",
    Floodlight: "",
  },
  expectedEvents: [
    { platform: "Meta", eventName: "PageView" },
    { platform: "Meta", eventName: "ViewContent" },
    { platform: "Meta", eventName: "AddToCart" },
    { platform: "Meta", eventName: "Purchase" },
    { platform: "TikTok", eventName: "Pageview" },
    { platform: "TikTok", eventName: "ViewContent" },
    { platform: "TikTok", eventName: "AddToCart" },
    { platform: "TikTok", eventName: "Purchase" },
    { platform: "GA4", eventName: "page_view" },
    { platform: "GA4", eventName: "add_to_cart" },
    { platform: "GA4", eventName: "purchase" },
    { platform: "Google Ads", eventName: "Conversion" },
    { platform: "Floodlight", eventName: "Floodlight" },
  ],
});

export function normalizeEventNameKey(eventName = "") {
  return String(eventName)
    .replace(/^Conversion\s*\(.+\)$/i, "Conversion")
    .replace(/[^a-z0-9_ ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "");
}

export function canonicalPlatform(platform = "") {
  const raw = String(platform).trim();
  return EXPECTATION_PLATFORM_ALIASES.get(raw.toLowerCase()) || raw;
}

export function canonicalEventName(platform, eventName = "") {
  const canonical = canonicalPlatform(platform);
  const raw = String(eventName || "").trim();
  if (canonical === "Google Ads" && /^Conversion\s*\(.+\)$/i.test(raw)) {
    return raw;
  }
  const normalized = normalizeEventNameKey(raw);
  const alias = EVENT_NAME_ALIASES[canonical]?.get(normalized);
  return alias || raw;
}

export function isDiagnosticEvent(platform, eventName = "") {
  const canonical = canonicalPlatform(platform);
  const normalized = normalizeEventNameKey(eventName);
  const definition = PLATFORM_DEFINITIONS[canonical];
  if (definition?.diagnosticEventKeys?.has(normalized)) return true;
  if (canonical === "GA4") {
    return (
      String(eventName).startsWith("gtm.") ||
      String(eventName).startsWith("optimize.") ||
      String(eventName).startsWith("connection__")
    );
  }
  if (canonical === "DataLayer") {
    return (
      String(eventName).startsWith("DataLayer: ") ||
      String(eventName).startsWith("gtm.") ||
      String(eventName).startsWith("connection__") ||
      String(eventName).startsWith("optimize.")
    );
  }
  return false;
}

export function getEvidenceSourceForEvent(event = {}) {
  if (event.evidenceSource && EVIDENCE_SOURCE_META[event.evidenceSource]) {
    return event.evidenceSource;
  }
  return (
    CAPTURE_SOURCE_TO_EVIDENCE_SOURCE[event.source] ||
    EVIDENCE_SOURCES.LOCAL_NETWORK
  );
}

export function getEvidenceSourceMeta(evidenceSource) {
  return (
    EVIDENCE_SOURCE_META[evidenceSource] ||
    EVIDENCE_SOURCE_META[EVIDENCE_SOURCES.LOCAL_NETWORK]
  );
}

function defaultParserName(platform) {
  return (
    PLATFORM_DEFINITIONS[canonicalPlatform(platform)]?.parser ||
    String(platform || "unknown").toLowerCase().replace(/\s+/g, "-")
  );
}

function normalizeConfidence(value, fallback) {
  return ["high", "medium", "low"].includes(value) ? value : fallback;
}

export function createParsedSignal(input = {}) {
  const platform = canonicalPlatform(input.platform || "Diagnostics");
  const eventName = canonicalEventName(platform, input.eventName || "Unknown");
  const pixelId = String(input.pixelId || "Unknown");
  const diagnostics = { ...(input.diagnostics || {}) };
  const isDiagnostic =
    input.isDiagnostic ?? diagnostics.isDiagnostic ?? isDiagnosticEvent(platform, eventName);
  if (isDiagnostic) diagnostics.isDiagnostic = true;

  const inferredConfidence =
    pixelId === "Unknown" || eventName === "Unknown" ? "low" : "high";
  return {
    platform,
    pixelId,
    eventName,
    eventData:
      input.eventData && typeof input.eventData === "object"
        ? input.eventData
        : {},
    isDiagnostic: !!isDiagnostic,
    confidence: normalizeConfidence(input.confidence, inferredConfidence),
    diagnostics,
    sourceParser: input.sourceParser || defaultParserName(platform),
    parserSchemaVersion: Number(input.parserSchemaVersion || PARSER_SCHEMA_VERSION),
  };
}

export function validateParsedSignal(input = {}) {
  const signal = createParsedSignal(input);
  const validationIssues = [];
  const definition = PLATFORM_DEFINITIONS[signal.platform];

  if (!definition) {
    validationIssues.push(`Unsupported platform: ${signal.platform}`);
  }
  if (!signal.pixelId || signal.pixelId === "Unknown") {
    validationIssues.push("Pixel or tag ID could not be parsed.");
  } else if (
    definition?.expectedIdPattern &&
    !definition.expectedIdPattern.test(signal.pixelId)
  ) {
    validationIssues.push(`Pixel or tag ID does not match ${signal.platform} format.`);
  }
  if (!signal.eventName || signal.eventName === "Unknown") {
    validationIssues.push("Event name could not be parsed.");
  }

  return {
    ...signal,
    confidence:
      validationIssues.length > 0
        ? normalizeConfidence(signal.confidence, "low") === "high"
          ? "medium"
          : signal.confidence
        : signal.confidence,
    diagnostics: {
      ...signal.diagnostics,
      validationIssues,
    },
  };
}

export function classifyDataLayerItem(item) {
  let eventName = "DataLayer Init";
  let isDiagnostic = false;

  if (Array.isArray(item) && item.length > 0) {
    const command = item[0];
    if (typeof command === "string") {
      eventName =
        command === "event" && typeof item[1] === "string"
          ? canonicalEventName("DataLayer", item[1])
          : `DataLayer: ${command}`;
      isDiagnostic = ["consent", "set", "js", "config"].includes(command);
    }
  } else if (item && typeof item === "object" && item.event) {
    eventName = canonicalEventName("DataLayer", item.event);
    if (eventName === "gtm.js") {
      eventName = "GTM Container Load";
      isDiagnostic = true;
    }
    isDiagnostic =
      isDiagnostic ||
      eventName === "gtm.load" ||
      eventName === "gtm.dom" ||
      eventName.startsWith("connection__") ||
      eventName.startsWith("optimize.");
  }

  return {
    eventName,
    isDiagnostic: isDiagnostic || isDiagnosticEvent("DataLayer", eventName),
  };
}
