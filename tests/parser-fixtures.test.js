import test from "node:test";
import assert from "node:assert/strict";

import { parseMetaRequest } from "../src/background/parsers/meta.js";
import { parseTikTokRequest } from "../src/background/parsers/tiktok.js";
import { parseGoogleRequest } from "../src/background/parsers/google.js";
import { CaptureEngine } from "../src/background/capture.js";
import {
  clearFingerprints,
  sanitizeCapturedData,
  sanitizeCapturedUrl,
} from "../src/background/utils.js";
import { createMemoryEventRepository } from "../src/shared/event-repository.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import {
  auditEvent,
  classifyEventStatus,
  escapeHtml,
} from "../src/dashboard/js/utils.js";

const rawBody = (body) => ({
  raw: [{ bytes: new TextEncoder().encode(body).buffer }],
});

function createDataLayerHarness(settings = DEFAULT_SETTINGS) {
  const repository = createMemoryEventRepository();
  const sessionManager = {
    isAuditedTab: () => true,
    getContextForTab: () => ({ auditRunId: "run-1" }),
    getActiveRunId: () => "run-1",
  };
  const sentRuntimeMessages = [];
  const sentTabMessages = [];
  const sentActionCalls = [];
  const engine = new CaptureEngine({
    chromeApi: {
      runtime: {
        async sendMessage(message) {
          sentRuntimeMessages.push(message);
        },
      },
      tabs: {
        async sendMessage(tabId, message) {
          sentTabMessages.push({ tabId, message });
        },
      },
      action: {
        async setBadgeBackgroundColor(payload) {
          sentActionCalls.push({ method: "setBadgeBackgroundColor", payload });
        },
        async setBadgeText(payload) {
          sentActionCalls.push({ method: "setBadgeText", payload });
        },
        async setTitle(payload) {
          sentActionCalls.push({ method: "setTitle", payload });
        },
      },
    },
    repository,
    sessionManager,
    getSettings: () => settings,
  });
  return {
    engine,
    repository,
    sentRuntimeMessages,
    sentTabMessages,
    sentActionCalls,
  };
}

