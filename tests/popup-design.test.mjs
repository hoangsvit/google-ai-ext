import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../entrypoints/popup/style.css', import.meta.url), 'utf8');
const code = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');

test('compact 420px popup reproduces the approved single-column design', () => {
  assert.match(css, /html,body\{width:420px;min-width:420px;max-width:420px;/);
  assert.match(css, /\.app\{height:600px;max-height:600px;/);
  assert.match(html, /ePlus\.DEV/);
  assert.match(html, /Google One <span class="title-dash">—<\/span> SKU Explorer/);
  assert.match(css, /\.google-logo\{/);
  assert.match(css, /linear-gradient\(110deg,#6550ea,#9259fa\)/);
  assert.match(html, /Google AI Toolkit/);
  assert.match(html, /one\.google\.com/);
  assert.match(html, /ⓘ/);
});

test('three counters distinguish unique SKUs, historical Commerce and price variants', () => {
  for(const id of ['sku-trial-count','commerce-sku-count','base-plan-count']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(code, /skuTrialCount\.textContent = String\(countUniqueSku\(fullList\)\)/);
  assert.match(code, /commerceSkuCount\.textContent = String\(countUniqueSku\(commerceItems\)\)/);
  assert.match(code, /basePlanCount\.textContent = String\(fullList\.length\)/);
});

test('real buttons and filter controls work, rather than decorative icon actions', () => {
  for(const id of ['open','reload','settings-toggle','help-toggle','show-trial',
                    'sku-page-prev','sku-page-next','sku-search']) {
    assert.match(html,new RegExp('id="' + id + '"'));
  }
  for(const snippet of [
    "skuPagePrev.addEventListener('click'",
    "skuPageNext.addEventListener('click'",
    "settingsToggle.addEventListener('click'",
    "showTrial.addEventListener('click'",
    "helpToggle.addEventListener('click'",
    "skuSearch.addEventListener('input'",
  ]) assert.ok(code.includes(snippet),snippet);
  assert.match(code,/copy\.addEventListener\('click'/);
  assert.match(code,/navigator\.clipboard\.writeText\(choice\.productId\)/);
  assert.match(code,/data-sku-filter/);
});

test('cards only display observed metadata and preserve safe per-SKU checkout behavior', () => {
  assert.match(code,/const PAGE_SIZE = 4/);
  assert.match(code,/const visibleItems = items\.slice\(pageStart, pageStart \+ PAGE_SIZE\)/);
  assert.match(code,/price\.append\(element\('strong', '', choice\.expectedPrice\)\)/);
  assert.match(code,/choice\.evidenceHar/);
  assert.match(code,/kind: 'G1_SKU_TRY'/);
  assert.match(code,/skuTryResults/);
  assert.match(html,/HTTP 200 không có nghĩa đã mua/);
  assert.doesNotMatch(code,/offerIdToken|skuDetailsToken/);
});

test('technical details and trial result are available but collapsed by default',()=>{
  assert.match(html,/<details id="technical-panel" class="advanced">/);
  assert.match(html,/<details id="trial-panel" class="trial-panel">/);
  assert.match(html,/<details id="help-panel" class="help-panel">/);
  assert.doesNotMatch(html,/<details id="(?:technical-panel|trial-panel)"[^>]*open/);
});
