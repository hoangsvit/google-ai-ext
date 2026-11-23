import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const page=readFileSync(new URL('../entrypoints/google-one.content.ts',import.meta.url),'utf8');
const popup=readFileSync(new URL('../entrypoints/popup/main.ts',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../lib/sku-catalog.ts',import.meta.url),'utf8');

test('the popup asks the live Google tab for actual SKU metadata before marking all references stale',()=>{
  assert.match(page,/G1_PAGE_SNAPSHOT_RESULT/);
  assert.match(page,/kind === 'G1_PAGE_SNAPSHOT'/);
  assert.match(page,/visibleSkus: currentVisibleSkuIds\(\)/);
  assert.match(page,/offers: latestEmbedded/);
  assert.match(popup,/kind: 'G1_PAGE_SNAPSHOT'/);
  assert.match(popup,/pageSkuOffers = Array\.isArray\(value\.offers\)/);
  assert.match(popup,/visibleSkuIds = Array\.isArray\(value\.visibleSkus\)/);
  assert.match(popup,/buildTrySkuList\(currentSkuRows\(\)\)/);
  assert.match(popup,/visibleSkuIds\.includes\(choice\.productId\)/);
  assert.match(catalog,/SKU tham khảo|observedNow/);
});

test('initial Google One data script can be reparsed if Google fills it after first read',()=>{
  assert.match(page,/bootstrapCache = new WeakMap/);
  assert.match(page,/cached\.size !== content\.length/);
  assert.match(page,/size: content\.length, rows: extracted/);
});

test('one click tries a live monthly or yearly tab first, never changes billing outside Google UI',()=>{
  assert.match(page,/raw\.kind === 'G1_SKU_TRY'/);
  assert.match(page,/billingPeriod === 'P1Y'/);
  assert.match(page,/billingPeriod === 'P1M'/);
  assert.match(page,/role="tab"/);
  assert.match(page,/hằng năm\|hàng năm\|yearly\|annual/);
  assert.match(page,/hằng tháng\|hàng tháng\|monthly/);
  assert.match(page,/tabs\[0\]!\.click\(\)/);
  assert.match(page,/matches = findSkuCta\(selection\)/);
  assert.match(page,/target\.click\(\)/);
  assert.match(page,/Chưa gửi yêu cầu/);
  assert.doesNotMatch(page,/fetch\(|PlayCommerceAcquireUi|offerIdToken/);
});

test('never fabricate a successful purchase or HTTP success from a programmatic click',()=>{
  assert.doesNotMatch(page,/mua thành công|đăng ký thành công|thanh toán thành công/i);
  assert.match(page,/Xem checkout để biết giá và điều kiện thật/);
});
