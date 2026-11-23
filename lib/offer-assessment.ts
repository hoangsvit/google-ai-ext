import type { NetworkOffer } from './network-offers';

/**
 * Evidence-driven status for an offer observed in page traffic.
 * A candidate is NOT a promise of eligibility or checkout success.
 */
export type OfferStatus = 'trial' | 'introductory' | 'offer-candidate' | 'standard' | 'unknown';

export interface OfferAssessment {
  productId: string;
  plan: string | null;
  basePlanId: string | null;
  offerId: string | null;
  kind: OfferStatus;
  initialPrice: string | null;
  laterPrice: string | null;
  billingPeriod: string | null;
  phaseCount: number;
}

function micros(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

export function assessOffers(offers: NetworkOffer[]): OfferAssessment[] {
  const groups = new Map<string, NetworkOffer[]>();
  const detailedProducts = new Set(offers
    .filter((offer) => offer.basePlanId || offer.offerId || offer.price)
    .map((offer) => offer.productId));
  for (const offer of offers) {
    // A compact checkout response often repeats the product ID without pricing.
    // Prefer the structured product details from the request to avoid a ghost card.
    if (!offer.basePlanId && !offer.offerId && !offer.price &&
        detailedProducts.has(offer.productId)) continue;
    const key = [offer.productId, offer.basePlanId ?? '', offer.offerId ?? ''].join('|');
    const entries = groups.get(key) ?? [];
    entries.push(offer);
    groups.set(key, entries);
  }

  return [...groups.values()].map((group) => {
    // Prefer detailed records to SKU-only entries; request and response duplicates
    // must not be interpreted as multiple subscription pricing phases.
    const ordered = group
      .filter((row) => row.phaseIndex !== null && row.phaseIndex !== undefined)
      .sort((a, b) => (a.phaseIndex ?? 0) - (b.phaseIndex ?? 0));
    const phases = [...new Map(ordered.map((row) => [row.phaseIndex!, row])).values()];
    const first = phases[0];
    const last = phases.at(-1);
    const fallback = group.find((row) => row.price || row.plan) ?? group[0]!;
    const firstValue = micros(first?.priceMicros);
    const lastValue = micros(last?.priceMicros);
    const genuinelyDifferentPhases = phases.length > 1 && firstValue !== null &&
      lastValue !== null && firstValue < lastValue;

    let kind: OfferStatus = 'unknown';
    if (genuinelyDifferentPhases && firstValue === 0n) {
      kind = 'trial';
    } else if (genuinelyDifferentPhases) {
      kind = 'introductory';
    } else if (fallback.offerId) {
      kind = 'offer-candidate';
    } else if (group.some((row) => row.price !== null)) {
      kind = 'standard';
    }

    return {
      productId: fallback.productId,
      plan: fallback.plan ?? group.find((row) => row.plan)?.plan ?? null,
      basePlanId: fallback.basePlanId,
      offerId: fallback.offerId,
      kind,
      initialPrice: first?.price ?? fallback.price,
      laterPrice: genuinelyDifferentPhases ? last?.price ?? null : null,
      billingPeriod: first?.billingPeriod ?? fallback.billingPeriod,
      phaseCount: phases.length,
    };
  }).sort((a, b) => {
    const priority: Record<OfferStatus, number> = {
      trial: 0, introductory: 1, 'offer-candidate': 2, standard: 3, unknown: 4,
    };
    return priority[a.kind] - priority[b.kind];
  });
}

export function summarizeAssessments(assessments: OfferAssessment[]) {
  const candidates = assessments.filter((entry) =>
    entry.kind === 'trial' || entry.kind === 'introductory' || entry.kind === 'offer-candidate');
  return {
    products: new Set(assessments.map((entry) => entry.productId)).size,
    candidates: candidates.length,
    confirmedIntroductoryPhases: assessments.filter((entry) =>
      entry.kind === 'trial' || entry.kind === 'introductory').length,
    message: candidates.length === 0
      ? 'Chưa thấy gói ưu đãi trong dữ liệu đã quét. Không kết luận tài khoản không đủ điều kiện.'
      : 'Có dấu hiệu ưu đãi hoặc Offer ID trong dữ liệu. Giá và điều kiện cuối cùng phải kiểm tra tại Google One.',
  };
}
