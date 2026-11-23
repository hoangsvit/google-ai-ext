import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrySkuList } from '../lib/sku-catalog.ts';
import { countUniqueSku, filterSkuRows } from '../lib/sku-ui.ts';

const rows = buildTrySkuList([]);

test('the SKU Explorer starts with 9 unique products and 10 price/base-plan choices',()=>{
  assert.equal(rows.length,10);
  assert.equal(countUniqueSku(rows),9);
  assert.equal(filterSkuRows(rows,'all','',[]).length,10);
});

test('Commerce filter covers historical Play Commerce evidence without inventing eligibility',()=>{
  const result=filterSkuRows(rows,'commerce','',[]);
  assert.equal(countUniqueSku(result),4);
  assert.equal(result.length,5,'two prices are known for the Pro student SKU');
  assert.ok(result.every(v=>v.evidence==='commerce-har'));
  assert.ok(result.every(v=>v.observedNow===false));
});

test('HTML filter shows only historical HTML-only catalog records',()=>{
  const result=filterSkuRows(rows,'catalog','',[]);
  assert.equal(result.length,5);
  assert.ok(result.some(v=>v.productId==='g1.ai.pro'));
  assert.ok(result.every(v=>v.evidence==='html-catalog'));
});

test('live tab filter reflects current-session evidence instead of old HARs',()=>{
  assert.deepEqual(filterSkuRows(rows,'live','',[]),[]);
  const visible=filterSkuRows(rows,'live','',['g1.2tb.ai','g1.helium.m']);
  assert.equal(countUniqueSku(visible),2);
  assert.ok(visible.every(v=>['g1.2tb.ai','g1.helium.m'].includes(v.productId)));
});

test('search works for SKU, accented plan name, price and Base Plan',()=>{
  assert.equal(filterSkuRows(rows,'all','g1.play.helium.student',[]).length,1);
  assert.equal(filterSkuRows(rows,'all','122.000',[]).length,1);
  assert.equal(filterSkuRows(rows,'all','monthly-transit',[]).length,2);
  assert.equal(filterSkuRows(rows,'all','Google AI Ultra',[]).length,2);
  assert.equal(filterSkuRows(rows,'commerce','g1.helium.a',[]).length,0);
  assert.equal(filterSkuRows(rows,'all','khong co sku',[]).length,0);
});

test('popup wires search and every source tab, and does not add synthetic checkout',async()=>{
  const {readFileSync}=await import('node:fs');
  const main=readFileSync(new URL('../entrypoints/popup/main.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../entrypoints/popup/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../entrypoints/popup/style.css',import.meta.url),'utf8');
  assert.match(main,/skuSearch\.addEventListener\('input'/);
  assert.match(main,/filterSkuRows\(fullList, selectedFilter, skuSearch\.value, visibleSkuIds\)/);
  assert.match(main,/item\.setAttribute\('aria-pressed'/);
  assert.match(main,/renderTrialSummary\(\)/);
  assert.match(main,/skuTryResults/);
  assert.match(html,/Phân tích kỹ thuật &amp; HAR/);
  assert.match(css,/\\.filters\\{display:grid/);
  assert.match(css,/\\.sku-trial-list\\{display:flex;flex-direction:column;gap:8px\}/);
  assert.doesNotMatch(main,/offerIdToken|skuDetailsToken/);
});