test("parses Meta Purchase fixture", () => {
  const parsed = parseMetaRequest(
    new URL(
      "https://www.facebook.com/tr/?id=123456&ev=Purchase&eid=evt-1&dl=https%3A%2F%2Fshop.test%2Fthank-you&cd%5Bvalue%5D=99.5&cd%5Bcurrency%5D=USD",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Meta");
  assert.equal(parsed.pixelId, "123456");
  assert.equal(parsed.eventName, "Purchase");
  assert.equal(parsed.eventData.cd.value, "99.5");
  assert.equal(parsed.eventData.cd.currency, "USD");
});

test("parses Meta advanced matching bracket fields", () => {
  const parsed = parseMetaRequest(
    new URL(
      "https://www.facebook.com/tr/?id=123456&ev=Lead&ud%5Bem%5D=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&cd=%7B%22content_name%22%3A%22Guide%22%7D",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.eventData.ud.em, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(parsed.eventData.cd.content_name, "Guide");
});

test("parses Meta POST JSON fixture with CAPI-style fields", () => {
  const parsed = parseMetaRequest(
    new URL("https://www.facebook.com/tr/"),
    {
      method: "POST",
      requestBody: rawBody(
        JSON.stringify({
          id: "123456",
          event_name: "Purchase",
          event_id: "evt-capi-1",
          custom_data: { value: 125, currency: "USD" },
          user_data: {
            em: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        }),
      ),
    },
  );

  assert.equal(parsed.pixelId, "123456");
  assert.equal(parsed.eventName, "Purchase");
  assert.equal(parsed.eventData.event_id, "evt-capi-1");
  assert.equal(parsed.eventData.cd.value, 125);
  assert.equal(parsed.eventData.ud.em.length, 64);
});

test("parses Meta POST form fixture and diagnostic fallback", () => {
  const parsed = parseMetaRequest(new URL("https://www.facebook.com/tr/"), {
    method: "POST",
    requestBody: {
      formData: {
        id: ["123456"],
        ev: ["Microdata"],
        cd: ['{"content_name":"Product"}'],
      },
    },
  });

  assert.equal(parsed.platform, "Meta");
  assert.equal(parsed.eventName, "Microdata");
  assert.equal(parsed.isDiagnostic, true);
  assert.equal(parsed.eventData.cd.content_name, "Product");
});

test("marks ambiguous Meta hits with low parser confidence", () => {
  const parsed = parseMetaRequest(
    new URL("https://www.facebook.com/tr/?id=123456"),
    { method: "GET" },
  );

  assert.equal(parsed.eventName, "Unknown");
  assert.equal(parsed.confidence, "low");
});

test("parses TikTok CompletePayment JSON fixture", () => {
  const parsed = parseTikTokRequest(
    new URL("https://analytics.tiktok.com/api/v2/pixel/track/"),
    {
      method: "POST",
      requestBody: rawBody(
        JSON.stringify({
          event: "CompletePayment",
          pixel_code: "C123ABC",
          properties: { value: 42, currency: "USD" },
          context: { page: { url: "https://shop.test/thank-you" } },
        }),
      ),
    },
  );

  assert.equal(parsed.platform, "TikTok");
  assert.equal(parsed.pixelId, "C123ABC");
  assert.equal(parsed.eventName, "Purchase");
  assert.equal(parsed.eventData.properties.currency, "USD");
  assert.equal(parsed.sourceParser, "tiktok");
  assert.equal(parsed.parserSchemaVersion, 2);
});

test("parses TikTok Purchase URL-encoded fixture with sdkid", () => {
  const parsed = parseTikTokRequest(
    new URL("https://analytics.tiktok.com/api/v2/pixel/track/?sdkid=CSDK123"),
    {
      method: "POST",
      requestBody: rawBody(
        "event=Purchase&event_id=evt-1&properties=%7B%22value%22%3A88%2C%22currency%22%3A%22USD%22%7D",
      ),
    },
  );

  assert.equal(parsed.platform, "TikTok");
  assert.equal(parsed.pixelId, "CSDK123");
  assert.equal(parsed.eventName, "Purchase");
  assert.equal(parsed.eventData.properties.value, 88);
});

test("splits batched TikTok JSON events", () => {
  const parsed = parseTikTokRequest(
    new URL("https://analytics.tiktok.com/api/v2/pixel/track/"),
    {
      method: "POST",
      requestBody: rawBody(
        JSON.stringify({
          pixel_code: "CBATCH123",
          events: [
            { event: "PageView", context: { page: { url: "https://shop.test/" } } },
            {
              event: "Purchase",
              properties: { value: 10, currency: "USD" },
              event_id: "evt-purchase",
            },
          ],
        }),
      ),
    },
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].eventName, "Pageview");
  assert.equal(parsed[1].eventName, "Purchase");
  assert.equal(parsed[1].pixelId, "CBATCH123");
});

test("normalizes TikTok PlaceAnOrder as Purchase through the catalog", () => {
  const parsed = parseTikTokRequest(
    new URL("https://analytics.tiktok.com/api/v2/pixel/track/"),
    {
      method: "POST",
      requestBody: rawBody(
        JSON.stringify({
          event: "PlaceAnOrder",
          pixel_code: "C123ABC",
          properties: { value: 42, currency: "USD" },
        }),
      ),
    },
  );

  assert.equal(parsed.eventName, "Purchase");
});

test("normalizes TikTok Pageview casing", () => {
  const parsed = parseTikTokRequest(
    new URL(
      "https://analytics.tiktok.com/api/v2/pixel/track/?pixel_code=C123ABC&event=PageView",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "TikTok");
  assert.equal(parsed.eventName, "Pageview");
});

test("parses GA4 collect fixture", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST123&cid=555&en=purchase&dl=https%3A%2F%2Fshop.test%2Fthank-you&ep.currency=USD&epn.value=25",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "GA4");
  assert.equal(parsed[0].pixelId, "G-TEST123");
  assert.equal(parsed[0].eventName, "purchase");
  assert.equal(parsed[0].eventData["ep.currency"], "USD");
});

test("parses analytics.google.com GA4 collect endpoint", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://analytics.google.com/g/collect?v=2&tid=G-TEST123&cid=555&en=page_view&dl=https%3A%2F%2Fshop.test%2F",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "GA4");
  assert.equal(parsed[0].eventName, "page_view");
  assert.equal(parsed[0].pixelId, "G-TEST123");
});

test("parses DoubleClick-routed GA4 collect endpoint", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-TEST123&cid=555&en=click&dl=https%3A%2F%2Fshop.test%2F",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "GA4");
  assert.equal(parsed[0].eventName, "click");
  assert.equal(parsed[0].pixelId, "G-TEST123");
});

test("persists GA4 network events captured from analytics.google.com", async () => {
  const { engine, repository, sentActionCalls } = createDataLayerHarness();

  await engine.handleNetworkRequest({
    tabId: 1,
    method: "GET",
    url: "https://analytics.google.com/g/collect?v=2&tid=G-TEST123&cid=555&en=scroll&dl=https%3A%2F%2Fshop.test%2F",
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });

  const events = await repository.getEventsByTab("1");
  assert.equal(events.length, 1);
  assert.equal(events[0].platform, "GA4");
  assert.equal(events[0].eventName, "scroll");
  assert.equal(events[0].source, "network");
  assert.deepEqual(
    sentActionCalls.find((call) => call.method === "setBadgeText")?.payload,
    { tabId: 1, text: "1" },
  );
});

test("does not flag rapid Meta events with different payloads as duplicates", async () => {
  clearFingerprints("11");
  const { engine, repository } = createDataLayerHarness();

  await engine.handleNetworkRequest({
    tabId: 11,
    method: "GET",
    url: "https://www.facebook.com/tr/?id=781185679583502&ev=ShopeeShop&dl=https%3A%2F%2Fshop.test%2Fone&cd%5Bcontent_name%5D=one",
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });
  await engine.handleNetworkRequest({
    tabId: 11,
    method: "GET",
    url: "https://www.facebook.com/tr/?id=781185679583502&ev=ShopeeShop&dl=https%3A%2F%2Fshop.test%2Ftwo&cd%5Bcontent_name%5D=two",
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });

  const events = await repository.getEventsByTab("11");
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => [event.status, event.duplicateCount]),
    [
      ["valid", 0],
      ["valid", 0],
    ],
  );
});

