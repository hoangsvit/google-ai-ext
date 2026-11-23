import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractNetworkOffers, extractHarNetworkOffers } from '../lib/network-offers.ts';
import { assessOffers } from '../lib/offer-assessment.ts';
import { compareBasePlans } from '../lib/base-plan-comparison.ts';

// Sanitized structural fixture from one.google.com(2).har; no cookies, tokens or
// transaction identifiers are copied from the user's capture.
const sapphire = {
  productId: 'g1.play.sapphire',
  title: 'Google AI Pro (5 TB) with YouTube Premium (Google One)',
  subscriptionOfferDetails: [{ basePlanId: 'monthly-transit', pricingPhases: [
    { formattedPrice: '159.000 ₫', priceCurrencyCode: 'VND',
      priceAmountMicros: 159000000000, billingPeriod: 'P1M' },
  ] }],
};
const aiPlus = {
  productId: 'g1.play.helium.student',
  title: 'Google AI Plus (400 GB) (Google One)',
  subscriptionOfferDetails: [{ basePlanId: 'monthly', pricingPhases: [
    { formattedPrice: '132.000 ₫', priceCurrencyCode: 'VND',
      priceAmountMicros: 132000000000, billingPeriod: 'P1M' },
  ] }],
};
const aiPro = {
  productId: 'g1.play.2tb.ai.student',
  title: 'Google AI Pro (5 TB) (Google One)',
  subscriptionOfferDetails: [
    { basePlanId: 'monthly', pricingPhases: [
      { formattedPrice: '489.000 ₫', priceCurrencyCode: 'VND',
        priceAmountMicros: 489000000000, billingPeriod: 'P1M' },
    ] },
    { basePlanId: 'monthly-transit', pricingPhases: [
      { formattedPrice: '122.000 ₫', priceCurrencyCode: 'VND',
        priceAmountMicros: 122000000000, billingPeriod: 'P1M' },
    ] },
  ],
};
function encodeRpc(products) {
  const nested = JSON.stringify([[['bTEHyc', JSON.stringify([products]), null]]]);
  return new URLSearchParams({ 'f.req': nested }).toString();
}
test('the new captured request shape exposes three actual products', () => {
  const raw = encodeRpc([sapphire, aiPro, aiPlus]);
  const har = { log: { entries: [{
    request: { url: 'https://one.google.com/_/SubscriptionsManagementUi/data/batchexecute',
      postData: { text: raw } },
    response: { content: { text: ")]}'\n[]" } },
  }] } };
  const rows = extractHarNetworkOffers(har);
  assert.deepEqual(new Set(rows.map((r) => r.productId)), new Set([
    'g1.play.sapphire', 'g1.play.2tb.ai.student', 'g1.play.helium.student',
  ]));
  assert.equal(rows.filter((r) => r.productId === 'g1.play.2tb.ai.student').length, 2);
  assert.deepEqual(new Set(rows.map((r) => r.price)), new Set([
    '159.000 ₫', '489.000 ₫', '122.000 ₫', '132.000 ₫',
  ]));
});
test('monthly and monthly-transit are alternatives, not introductory phases', () => {
  const rows = extractNetworkOffers(encodeRpc([aiPro]), 'request');
  assert.equal(rows.length, 2);
  assert.deepEqual(assessOffers(rows).map((o) => o.kind), ['standard', 'standard']);
  const comparisons = compareBasePlans(rows);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].higherBasePlanId, 'monthly');
  assert.equal(comparisons[0].lowerBasePlanId, 'monthly-transit');
  assert.equal(comparisons[0].higherPrice, '489.000 ₫');
  assert.equal(comparisons[0].lowerPrice, '122.000 ₫');
  assert.equal(comparisons[0].differencePercent, 75.1);
  assert.equal(comparisons[0].eligibility, 'unverified');
});
test('never compare unrelated products, currency or billing cycle', () => {
  const rows = extractNetworkOffers(encodeRpc([sapphire, aiPlus]), 'response');
  assert.deepEqual(compareBasePlans(rows), []);
  const modified = extractNetworkOffers(encodeRpc([aiPro]), 'request');
  modified[1]!.currency = 'USD';
  assert.deepEqual(compareBasePlans(modified), []);
  modified[1]!.currency = 'VND';
  modified[1]!.billingPeriod = 'P1Y';
  assert.deepEqual(compareBasePlans(modified), []);
});
