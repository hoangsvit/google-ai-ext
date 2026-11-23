import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { REFERENCE_SKUS, buildTrySkuList } from '../lib/sku-catalog.ts';

const row = (productId, price, source='bootstrap') => ({
  productId, plan:'Google AI Pro', basePlanId:'monthly',
  offerId:null, price, currency:'VND', billingPeriod:'P1M', source,
  phaseIndex:0, priceMicros:null,
});

test('all 10 historical SKU examples display even when no network offers arrive', () => {
  const data=buildTrySkuList([]);
  assert.equal(data.length,10);
  assert.equal(REFERENCE_SKUS.length,10);
  assert.equal(data.every(v=>v.observedNow === false),true);
  assert.ok(data.some(v=>v.productId==='g1.ai.pro'));
  assert.ok(data.some(v=>v.productId==='g1.play.2tb.ai.student' && v.expectedPrice==='122.000 ₫'));
});

test('live offers merge into historical catalog with truthful session labels', () => {
  const data=buildTrySkuList([
    row('g1.2tb.ai','489.000 ₫'),
    row('g1.2tb.ai','489.000 ₫','response'),
    row('g1.play.sapphire','159.000 ₫'),
    row('g1.play.example.new','199.000 ₫'),
  ]);
  assert.equal(data.length,11);
  assert.equal(data.filter(x=>x.productId==='g1.2tb.ai').length,1);
  assert.equal(data.find(x=>x.productId==='g1.2tb.ai')?.observedNow,true);
  assert.equal(data.find(x=>x.productId==='g1.ai.pro')?.observedNow,false);
  assert.equal(data.find(x=>x.productId==='g1.play.example.new')?.observedNow,true);
});

test('single Try click only initiates matching official entry CTA, not payment', () => {
  const page=readFileSync(new URL('../entrypoints/google-one.content.ts',import.meta.url),'utf8');
  const popup=readFileSync(new URL('../entrypoints/popup/main.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../entrypoints/popup/index.html',import.meta.url),'utf8');
  assert.match(page,/raw\.kind === 'G1_SKU_TRY'/);
  assert.match(page,/target\.click\(\)/);
  assert.match(page,/matches\.length !== 1/);
  assert.match(popup,/kind: 'G1_SKU_TRY'/);
  assert.match(popup,/skuTryList\.append\(card\)/);
  assert.match(html,/id="sku-try-list"/);
  assert.doesNotMatch(popup,/G1_SKU_PREVIEW|G1_SKU_OPEN/);
});