test("suppresses Meta GET/POST transport mirror without duplicate badge", async () => {
  clearFingerprints("12");
  const { engine, repository } = createDataLayerHarness();
  const url =
    "https://www.facebook.com/tr/?id=781185679583502&ev=PageView&dl=https%3A%2F%2Fshop.test%2F&r=stable&rqm=GET";
  const postUrl = url.replace("rqm=GET", "rqm=POST");

  await engine.handleNetworkRequest({
    tabId: 12,
    method: "GET",
    url,
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });
  await engine.handleNetworkRequest({
    tabId: 12,
    method: "POST",
    url: postUrl,
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });

  const events = await repository.getEventsByTab("12");
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, "PageView");
  assert.equal(events[0].status, "valid");
  assert.equal(events[0].duplicateCount, 0);
});

test("suppresses repeated Meta PageView GET without event id", async () => {
  clearFingerprints("14");
  const { engine, repository } = createDataLayerHarness();
  const url =
    "https://www.facebook.com/tr/?id=781185679583502&ev=PageView&dl=https%3A%2F%2Fshop.test%2F&fbp=fb.1.1234567890.987654321";

  await engine.handleNetworkRequest({
    tabId: 14,
    method: "GET",
    url,
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });
  await engine.handleNetworkRequest({
    tabId: 14,
    method: "GET",
    url,
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/",
  });

  const events = await repository.getEventsByTab("14");
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, "PageView");
  assert.equal(events[0].status, "valid");
  assert.equal(events[0].duplicateCount, 0);
});

test("keeps Meta event_id duplicate evidence when the same id repeats", async () => {
  clearFingerprints("13");
  const { engine, repository } = createDataLayerHarness();

  await engine.handleNetworkRequest({
    tabId: 13,
    method: "GET",
    url: "https://www.facebook.com/tr/?id=781185679583502&ev=Purchase&eid=evt-1&dl=https%3A%2F%2Fshop.test%2Fthank-you&cd%5Bvalue%5D=99&cd%5Bcurrency%5D=USD",
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/thank-you",
  });
  await engine.handleNetworkRequest({
    tabId: 13,
    method: "POST",
    url: "https://www.facebook.com/tr/?id=781185679583502&ev=Purchase&eid=evt-1&dl=https%3A%2F%2Fshop.test%2Fthank-you&cd%5Bvalue%5D=99&cd%5Bcurrency%5D=USD",
    initiator: "https://shop.test",
    documentUrl: "https://shop.test/thank-you",
  });

  const events = await repository.getEventsByTab("13");
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "duplicate");
  assert.equal(events[0].duplicateCount, 1);
});

