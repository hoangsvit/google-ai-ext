import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeOfferText, dedupeOffers } from '../lib/offers.ts';

test('identifies discounted 3-month Ultra offer', () => {
  const offer = analyzeOfferText('Google AI Ultra 30 TB special offer: $19.99/month for the first 3 months');
  assert.equal(offer.plan, 'Google AI Ultra');
  assert.equal(offer.storage, '30 TB');
  assert.equal(offer.price, '$19.99');
  assert.equal(offer.period, '3 months');
  assert.equal(offer.kind, 'discount');
});

test('identifies explicitly free trial', () => {
  const offer = analyzeOfferText('Google AI Pro 2TB Free trial for 12 months');
  assert.equal(offer.kind, 'free-trial');
  assert.equal(offer.period, '12 months');
});

test('does not label ordinary paid price as discount', () => {
  const offer = analyzeOfferText('Google One 2 TB $9.99 monthly');
  assert.equal(offer.kind, 'paid');
  assert.equal(offer.discount, null);
});

test('parses Vietnamese offer', () => {
  const offer = analyzeOfferText('Google AI Ultra 30 TB, ưu đãi giảm 75% trong 3 tháng: 499.000 ₫/tháng');
  assert.equal(offer.kind, 'discount');
  assert.equal(offer.discount, '75%');
  assert.equal(offer.price, '499.000 ₫');
});

test('does not invent offers from an isolated SKU', () => {
  assert.equal(analyzeOfferText('g1.ai.ultra.3months_ip_90p.acq'), null);
});

test('does not treat merely mentioning three months as a promotion', () => {
  const offer = analyzeOfferText('Google One 20 TB $20 for 3 months');
  assert.equal(offer.kind, 'paid');
});

test('deduplicates offer cards', () => {
  const offer = analyzeOfferText('Google One 20 TB $10/month');
  assert.equal(dedupeOffers([offer, offer]).length, 1);
});

test('recognizes zero VND pricing as free instead of unknown', () => {
  const offer = analyzeOfferText('Google One 2 TB 0 ₫/tháng');
  assert.equal(offer.price, '0 ₫');
  assert.equal(offer.kind, 'free-trial');
});
