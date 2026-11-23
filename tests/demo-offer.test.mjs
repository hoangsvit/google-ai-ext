import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDemoOffer, DEMO_PRODUCT_ID, DEMO_OFFER_ID } from '../lib/demo-offer.ts';
import { assessOffers, summarizeAssessments } from '../lib/offer-assessment.ts';
import { isNetworkOffer } from '../lib/network-offers.ts';

test('demo emits one fictional offer with two pricing phases', () => {
  const rows = createDemoOffer();
  assert.equal(rows.length, 2);
  assert.equal(rows.every(isNetworkOffer), true);
  assert.equal(rows.every((row) => row.productId === DEMO_PRODUCT_ID), true);
  assert.equal(rows.every((row) => row.offerId === DEMO_OFFER_ID), true);
  assert.deepEqual(rows.map((row) => row.phaseIndex), [0, 1]);
  assert.deepEqual(rows.map((row) => row.price), ['$19.99', '$199.99']);
});

test('demo uses the real pipeline and classifies introductory price', () => {
  const assessed = assessOffers(createDemoOffer());
  assert.equal(assessed.length, 1);
  assert.equal(assessed[0].kind, 'introductory');
  assert.equal(assessed[0].initialPrice, '$19.99');
  assert.equal(assessed[0].laterPrice, '$199.99');
  assert.equal(summarizeAssessments(assessed).candidates, 1);
});

test('demo is opt-in in popup and never injected into live network responses', () => {
  const popup = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../entrypoints/google-network-main.content.ts', import.meta.url), 'utf8');
  assert.match(html, /id="demo-offer"/);
  assert.match(html, /id="demo-note"/);
  assert.match(popup, /demoOffer\.addEventListener\('click'/);
  assert.match(popup, /renderNetwork\(createDemoOffer\(selected\), true\)/);
  assert.doesNotMatch(main, /createDemoOffer|DEMO_PRODUCT_ID|DEMO_OFFER_ID/);
  assert.doesNotMatch(popup, /browser\.runtime\.sendMessage\([^\n]*createDemoOffer/);
});

test('three additional demo variants model the latest HAR without real product IDs', () => {
  const pro = createDemoOffer('pro-5tb');
  assert.equal(pro.length, 2);
  assert.deepEqual(pro.map((r) => r.basePlanId), ['monthly', 'monthly-transit']);
  assert.deepEqual(pro.map((r) => r.price), ['489.000 ₫', '122.000 ₫']);
  assert.equal(pro.every((r) => r.productId.startsWith('g1.demo.')), true);
  const yt = createDemoOffer('pro-youtube');
  const plus = createDemoOffer('plus-400gb');
  assert.equal(yt[0]?.price, '159.000 ₫');
  assert.equal(plus[0]?.price, '132.000 ₫');
  assert.equal(yt.every((r) => r.productId.startsWith('g1.demo.')), true);
  assert.equal(plus.every((r) => r.productId.startsWith('g1.demo.')), true);
});