test("parses Google Ads conversion fixture", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.google.com/pagead/conversion/AW-987654321/?label=signup_1&value=15&currency_code=USD",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Google Ads");
  assert.equal(parsed.pixelId, "AW-987654321");
  assert.equal(parsed.eventName, "Conversion (signup_1)");
  assert.equal(parsed.eventData.currency_code, "USD");
});

test("parses Google Ads 1p conversion numeric path as AW tag", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.googleadservices.com/pagead/1p-conversion/987654321/?label=purchase_1&value=15&currency_code=USD",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Google Ads");
  assert.equal(parsed.pixelId, "AW-987654321");
  assert.equal(parsed.eventName, "Conversion (purchase_1)");
});

test("parses Google Ads conversion body params", () => {
  const parsed = parseGoogleRequest(
    new URL("https://www.googleadservices.com/pagead/conversion/987654321/"),
    {
      method: "POST",
      requestBody: rawBody("label=purchase_1&value=15&currency_code=USD"),
    },
  );

  assert.equal(parsed.platform, "Google Ads");
  assert.equal(parsed.pixelId, "AW-987654321");
  assert.equal(parsed.eventName, "Conversion (purchase_1)");
  assert.equal(parsed.eventData.value, "15");
});

test("keeps ccm page_view pings out of Google Ads conversion parsing", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.google.com/ccm/collect?rcb=8&frm=0&ae=g&en=page_view&dl=https%3A%2F%2Foreosocolapie.com%2F&scrsrc=www.googletagmanager.com&rnd=550720510.1778748065&gtm=45He65c0v9248860575za200zd9248860575xea&gcs=G111&gcd=13r3v3r3r5l1&tag_exp=0~115938466~115938469",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Diagnostics");
  assert.equal(parsed.pixelId, "Google Tag");
  assert.equal(parsed.eventName, "Google Tag Ping");
  assert.equal(parsed.isDiagnostic, true);
  assert.equal(parsed.diagnostics.ignoredAsGoogleAdsConversion, true);
});

test("parses ccm collect as Google Ads only with explicit AW conversion evidence", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://www.google.com/ccm/collect?en=conversion&send_to=AW-987654321%2Fsignup_1&value=15&currency=USD",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Google Ads");
  assert.equal(parsed.pixelId, "AW-987654321");
  assert.equal(parsed.eventName, "Conversion (signup_1)");
  assert.equal(parsed.diagnostics.endpoint, "google-ads-ccm-collect");
});

test("ignores conversion-shaped Google paths without an Ads conversion id", () => {
  const parsed = parseGoogleRequest(
    new URL("https://www.google.com/pagead/conversion/?label=signup_1"),
    { method: "GET" },
  );

  assert.equal(parsed, null);
});

test("ignores Google Ads static loader scripts", () => {
  const parsed = parseGoogleRequest(
    new URL("https://www.googleadservices.com/pagead/conversion_async.js"),
    { method: "GET" },
  );

  assert.equal(parsed, null);
});

test("parses Floodlight activity fixture", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://ad.doubleclick.net/activity;src=321;type=sales;cat=thankyou;ord=order-1?u1=customer-tier",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Floodlight");
  assert.equal(parsed.pixelId, "321");
  assert.equal(parsed.eventName, "sales / thankyou");
  assert.equal(parsed.eventData.u1, "customer-tier");
});

test("parses Floodlight ddm activity path fixture", () => {
  const parsed = parseGoogleRequest(
    new URL(
      "https://ad.doubleclick.net/ddm/activity/src=321;type=sales;cat=thankyou;ord=order-1?u2=vip",
    ),
    { method: "GET" },
  );

  assert.equal(parsed.platform, "Floodlight");
  assert.equal(parsed.pixelId, "321");
  assert.equal(parsed.eventName, "sales / thankyou");
  assert.equal(parsed.eventData.ord, "order-1");
});

