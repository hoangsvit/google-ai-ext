import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractHarNetworkOffers, extractNetworkOffers, isNetworkOffer,
} from '../lib/network-offers.ts';
import { assessOffers, summarizeAssessments } from '../lib/offer-assessment.ts';

// Synthetic equivalent of the latest HAR's nested Google RPC envelope.
// No real Google auth tokens, cookies, account names or purchase IDs are included.
const normalProduct = {
  productId: 'g1.20tb.v2',
  type: 'subs',
  title: 'Google AI Ultra (20 TB) (Google One)',
  name: 'Google AI Ultra (20 TB)',
  subscriptionOfferDetails: [{
    basePlanId: 'p1m',
    pricingPhases: [{
      priceAmountMicros: 2250000000000,
      priceCurrencyCode: 'VND',
      formattedPrice: '2.250.000 \u00a0₫',
      billingPeriod: 'P1M',
      recurrenceMode: 1,
    }],
  }],
};

function rpcEnvelope(product) {
  return JSON.stringify([[['bTEHyc', JSON.stringify([
    null, [null, ['synthetic-placeholder'], 4], 1,
    [product.productId, JSON.stringify(product), null, 5],
  ]), null, 'generic']]]);
}

function syntheticHar() {
  const fReq = new URLSearchParams({ 'f.req': rpcEnvelope(normalProduct) }).toString();
  return { log: { entries: [
    {
      request: { url: 'https://one.google.com/u/3/_/SubscriptionsManagementUi/data/batchexecute?rpcids=bTEHyc',
        postData: { text: fReq } },
      response: { content: { text: ")]}'\n[]" } },
    },
    {
      request: { url: 'https://tokenized.play.google.com/_/PlayCommerceAcquireUi/data/batchexecute',
        postData: { text: '[[["subs:com.google.android.apps.subscriptions.red:g1.20tb.v2",21]]]' } },
      response: { content: { text: ")]}'\n[]" } },
    },
    {
      request: { url: 'https://play.google.com/log',
        postData: { text: 'g1.unrelated.product' } },
      response: { content: { text: '' } },
    },
  ] } };
}

test('latest-HAR-shaped paid monthly product is not mislabeled as promotional', () => {
  const found = extractHarNetworkOffers(syntheticHar());
  const row = found.find((offer) => offer.basePlanId === 'p1m');
  assert.ok(row);
  assert.equal(row.productId, 'g1.20tb.v2');
  assert.equal(row.offerId, null);
  assert.equal(row.billingPeriod, 'P1M');
  assert.equal(row.priceMicros, '2250000000000');
  assert.equal(row.price, '2.250.000 ₫');
  assert.equal(row.phaseIndex, 0);
  const assessed = assessOffers(found);
  assert.equal(assessed.length, 1);
  assert.equal(assessed[0].kind, 'standard');
  assert.equal(summarizeAssessments(assessed).candidates, 0);
});

test('actual two-phase introductory pricing is recognized from pricing phases', () => {
  const product = {
    productId: 'g1.ai.ultra.promo',
    title: 'Google AI Ultra',
    subscriptionOfferDetails: [{
      basePlanId: 'monthly',
      offerId: 'intro-3m',
      pricingPhases: [
        { priceAmountMicros: 19990000, priceCurrencyCode: 'USD',
          formattedPrice: '$19.99', billingPeriod: 'P3M' },
        { priceAmountMicros: 199990000, priceCurrencyCode: 'USD',
          formattedPrice: '$199.99', billingPeriod: 'P1M' },
      ],
    }],
  };
  const result = assessOffers(extractNetworkOffers(rpcEnvelope(product), 'request'));
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'introductory');
  assert.equal(result[0].initialPrice, '$19.99');
  assert.equal(result[0].laterPrice, '$199.99');
  assert.equal(result[0].phaseCount, 2);
});

test('one free and one paid phase is a trial, not a permanent free tier', () => {
  const product = {
    productId: 'g1.play.ai.pro',
    subscriptionOfferDetails: [{
      basePlanId: 'monthly', offerId: 'trial',
      pricingPhases: [
        { priceAmountMicros: 0, priceCurrencyCode: 'USD',
          formattedPrice: '$0.00', billingPeriod: 'P1M' },
        { priceAmountMicros: 19990000, priceCurrencyCode: 'USD',
          formattedPrice: '$19.99', billingPeriod: 'P1M' },
      ],
    }],
  };
  const result = assessOffers(extractNetworkOffers(rpcEnvelope(product), 'response'));
  assert.equal(result[0].kind, 'trial');
  assert.equal(result[0].laterPrice, '$19.99');
});

test('offer ID by itself is only a candidate, never proof of discount eligibility', () => {
  const product = {
    productId: 'g1.play.20tb',
    subscriptionOfferDetails: [{
      basePlanId: 'monthly', offerId: 'account-specific',
      pricingPhases: [{ priceAmountMicros: 10000000,
        priceCurrencyCode: 'USD', formattedPrice: '$10.00', billingPeriod: 'P1M' }],
    }],
  };
  const result = assessOffers(extractNetworkOffers(rpcEnvelope(product), 'request'));
  assert.equal(result[0].kind, 'offer-candidate');
  assert.equal(result[0].laterPrice, null);
  assert.equal(summarizeAssessments(result).confirmedIntroductoryPhases, 0);
});

test('extractor does not serialize billing secrets when new pricing metadata is enabled', () => {
  const secret = 'NeverCommitGoogleBillingToken987654321';
  const data = {
    ...normalProduct,
    skuDetailsToken: secret,
    subscriptionOfferDetails: [{
      ...normalProduct.subscriptionOfferDetails[0],
      offerIdToken: secret,
    }],
  };
  const serialized = JSON.stringify(extractNetworkOffers(rpcEnvelope(data), 'request'));
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('offerIdToken'), false);
});

test('rejects malformed phase price and untrusted bridge data', () => {
  const normal = extractNetworkOffers(rpcEnvelope(normalProduct), 'request')[0];
  assert.equal(isNetworkOffer(normal), true);
  assert.equal(isNetworkOffer({ ...normal, priceMicros: '1;DROP' }), false);
  assert.equal(isNetworkOffer({ ...normal, phaseIndex: 999 }), false);
});
