import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { extractHarNetworkOffers } from '../lib/network-offers.ts';
const get=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('network hooks run at document_start and report metadata-free RPCs',()=>{
  const main=get('entrypoints/google-network-main.content.ts');
  const bridge=get('entrypoints/google-network-bridge.content.ts');
  assert.match(main,/runAt:\s*'document_start'/);
  assert.match(main,/window\.fetch\s*=/);
  assert.match(main,/XMLHttpRequest\.prototype\.send\s*=/);
  assert.match(main,/activity:\s*true/);
  assert.match(bridge,/G1_NETWORK_CAPTURE/);
  assert.match(bridge,/activity:\s*true/);
});
test('DOM observer captures Google One plan cards automatically',()=>{
  const page=get('entrypoints/google-one.content.ts');
  assert.match(page,/new MutationObserver\(scheduleCapture\)/);
  assert.match(page,/G1_DOM_CAPTURE/);
  assert.match(page,/captureVisible\(\)/);
  assert.doesNotMatch(page,/GOOGLE_ONE_OFFERS_SCAN/);
});
test('background caches sanitized offers in MV3 session memory and updates badge',()=>{
  const bg=get('entrypoints/background.ts');
  const config=get('wxt.config.ts');
  assert.match(bg,/browser\.storage\.session\.(?:get|set)/);
  assert.match(bg,/browser\.tabs\.onRemoved/);
  assert.match(bg,/browser\.action\.setBadgeText/);
  assert.match(bg,/G1_DOM_CAPTURE/);
  assert.match(bg,/G1_NETWORK_CAPTURE/);
  assert.match(config,/'storage'/);
});
test('popup reads session captures and rerenders live without manual scanning',()=>{
  const popup=get('entrypoints/popup/main.ts');
  assert.match(popup,/G1_CAPTURE_GET/);
  assert.match(popup,/browser\.storage\.onChanged/);
  assert.match(popup,/void loadLive\(\)/);
  assert.doesNotMatch(popup,/scanTab|createDemoOffer|Response Rewrite Lab/);
});
test('demo fixtures and local response lab are fully absent',()=>{
  for(const file of [
    'lib/demo-offer.ts','lib/response-lab.ts',
    'entrypoints/response-lab/index.html','entrypoints/response-lab/main.ts',
    'entrypoints/response-lab/style.css',
    'tests/demo-offer.test.mjs','tests/response-lab.test.mjs']) {
    assert.equal(existsSync(new URL('../'+file,import.meta.url)),false,file);
  }
});
test('commerce HAR without SKU must not fabricate an offer',()=>{
  const har={log:{entries:[{
    request:{url:'https://one.google.com/u/3/_/SubscriptionsManagementUi/data/batchexecute',
      postData:{text:'f.req=%5B%5B%5D%5D'}},
    response:{content:{text:")]}'\n[]"}},
  }]}};
  assert.deepEqual(extractHarNetworkOffers(har),[]);
});