test("parses Floodlight activity POST form payload", () => {
  const parsed = parseGoogleRequest(
    new URL("https://ad.doubleclick.net/activity"),
    {
      method: "POST",
      requestBody: {
        formData: {
          src: ["9226442"],
          type: ["oreo_003"],
          cat: ["inter0"],
          gcs: ["G111"],
          dc_random: ["1778747636"],
        },
      },
    },
  );

  assert.equal(parsed.platform, "Floodlight");
  assert.equal(parsed.pixelId, "9226442");
  assert.equal(parsed.eventName, "oreo_003 / inter0");
  assert.equal(parsed.eventData.gcs, "G111");
});

test("parses Floodlight activity POST raw urlencoded payload", () => {
  const parsed = parseGoogleRequest(
    new URL("https://ad.doubleclick.net/activity"),
    {
      method: "POST",
      requestBody: rawBody(
        "src=9226442&type=oreo_003&cat=inter0&~oref=https%3A%2F%2Foreosocolapie.com%2F",
      ),
    },
  );

  assert.equal(parsed.platform, "Floodlight");
  assert.equal(parsed.pixelId, "9226442");
  assert.equal(parsed.eventName, "oreo_003 / inter0");
  assert.equal(parsed.eventData["~oref"], "https://oreosocolapie.com/");
});

test("suppresses repeated Floodlight transports for the same activity", async () => {
  clearFingerprints("21");
  const { engine, repository } = createDataLayerHarness();
  const baseUrl =
    "https://ad.doubleclick.net/ddm/activity/src=9226442;type=oreo_003;cat=inter000;ord=";

  await engine.handleNetworkRequest({
    tabId: 21,
    method: "POST",
    url: `${baseUrl}1?gtm=abc`,
    initiator: "https://oreosocolapie.com",
    documentUrl: "https://oreosocolapie.com/",
  });
  await engine.handleNetworkRequest({
    tabId: 21,
    method: "GET",
    url: `${baseUrl}2?gtm=def`,
    initiator: "https://oreosocolapie.com",
    documentUrl: "https://oreosocolapie.com/",
  });
  await engine.handleNetworkRequest({
    tabId: 21,
    method: "GET",
    url: `${baseUrl}3?gtm=ghi`,
    initiator: "https://oreosocolapie.com",
    documentUrl: "https://oreosocolapie.com/",
  });

  const events = await repository.getEventsByTab("21");
  assert.equal(events.length, 1);
  assert.equal(events[0].platform, "Floodlight");
  assert.equal(events[0].status, "valid");
  assert.equal(events[0].duplicateCount, 0);
});

test("shows Floodlight DataLayer send_to as a DOM fallback", async () => {
  clearFingerprints("22");
  const { engine, repository } = createDataLayerHarness();

  await engine.handleDataLayerMessage(
    {
      type: "DATALAYER_PUSH",
      data: {
        timestamp: 1000,
        payload: [
          [
            "event",
            "conversion",
            {
              allow_custom_scripts: true,
              send_to: "DC-9226442/oreo_003/inter000+standard",
            },
          ],
        ],
      },
    },
    { tab: { id: 22, url: "https://oreosocolapie.com/" } },
  );

  const events = await repository.getEventsByTab("22");
  const floodlight = events.find((event) => event.platform === "Floodlight");
  assert.ok(floodlight);
  assert.equal(floodlight.pixelId, "9226442");
  assert.equal(floodlight.eventName, "oreo_003 / inter000");
  assert.equal(floodlight.method, "DOM");
  assert.equal(floodlight.status, "warning");
  assert.equal(floodlight.source, "datalayer");
  assert.equal(floodlight.eventData._networkUnverified, true);
  const datalayer = events.find((event) => event.platform === "DataLayer");
  assert.ok(datalayer);
  assert.equal(datalayer.eventName, "conversion");
  assert.deepEqual(datalayer.diagnostics.floodlightIntent, {
    src: "9226442",
    type: "oreo_003",
    cat: "inter000",
    send_to: "DC-9226442/oreo_003/inter000+standard",
    counting_method: "standard",
    deliveryVerified: false,
  });
});

