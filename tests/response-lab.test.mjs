import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  LAB_CATALOG_URL, LAB_CHECKOUT_URL, createLabTransport,
  createLabResponseRewriter, readLabPayload,
} from '../lib/response-lab.ts';

test('disabled rewrite returns original Response unchanged', async () => {
  const raw = createLabTransport();
  const wrapped = createLabResponseRewriter(raw, () => false, () => 'pro-5tb');
  const result = await readLabPayload(await wrapped(LAB_CATALOG_URL));
  assert.equal(result.productId, 'g1.demo.original');
  assert.equal(result.plans[0]?.phases[0]?.price, '489.000 ₫');
});

test('enabled rewrite substitutes the actual Fetch Response object in the lab only', async () => {
  const raw = createLabTransport();
  const wrapped = createLabResponseRewriter(raw, () => true, () => 'pro-5tb');
  const response = await wrapped(LAB_CATALOG_URL);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-eplus-response-rewrite'), 'demo-only');
  const result = await readLabPayload(response);
  assert.equal(result.productId, 'g1.demo.ai-pro-5tb');
  assert.equal(result.plans.length, 2);
  assert.deepEqual(result.plans.map((plan) => plan.phases[0]?.price),
    ['489.000 ₫', '122.000 ₫']);
  assert.equal((await readLabPayload(await raw(LAB_CATALOG_URL))).productId, 'g1.demo.original');
});

test('other demo variants can be rewritten without using real Google IDs', async () => {
  for (const variant of ['pro-youtube', 'plus-400gb', 'ultra-3m']) {
    const raw = createLabTransport();
    const wrapped = createLabResponseRewriter(raw, () => true, () => variant);
    const payload = await readLabPayload(await wrapped(LAB_CATALOG_URL));
    assert.equal(payload.productId.startsWith('g1.demo.'), true);
    assert.equal(payload.labOnly, true);
  }
});

test('real Google One and Google Play URLs remain byte-for-byte untouched', async () => {
  let invocations = 0;
  const actualJson = JSON.stringify({
    productId: 'g1.20tb.v2', billingToken: 'DO_NOT_TOUCH',
  });
  const delegate = (async () => {
    invocations++;
    return new Response(actualJson, { headers: { 'content-type': 'application/json' } });
  });
  const wrapped = createLabResponseRewriter(delegate, () => true, () => 'pro-5tb');
  const realUrls = [
    'https://one.google.com/u/3/_/SubscriptionsManagementUi/data/batchexecute',
    'https://tokenized.play.google.com/_/PlayCommerceAcquireUi/data/batchexecute',
    LAB_CHECKOUT_URL,
  ];
  for (const url of realUrls) {
    const response = await wrapped(url);
    assert.equal(await response.text(), actualJson);
    assert.equal(response.headers.get('x-eplus-response-rewrite'), null);
  }
  assert.equal(invocations, realUrls.length);
});

test('invalid local transport cannot make a real outbound fetch', async () => {
  const transport = createLabTransport();
  await assert.rejects(transport('https://one.google.com/ai'), /restricted/);
  await assert.rejects(transport(LAB_CHECKOUT_URL), /restricted/);
});

test('response lab page exists and popup opens only this extension page', () => {
  const popup = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
  const lab = readFileSync(new URL('../entrypoints/response-lab/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="open-rewrite-lab"/);
  assert.match(popup, /browser\.runtime\.getURL\('\/response-lab\.html'\)/);
  assert.match(lab, /LAB ONLY/);
  assert.doesNotMatch(lab, /https:\/\/one\.google\.com\/api/);
});
