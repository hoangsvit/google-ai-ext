import { isNetworkOffer, type NetworkOffer } from './network-offers.ts';
import { skuFromJslog } from './bootstrap-offers.ts';
import { isSafePlanEntryLabel, matchesObservedPrice } from './official-google-one.ts';

const SKU = /^g1\.[a-z0-9][a-z0-9._-]{1,79}$/i;
const CURRENCY = /^VND$/;
export interface SkuSelection {
  productId: string;
  expectedPrice: string;
  currency: string;
  basePlanId: string | null;
  billingPeriod: string | null;
}
export interface SkuChoice extends SkuSelection {
  plan: string;
  source: NetworkOffer['source'];
}

/** Display actual observed rows, never invent checkout URLs or purchase offers. */
export function skuChoicesFromCapturedRows(rows: NetworkOffer[]): SkuChoice[] {
  const choices: SkuChoice[] = [];
  const seen = new Set<string>();
  for (const row of rows.filter(isNetworkOffer).slice(0, 80)) {
    if (!row.price || !row.currency || !CURRENCY.test(row.currency) ||
        !SKU.test(row.productId)) continue;
    const key = [row.productId, row.price, row.billingPeriod ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({
      productId: row.productId, expectedPrice: row.price,
      currency: row.currency, basePlanId: row.basePlanId,
      billingPeriod: row.billingPeriod, plan: row.plan ?? 'Google One',
      source: row.source,
    });
    if (choices.length >= 40) break;
  }
  return choices;
}
export function validSkuSelection(value: unknown): value is SkuSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<SkuSelection>;
  return typeof v.productId === 'string' && SKU.test(v.productId) &&
    typeof v.expectedPrice === 'string' && v.expectedPrice.length >= 3 &&
    v.expectedPrice.length <= 45 && /\d/.test(v.expectedPrice) &&
    typeof v.currency === 'string' && CURRENCY.test(v.currency) &&
    (v.basePlanId === null || (typeof v.basePlanId === 'string' &&
      /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v.basePlanId))) &&
    (v.billingPeriod === null || (typeof v.billingPeriod === 'string' &&
      /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?$/.test(v.billingPeriod)));
}

/** Confirm that Google's live CTA references exactly the chosen SKU and price. */
export function matchesOfficialSkuCta(
  jslog: string, label: string, cardText: string, selection: SkuSelection,
): boolean {
  if (!validSkuSelection(selection) || skuFromJslog(jslog) !== selection.productId ||
      !isSafePlanEntryLabel(label) || cardText.length > 1500) return false;
  const amount = selection.expectedPrice.replace(/\D/g, '');
  if (!/^\d{4,12}$/.test(amount)) return false;
  if (!matchesObservedPrice(cardText, amount)) return false;
  // A displayed price matching a plan is not proof that a particular Google
  // Play basePlanId is selected. That remains server-side/checkout information.
  return true;
}