test("keeps network Floodlight evidence when DOM fallback appeared first", async () => {
  clearFingerprints("23");
  const { engine, repository } = createDataLayerHarness();

  await engine.handleDataLayerMessage(
    {
      type: "DATALAYER_PUSH",
      data: {
        timestamp: 1000,
        payload: [
          [
            "event",
            "conversion",
            {
              allow_custom_scripts: true,
              send_to: "DC-9226442/oreo_003/inter0+standard",
            },
          ],
        ],
      },
    },
    { tab: { id: 23, url: "https://oreosocolapie.com/" } },
  );

  await engine.handleNetworkRequest({
    tabId: 23,
    method: "POST",
    url: "https://ad.doubleclick.net/activity",
    requestBody: {
      formData: {
        src: ["9226442"],
        type: ["oreo_003"],
        cat: ["inter0"],
      },
    },
    initiator: "https://oreosocolapie.com",
    documentUrl: "https://oreosocolapie.com/",
  });

  const floodlightEvents = (await repository.getEventsByTab("23")).filter(
    (event) => event.platform === "Floodlight",
  );
  assert.equal(floodlightEvents.length, 2);
  assert.ok(floodlightEvents.some((event) => event.method === "DOM"));
  assert.ok(floodlightEvents.some((event) => event.method === "POST"));
});

test("captures numeric-key gtag event arguments as the actual event name", async () => {
  const { engine, repository } = createDataLayerHarness();

  await engine.handleDataLayerMessage(
    {
      type: "DATALAYER_PUSH",
      data: {
        timestamp: 1000,
        payload: [
          {
            0: "event",
            1: "purchase",
            2: { value: 10, currency: "USD" },
          },
        ],
      },
    },
    { tab: { id: 1, url: "https://shop.test/thank-you" } },
  );

  const [event] = await repository.getEventsByTab("1");
  assert.equal(event.eventName, "purchase");
  assert.equal(event.status, "valid");
  assert.deepEqual(event.eventData[2], { value: 10, currency: "USD" });
});

test("captures gtag consent and config commands as diagnostics", async () => {
  const { engine, repository } = createDataLayerHarness();

  await engine.handleDataLayerMessage(
    {
      type: "DATALAYER_HISTORY",
      data: {
        timestamp: 1000,
        payload: [
          { 0: "consent", 1: "default", 2: { ad_storage: "denied" } },
          { 0: "config", 1: "G-TEST123" },
        ],
      },
    },
    { tab: { id: 1, url: "https://shop.test/" } },
  );

  const events = await repository.getEventsByTab("1");
  assert.deepEqual(
    events.map((event) => event.eventName).sort(),
    ["DataLayer: config", "DataLayer: consent"],
  );
  assert.ok(events.every((event) => event.isDiagnostic));
});

test("redacts plaintext sensitive values before storage", () => {
  const data = sanitizeCapturedData({
    email: "buyer@example.com",
    em: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    nested: { phone: "555-123-4567" },
  });

  assert.equal(data.email, "[redacted sensitive key]");
  assert.equal(
    data.em,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(data.nested.phone, "[redacted sensitive key]");
  assert.equal(data._privacyRedactions.length, 2);
});

test("redacts sensitive URL query values before storage", () => {
  const url = sanitizeCapturedUrl(
    "https://shop.test/thank-you?email=buyer@example.com&order_id=123",
  );

  assert.equal(
    url,
    "https://shop.test/thank-you?email=%5Bredacted+sensitive+value%5D&order_id=123",
  );
});

test("redacts sensitive URL path hash and nested URL payload strings", () => {
  const url = sanitizeCapturedUrl(
    "https://shop.test/customer/buyer@example.com/0901234567#buyer@example.com",
  );
  const data = sanitizeCapturedData({
    checkout_url:
      "https://shop.test/customer/buyer@example.com/thank-you?phone=0901234567#buyer@example.com",
    phone: ["0901234567"],
    mobile: 901234567,
  });

  assert.doesNotMatch(url, /buyer@example\.com|0901234567/);
  assert.doesNotMatch(
    JSON.stringify(data),
    /buyer@example\.com|0901234567|901234567/,
  );
  assert.match(data.checkout_url, /shop\.test/);
  assert.ok(data._privacyRedactions.length >= 3);
});

test("classifies missing purchase parameters and escapes HTML", () => {
  const event = {
    platform: "Meta",
    eventName: "Purchase",
    eventData: { cd: { currency: "USD" } },
  };

  const warnings = auditEvent(event);
  const status = classifyEventStatus(event, warnings);

  assert.equal(status.key, "missing");
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
});
