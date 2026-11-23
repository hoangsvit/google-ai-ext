import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const css = readFileSync(new URL('../entrypoints/popup/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');

test('Chrome popup has fixed intrinsic 420px width', () => {
  assert.match(css, /html,body\{width:420px;min-width:420px;max-width:420px;/);
  assert.doesNotMatch(css, /max-width:\s*100vw/i);
});
test('popup shows live network and DOM, not demo or manual scan controls', () => {
  for (const id of ['open','reload','network-results','dom-results','har-file',
    'live-state','official-choice','official-preview','official-launch']) {
    assert.match(html,new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html,/id="scan"|id="demo-offer"|Response Rewrite Lab|Thử gói DEMO/i);
  assert.match(html,/Không cần bấm Quét/);
});
