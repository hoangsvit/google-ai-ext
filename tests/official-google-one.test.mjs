import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  PLAN_CHOICES, isPlanChoiceId, isOfficialGoogleOneUrl,
  isSafePlanEntryLabel, matchesPlanText, matchesObservedPrice, isCandidateMatch,
} from '../lib/official-google-one.ts';

test('only exact official HTTPS Google One origin is approved', () => {
  for (const url of ['https://one.google.com/ai', 'https://one.google.com/about/google-ai-plans/']) {
    assert.equal(isOfficialGoogleOneUrl(url), true);
  }
  for (const url of ['http://one.google.com/ai', 'https://one.google.com.evil.test/ai',
    'https://play.google.com/checkout', 'javascript:alert(1)', 'https://one.google.com@evil.com/']) {
    assert.equal(isOfficialGoogleOneUrl(url), false);
  }
});

test('only allowlisted plans can be selected; spoofed demo identifiers cannot', () => {
  assert.equal(isPlanChoiceId('pro-122'), true);
  assert.equal(isPlanChoiceId('ultra'), true);
  assert.equal(isPlanChoiceId('g1.demo.ultra.3m'), false);
  assert.equal(isPlanChoiceId('g1.play.2tb.ai.student'), false);
  assert.equal(isPlanChoiceId('__proto__'), false);
  assert.equal(PLAN_CHOICES['pro-122'].priceDigits, '122000');
});

test('only introductory plan-selection CTA is clicked, never final payment controls', () => {
  for (const label of ['Get Pro', 'Get Ultra', 'Get Plus', 'Get started',
    'Chọn gói', 'Bắt đầu', 'Nâng cấp', 'Xem chi tiết']) {
    assert.equal(isSafePlanEntryLabel(label), true, label);
  }
  for (const label of ['Pay now', 'Confirm purchase', 'Subscribe now', 'Thanh toán',
    'Xác nhận', 'Mua ngay', 'Complete Purchase', 'Đặt mua', 'Đặt hàng']) {
    assert.equal(isSafePlanEntryLabel(label), false, label);
  }
});

test('match only the same plan and price shown in a compact card', () => {
  const context = 'Google AI Pro 5 TB 122.000 ₫ /tháng Get Pro';
  assert.equal(isCandidateMatch(context, 'Get Pro', 'pro-122'), true);
  assert.equal(isCandidateMatch(context, 'Get Pro', 'pro-489'), false);
  assert.equal(isCandidateMatch(context, 'Pay now', 'pro-122'), false);
  assert.equal(matchesObservedPrice('Giá 122.000 ₫', '122000'), true);
  assert.equal(matchesObservedPrice('Giá 122,000 ₫', '122000'), true);
  assert.equal(matchesObservedPrice('Giá 1.122.000 ₫', '122000'), false);
  assert.equal(matchesPlanText('Google AI Ultra 30 TB', 'pro'), false);
  assert.equal(matchesPlanText('Google AI Plus 400 GB', 'plus'), true);
  assert.equal(matchesPlanText('Google AI Pro 5 TB + YouTube Premium', 'pro-youtube'), true);
  assert.equal(matchesPlanText('Google AI Pro 5 TB', 'pro-youtube'), false);
});

test('Google page integration has preview-before-open and no HAR/checkout replay', () => {
  const page = readFileSync(new URL('../entrypoints/google-one.content.ts', import.meta.url), 'utf8');
  const popup = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
  assert.match(page, /G1_OFFICIAL_PLAN_PREVIEW/);
  assert.match(page, /G1_OFFICIAL_PLAN_OPEN/);
  assert.match(page, /candidate\.click\(\)/);
  assert.match(popup, /browser\.tabs\.sendMessage/);
  assert.match(html, /id="official-choice"/);
  assert.match(html, /id="official-preview"/);
  assert.match(html, /id="official-launch"/);
  assert.doesNotMatch(page, /PlayCommerceAcquireUi|fetch\(|offerIdToken|f\.req/);
});
