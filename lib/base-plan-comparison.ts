import type { NetworkOffer } from './network-offers';

export interface BasePlanComparison {
  productId: string;
  plan: string | null;
  higherBasePlanId: string;
  lowerBasePlanId: string;
  higherPrice: string;
  lowerPrice: string;
  billingPeriod: string;
  currency: string;
  differencePercent: number;
  eligibility: 'unverified';
}

/**
 * Compares separate base plans of the same product. This is NOT an
 * introductory pricing phase or proof that an account can subscribe.
 */
export function compareBasePlans(rows: NetworkOffer[]): BasePlanComparison[] {
  const byProduct = new Map<string, Map<string, NetworkOffer>>();
  for (const row of rows) {
    if (!row.basePlanId || !row.price || !row.currency || !row.billingPeriod ||
        !row.priceMicros || !/^\d{1,19}$/.test(row.priceMicros)) continue;
    if (row.phaseIndex !== undefined && row.phaseIndex !== null && row.phaseIndex !== 0) continue;
    let plans = byProduct.get(row.productId);
    if (!plans) {
      plans = new Map<string, NetworkOffer>();
      byProduct.set(row.productId, plans);
    }
    if (!plans.has(row.basePlanId)) plans.set(row.basePlanId, row);
  }
  const result: BasePlanComparison[] = [];
  for (const [productId, plans] of byProduct) {
    const candidates = [...plans.values()];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        let a = candidates[i]!;
        let b = candidates[j]!;
        if (a.currency !== b.currency || a.billingPeriod !== b.billingPeriod) continue;
        let high = BigInt(a.priceMicros!);
        let low = BigInt(b.priceMicros!);
        if (high === low || low === 0n || high === 0n) continue;
        if (high < low) {
          [a, b] = [b, a];
          [high, low] = [low, high];
        }
        // Percentage rounded to the nearest tenth without floating-point overflow.
        const tenths = ((high - low) * 1000n + high / 2n) / high;
        result.push({
          productId, plan: a.plan ?? b.plan ?? null,
          higherBasePlanId: a.basePlanId!, lowerBasePlanId: b.basePlanId!,
          higherPrice: a.price!, lowerPrice: b.price!,
          billingPeriod: a.billingPeriod!, currency: a.currency!,
          differencePercent: Number(tenths) / 10, eligibility: 'unverified',
        });
      }
    }
  }
  return result.slice(0, 30);
}
