import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../entrypoints/popup/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');

test('Chrome popup has fixed 420px intrinsic width instead of shrinking to viewport', () => {
  assert.match(css, /html\s*\{[^}]*width:\s*420px;[^}]*min-width:\s*420px;/s);
  assert.match(css, /body\s*\{[^}]*width:\s*420px;[^}]*min-width:\s*420px;/s);
  assert.doesNotMatch(css, /max-width:\s*100vw/i);
});

test('popup uses bounded vertical scroll while keeping primary actions present', () => {
  assert.match(css, /\.app\s*\{[^}]*max-height:\s*580px;[^}]*overflow-y:\s*auto;/s);
  for (const id of ['scan', 'open', 'network-refresh', 'har-file']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('popup title is compact and avoids forced long lines', () => {
  assert.match(html, /<h1>Google One<br \/><em>Offer Explorer\.<\/em><\/h1>/);
});
