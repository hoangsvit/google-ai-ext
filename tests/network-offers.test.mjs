import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractNetworkOffers, extractHarNetworkOffers,
  isGoogleOneCommerceUrl, isNetworkOffer,
} from '../lib/network-offers.ts';

const product = {
  productId: 'g1.20tb.v2',
  title: 'Google AI Ultra (20 TB) (Google One)',
  subscriptionOfferDetails: [{
    basePlanId: 'p1m',
    pricingPhases: [{
      priceAmountMicros: 2250000000000,
      priceCurrencyCode: 'VND',
      formattedPrice: '2.250.000 ₫',
      billingPeriod: 'P1M',
    }],
  }],
};
// Synthetic, sanitized data matching the structural fields seen in the submitted HAR.
// No Google session cookies, request IDs, offer tokens, or private account data.
const nested = JSON.stringify([[['bTEHyc', JSON.stringify([null, [product]])]]]);
const har = {
  log: { entries: [
    { request: { url: 'https://one.google.com/u/3/_/SubscriptionsManagementUi/data/batchexecute',
      postData: { text: new URLSearchParams({ 'f.req': nested }).toString() } },
      response: { content: { text: ")]}'\n" + nested } },
    },
    { request: { url: 'https://play.google.com/log',
      postData: { text: 'g1.disallowed.product' } },
      response: { content: { text: '' } } },
  ] },
};

test('recognizes exact allowlisted commerce URLs', () => {
  assert.equal(isGoogleOneCommerceUrl('https://one.google.com/u/3/_/SubscriptionsManagementUi/data/batchexecute?rpcids=abc'), true);
  assert.equal(isGoogleOneCommerceUrl('https://tokenized.play.google.com/_/PlayCommerceAcquireUi/data/batchexecute'), true);
  assert.equal(isGoogleOneCommerceUrl('https://play.google.com/log'), false);
  assert.equal(isGoogleOneCommerceUrl('https://one.google.com.evil.test/SubscriptionsManagementUi/data/batchexecute'), false);
});

test('extracts structured subscription metadata from nested request safely', () => {
  const offers = extractNetworkOffers(har.log.entries[0].request.postData.text, 'request');
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], {
    productId: 'g1.20tb.v2', plan: 'Google AI Ultra (20 TB) (Google One)',
    basePlanId: 'p1m', offerId: null,
    price: '2.250.000 ₫', currency: 'VND', billingPeriod: 'P1M', source: 'request',
  });
});

test('reads XSSI-protected RPC response', () => {
  assert.equal(extractNetworkOffers(")]}'\n" + nested, 'response')[0]?.productId, 'g1.20tb.v2');
});

test('recognizes response-only positional SKU without making up a price', () => {
  const offers = extractNetworkOffers('[[["subs:com.google.android.apps.subscriptions.red:g1.20tb.v2",21]]]', 'response');
  assert.equal(offers[0]?.productId, 'g1.20tb.v2');
  assert.equal(offers[0]?.price, null);
  assert.equal(offers[0]?.offerId, null);
});

test('does not expose session keys, token strings or raw payload', () => {
  const secret = 'VeryPrivatePaymentToken_abcdefgh0123456789';
  const raw = JSON.stringify([{ ...product, offerIdToken: secret, accessToken: secret }]);
  const output = JSON.stringify(extractNetworkOffers(raw, 'request'));
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes('offerIdToken'), false);
});

test('extracts HAR data without collecting log requests', () => {
  const results = extractHarNetworkOffers(har);
  assert.equal(results.some((offer) => offer.productId === 'g1.20tb.v2'), true);
  assert.equal(results.some((offer) => offer.productId === 'g1.disallowed.product'), false);
});

test('rejects oversize payload and invalid bridge messages', () => {
  assert.deepEqual(extractNetworkOffers('x'.repeat(350_001), 'request'), []);
  assert.equal(isNetworkOffer({ productId: 'g1.20tb.v2', source: 'request',
    plan: null, basePlanId: 'p1m', offerId: null, price: null, currency: null, billingPeriod: null }), true);
  assert.equal(isNetworkOffer({ productId: 'g1.20tb.v2', source: 'request',
    plan: null, basePlanId: null, offerId: 'NOT SAFE /', price: null, currency: null, billingPeriod: null }), false);
});
