import { isNetworkOffer, type NetworkOffer } from './network-offers.ts';

export interface TrySku {
  productId: string;
  plan: string;
  expectedPrice: string;
  currency: 'VND';
  basePlanId: string | null;
  billingPeriod: string | null;
  observedNow: boolean;
  evidence: 'commerce-har' | 'html-catalog' | 'live-only';
  evidenceHar: string | null;
}

/** Public SKU/price metadata seen in prior sanitized HAR/HTML snapshots.
 * These are examples for UI research; NOT eligibility guarantees.
 */
export const REFERENCE_SKUS: ReadonlyArray<Omit<TrySku, 'observedNow'>> = [
  { productId: 'g1.helium.m', plan: 'Google AI Plus 400 GB', expectedPrice: '132.000 ₫', currency: 'VND', basePlanId: 'monthly', billingPeriod: 'P1M' },
  { productId: 'g1.helium.a', plan: 'Google AI Plus 400 GB', expectedPrice: '1.319.000 ₫', currency: 'VND', basePlanId: 'annual', billingPeriod: 'P1Y' },
  { productId: 'g1.2tb.ai', plan: 'Google AI Pro 5 TB', expectedPrice: '489.000 ₫', currency: 'VND', basePlanId: 'p1m', billingPeriod: 'P1M' },
  { productId: 'g1.2tb.ai.annual', plan: 'Google AI Pro 5 TB', expectedPrice: '5.000.000 ₫', currency: 'VND', basePlanId: 'p1y', billingPeriod: 'P1Y' },
  { productId: 'g1.20tb.v2', plan: 'Google AI Ultra 20 TB', expectedPrice: '2.250.000 ₫', currency: 'VND', basePlanId: 'p1m', billingPeriod: 'P1M' },
  { productId: 'g1.ai.pro', plan: 'Google AI Ultra 30 TB', expectedPrice: '5.500.000 ₫', currency: 'VND', basePlanId: 'monthly', billingPeriod: 'P1M' },
  { productId: 'g1.play.sapphire', plan: 'Google AI Pro + YouTube Premium', expectedPrice: '159.000 ₫', currency: 'VND', basePlanId: 'monthly-transit', billingPeriod: 'P1M' },
  { productId: 'g1.play.2tb.ai.student', plan: 'Google AI Pro 5 TB', expectedPrice: '489.000 ₫', currency: 'VND', basePlanId: 'monthly', billingPeriod: 'P1M' },
  { productId: 'g1.play.2tb.ai.student', plan: 'Google AI Pro 5 TB', expectedPrice: '122.000 ₫', currency: 'VND', basePlanId: 'monthly-transit', billingPeriod: 'P1M' },
  { productId: 'g1.play.helium.student', plan: 'Google AI Plus 400 GB', expectedPrice: '132.000 ₫', currency: 'VND', basePlanId: 'monthly', billingPeriod: 'P1M' },
];

export function trySkuKey(item: Pick<TrySku, 'productId' | 'expectedPrice' | 'billingPeriod'>): string {
  return [item.productId, item.expectedPrice, item.billingPeriod ?? ''].join('|');
}

/**
 * Sources independently identified in the supplied HAR request/response logs.
 * These demonstrate prior Google Play Commerce activity, NOT that the current
 * Google account is eligible or that a purchase completed.
 *
 * Never include HTTP headers, response bodies, session credentials, tokens,
 * account identifiers, or raw HAR in the repo.
 */
export const COMMERCE_HAR_EVIDENCE: Readonly<Record<string, string>> = {
  'g1.20tb.v2': 'one.google.com.har / one.google.com(1).har',
  'g1.play.sapphire': 'one.google.com(2).har',
  'g1.play.2tb.ai.student': 'one.google.com(2).har',
  'g1.play.helium.student': 'one.google.com(3).har',
};

export const historicalSkuCount = new Set(REFERENCE_SKUS.map((sku) => sku.productId)).size;

/** All known SKU examples remain visible even if Google omitted them this session. */
export function buildTrySkuList(captured: NetworkOffer[]): TrySku[] {
  const byKey = new Map<string, TrySku>();
  for (const reference of REFERENCE_SKUS) {
    const har = COMMERCE_HAR_EVIDENCE[reference.productId];
    const item: TrySku = {
      ...reference,
      observedNow: false,
      evidence: har ? 'commerce-har' : 'html-catalog',
      evidenceHar: har ?? null,
    };
    byKey.set(trySkuKey(item), item);
  }
  for (const row of captured.filter(isNetworkOffer).slice(0, 120)) {
    if (!row.price || row.currency !== 'VND') continue;
    const candidate: TrySku = {
      productId: row.productId, plan: row.plan ?? 'Google One',
      expectedPrice: row.price, currency: 'VND', basePlanId: row.basePlanId,
      billingPeriod: row.billingPeriod, observedNow: true,
      evidence: 'live-only', evidenceHar: null,
    };
    const key = trySkuKey(candidate);
    const existing = byKey.get(key);
    byKey.set(key, existing
      ? { ...existing, observedNow: true,
          // Prefer a richer live base plan; old HAR values are not a promise.
          basePlanId: row.basePlanId ?? existing.basePlanId,
          plan: row.plan ?? existing.plan }
      : candidate);
  }
  // Live entries first, then historical SKU seen in an actual Commerce RPC,
  // then products only seen in the initial Google One HTML catalog.
  const rank = (item: TrySku): number =>
    item.observedNow ? 0 : item.evidence === 'commerce-har' ? 1 : 2;
  return [...byKey.values()]
    .sort((left, right) => rank(left) - rank(right))
    .slice(0, 60);
}
