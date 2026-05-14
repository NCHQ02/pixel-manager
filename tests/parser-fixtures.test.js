import test from "node:test";
import assert from "node:assert/strict";

import { parseMetaRequest } from "../src/background/parsers/meta.js";
import { parseTikTokRequest } from "../src/background/parsers/tiktok.js";
import { parseGoogleRequest } from "../src/background/parsers/google.js";
import {
  sanitizeCapturedData,
  sanitizeCapturedUrl,
} from "../src/background/utils.js";
import {
  auditEvent,
  classifyEventStatus,
  escapeHtml,
} from "../src/dashboard/js/utils.js";

const rawBody = (body) => ({
  raw: [{ bytes: new TextEncoder().encode(body).buffer }],
});

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
  assert.equal(parsed.eventName, "CompletePayment");
  assert.equal(parsed.eventData.properties.currency, "USD");
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
