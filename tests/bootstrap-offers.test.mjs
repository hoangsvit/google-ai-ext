import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { extractBootstrapOffers, extractJslogOffers, skuFromJslog } from '../lib/bootstrap-offers.ts';
import { isNetworkOffer, uniqueNetworkOffers } from '../lib/network-offers.ts';
import { analyzeOfferText } from '../lib/offers.ts';
import { collectVisibleOffers } from '../lib/offers-dom.ts';

// Synthetic, sanitized structural fixture based on the uploaded Google One
// initial HTML. Never commit the original HTML (account/session data).
const plans = [
  ['g1.helium.m', 'Google AI Plus (400 GB) (Google One)', 'monthly', '132.000 ₫', 'P1M', 132000000000],
  ['g1.helium.a', 'Google AI Plus (400 GB) (Google One)', 'annual', '1.319.000 ₫', 'P1Y', 1319000000000],
  ['g1.2tb.ai', 'Google AI Pro (5 TB) (Google One)', 'p1m', '489.000 ₫', 'P1M', 489000000000],
  ['g1.2tb.ai.annual', 'Google AI Pro (5 TB) (Google One)', 'p1y', '5.000.000 ₫', 'P1Y', 5000000000000],
  ['g1.20tb.v2', 'Google AI Ultra (20 TB) (Google One)', 'p1m', '2.250.000 ₫', 'P1M', 2250000000000],
  ['g1.ai.pro', 'Google AI Ultra (30 TB) (Google One)', 'monthly', '5.500.000 ₫', 'P1M', 5500000000000],
];
function product(row, token = 'DO_NOT_INCLUDE_PAYMENT_TOKEN') {
  const [productId, title, basePlanId, formattedPrice, billingPeriod, priceAmountMicros] = row;
  return {
    productId, type: 'subs', title, offerIdToken: token,
    subscriptionOfferDetails: [{
      basePlanId,
      offerIdToken: token,
      pricingPhases: [{
        formattedPrice, billingPeriod, priceCurrencyCode: 'VND',
        priceAmountMicros,
      }],
    }],
  };
}
function bootstrap(rows = plans) {
  const payload = rows.map((row) =>
    '[' + JSON.stringify(row[0]) + ',' + JSON.stringify(JSON.stringify(product(row))) + ']');
  return "AF_initDataCallback({key:'ds:0',hash:'1',data:[" + payload.join(',') + "]});";
}

test('initial AF_initDataCallback exposes six distinct paid products without any fetch', () => {
  const rows = extractBootstrapOffers(bootstrap([...plans, ...plans]));
  assert.equal(rows.length, 6, 'repeated initial data entries must deduplicate');
  assert.equal(new Set(rows.map((row) => row.productId)).size, 6);
  for (const plan of plans) {
    const [sku, title, base, price, period] = plan;
    const row = rows.find((entry) => entry.productId === sku);
    assert.ok(row, sku);
    assert.equal(row.source, 'bootstrap');
    assert.equal(row.basePlanId, base);
    assert.equal(row.price, price);
    assert.equal(row.billingPeriod, period);
    assert.equal(row.currency, 'VND');
    assert.equal(row.plan, title);
    assert.equal(isNetworkOffer(row), true);
  }
});

test('bootstrap parser does not execute JS or leak payment identifiers', () => {
  const secret = 'PRIVATE_SESSION_TOKEN_SHOULD_NEVER_BE_RETURNED_567890';
  const special = product(plans[0], secret);
  special.email = 'private-account@example.invalid';
  const source = "AF_initDataCallback({key:'ds:0',data:[[\"g1.helium.m\"," +
    JSON.stringify(JSON.stringify(special)) + "]]});";
  const rows = extractBootstrapOffers(source);
  assert.equal(rows.length, 1);
  const exposed = JSON.stringify(rows);
  assert.equal(exposed.includes(secret), false);
  assert.equal(exposed.includes('private-account'), false);
  assert.equal(exposed.includes('offerIdToken'), false);
  assert.equal(exposed.includes('email'), false);

  assert.deepEqual(extractBootstrapOffers("throw new Error('g1.fake.plan')"), []);
  assert.deepEqual(extractBootstrapOffers('AF_initDataCallback(' + 'x'.repeat(350_001) + ')'), []);
});

test('jslog identifies the correct CTA SKU and reads only nearby price', () => {
  assert.equal(skuFromJslog('12020;[[\"g1.helium.m\",\"offer\"]]'), 'g1.helium.m');
  assert.equal(skuFromJslog('not a subscription'), null);
  assert.equal(skuFromJslog('x'.repeat(3001)), null);

  const parent = { innerText: '132.000 ₫ /tháng Đăng ký Google AI Plus', parentElement: null };
  const node = {
    getAttribute: () => 'click;[[\"g1.helium.m\"]]',
    closest: () => null,
    getClientRects: () => [1],
    innerText: 'Đăng ký Google AI Plus',
    parentElement: parent,
  };
  const doc = { body: {}, querySelectorAll: () => [node] };
  const rows = extractJslogOffers(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, 'g1.helium.m');
  assert.equal(rows[0].price, '132.000 ₫');
  assert.equal(rows[0].plan, 'Google AI Plus');
  assert.equal(rows[0].billingPeriod, 'P1M');
  assert.equal(rows[0].source, 'page');
  assert.equal(isNetworkOffer(rows[0]), true);
});

test('a detailed bootstrap price supersedes a generic jslog fallback', () => {
  const detailed = extractBootstrapOffers(bootstrap([plans[0]]));
  const fallback = {
    ...detailed[0], basePlanId: null, price: '132.000 ₫',
    phaseIndex: null, priceMicros: null, source: 'page',
  };
  const merged = uniqueNetworkOffers([fallback, ...detailed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'bootstrap');
});

test('AI Plus is classified correctly from a nested div card', () => {
  const parsed = analyzeOfferText('132.000 ₫ /tháng Đăng ký Google AI Plus', 'page');
  assert.equal(parsed?.plan, 'Google AI Plus');
  assert.equal(parsed?.price, '132.000 ₫');

  class FakeElement {
    constructor(text, parent = null) {
      this.innerText = text;
      this.textContent = text;
      this.parentElement = parent;
    }
    closest() { return null; }
    getClientRects() { return [1]; }
  }
  globalThis.HTMLElement = FakeElement;
  const parent = new FakeElement('132.000 ₫ /tháng Đăng ký Google AI Plus');
  const button = new FakeElement('Đăng ký Google AI Plus', parent);
  const doc = {
    body: {},
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    querySelectorAll(selector) {
      return selector.includes('article') ? [] : [button];
    },
  };
  const offers = collectVisibleOffers(doc);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].plan, 'Google AI Plus');
  assert.equal(offers[0].price, '132.000 ₫');
  delete globalThis.HTMLElement;
});

test('Google One content script automatically sends bootstrap offers to tab storage', () => {
  const page = readFileSync(new URL('../entrypoints/google-one.content.ts', import.meta.url), 'utf8');
  const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  const popup = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');
  assert.match(page, /extractBootstrapOffers/);
  assert.match(page, /extractJslogOffers/);
  assert.match(page, /G1_BOOTSTRAP_CAPTURE/);
  assert.match(page, /captureAll\(\)/);
  assert.match(background, /G1_BOOTSTRAP_CAPTURE/);
  assert.match(popup, /G1_CAPTURE_GET/);
});
