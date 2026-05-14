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

export const FALLBACK_TIMELINE = [
  { platform: "Any", eventName: "PageView", label: "Page View" },
  { platform: "Any", eventName: "ViewContent", label: "View Content" },
  { platform: "Any", eventName: "AddToCart", label: "Add To Cart" },
  { platform: "Any", eventName: "Lead", label: "Lead / Checkout" },
  { platform: "Any", eventName: "Purchase", label: "Purchase / Conversion" },
];

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
]);

export const SUPPORTED_EXPECTATION_PLATFORMS = new Set([
  "Meta",
  "TikTok",
  "GA4",
  "Google Ads",
  "Floodlight",
]);

export const AUDIT_RULES = BASE_AUDIT_RULES.map((rule) => ({
  severity: rule.severity || "warning",
  message:
    rule.message ||
    `${rule.platform} ${rule.eventName} should match the pre-launch tracking checklist.`,
  ...rule,
}));

export const DEFAULT_EXPECTED_EVENTS = AUDIT_RULES.map((rule) => ({
  platform: rule.platform,
  eventName: rule.eventName,
}));

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
