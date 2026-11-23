import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  skuChoicesFromCapturedRows, validSkuSelection, matchesOfficialSkuCta,
} from '../lib/sku-selection.ts';

const row = (productId, price, source='bootstrap', basePlanId='monthly') => ({
  productId, plan:'Google AI Pro', basePlanId,
  offerId:null, price, currency:'VND', billingPeriod:'P1M', source,
  priceMicros:null, phaseIndex:0,
});

test('offer dropdown comes from real captured metadata; no fictional or price-free SKU',()=>{
  const result=skuChoicesFromCapturedRows([
    row('g1.2tb.ai','489.000 ₫'),
    row('g1.2tb.ai','489.000 ₫','response'),
    row('g1.helium.m','132.000 ₫'),
    row('g1.20tb.v2','2.250.000 ₫'),
    {...row('g1.demo.ultra','19.99 USD'),currency:'USD'},
    {...row('g1.play.2tb.ai.student','489.000 ₫'),price:null},
  ]);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(x=>x.productId),
    ['g1.2tb.ai','g1.helium.m','g1.20tb.v2']);
});

test('exact SKU plus price and official Vietnamese CTA must match',()=>{
  const selection={
    productId:'g1.2tb.ai',expectedPrice:'489.000 ₫',currency:'VND',
    basePlanId:'p1m',billingPeriod:'P1M',
  };
  const label='Đăng ký Google AI Pro Đăng ký Google AI Pro';
  const jslog='click;[[\"g1.2tb.ai\",\"account\"]]';
  assert.equal(validSkuSelection(selection),true);
  assert.equal(matchesOfficialSkuCta(
    jslog,label,'Google AI Pro · 5 TB · 489.000 ₫ /tháng '+label,selection),true);
  assert.equal(matchesOfficialSkuCta(
    'click;[[\"g1.helium.m\"]]',label,'489.000 ₫ '+label,selection),false);
  assert.equal(matchesOfficialSkuCta(
    jslog,label,'Google AI Pro · 122.000 ₫ /tháng '+label,selection),false);
  assert.equal(matchesOfficialSkuCta(
    jslog,label,'Google AI Pro · 1.489.000 ₫ /tháng '+label,selection),false);
  assert.equal(matchesOfficialSkuCta(
    jslog,'Thanh toán ngay','489.000 ₫ '+label,selection),false);
  assert.equal(matchesOfficialSkuCta(
    jslog,label,'489.000 ₫ '+label,{...selection,productId:'g1.demo.ultra.3m'}),false);
});

test('reject malformed or non-VND cart selection before touching live page',()=>{
  const good={productId:'g1.helium.m',expectedPrice:'132.000 ₫',
    currency:'VND',basePlanId:null,billingPeriod:'P1M'};
  assert.equal(validSkuSelection(good),true);
  for (const payload of [
    {...good,productId:'other'},
    {...good,currency:'USD'},
    {...good,basePlanId:'../../../etc'},
    {...good,expectedPrice:''},
    {...good,expectedPrice:'x'.repeat(50)},
    {...good,billingPeriod:'never'},
    null,
  ]) assert.equal(validSkuSelection(payload),false);
});

test('page performs only a two-stage official CTA click, not private billing RPC replay',()=>{
  const source=readFileSync(new URL('../entrypoints/google-one.content.ts',import.meta.url),'utf8');
  const popup=readFileSync(new URL('../entrypoints/popup/main.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../entrypoints/popup/index.html',import.meta.url),'utf8');
  assert.match(source,/kind === 'G1_SKU_PREVIEW'/);
  assert.match(source,/kind === 'G1_SKU_OPEN'/);
  assert.match(source,/matchesOfficialSkuCta/);
  assert.match(source,/lastSkuPreview/);
  assert.match(source,/target\.click\(\)/);
  assert.doesNotMatch(source,/fetch\(|PlayCommerceAcquireUi|offerIdToken/);
  assert.match(popup,/buildTrySkuList\(currentSkuRows\(\)\)/);
  assert.match(popup,/G1_SKU_TRY/);
  assert.match(source,/G1_SKU_TRY/);
  assert.match(html,/Danh sách SKU/);
  assert.doesNotMatch(html,/option value="pro-122"|demo-offer/);
});
