import { extractNetworkOffers, type NetworkOffer } from './network-offers.ts';

/**
 * Local-only fictional response fixtures. All IDs contain the demo namespace.
 * Price values for the 2026-11-23 catalog are modeled on sanitized HAR fields,
 * not live offers. No real Google product can be purchased from this component.
 */
export type DemoVariant = 'ultra-3m' | 'pro-5tb' | 'pro-youtube' | 'plus-400gb';
export const DEMO_PRODUCT_ID = 'g1.demo.ultra.3m';
export const DEMO_OFFER_ID = 'demo-3months';
export const DEMO_LABEL = 'DEMO — Không phải ưu đãi Google thực tế';

type Phase = {
  formattedPrice: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  billingPeriod: string;
  billingCycleCount?: number;
  recurrenceMode?: number;
};
function phase(formattedPrice: string, micros: number): Phase {
  return { formattedPrice, priceAmountMicros: micros, priceCurrencyCode: 'VND',
    billingPeriod: 'P1M', recurrenceMode: 1 };
}
function product(productId: string, title: string,
  offers: { basePlanId: string; offerId?: string; pricingPhases: Phase[] }[]): NetworkOffer[] {
  return extractNetworkOffers(JSON.stringify({
    productId, title, subscriptionOfferDetails: offers,
  }), 'response');
}

export function createDemoOffer(variant: DemoVariant = 'ultra-3m'): NetworkOffer[] {
  switch (variant) {
    case 'pro-5tb':
      return product('g1.demo.ai-pro-5tb', 'DEMO — Google AI Pro (5 TB) (Google One)', [
        { basePlanId: 'monthly', pricingPhases: [phase('489.000 ₫', 489000000000)] },
        { basePlanId: 'monthly-transit', pricingPhases: [phase('122.000 ₫', 122000000000)] },
      ]);
    case 'pro-youtube':
      return product('g1.demo.pro-youtube-5tb',
        'DEMO — Google AI Pro (5 TB) with YouTube Premium (Google One)', [
          { basePlanId: 'monthly-transit', pricingPhases: [phase('159.000 ₫', 159000000000)] },
        ]);
    case 'plus-400gb':
      return product('g1.demo.plus-400gb', 'DEMO — Google AI Plus (400 GB) (Google One)', [
        { basePlanId: 'monthly', pricingPhases: [phase('132.000 ₫', 132000000000)] },
      ]);
    case 'ultra-3m':
    default:
      return product(DEMO_PRODUCT_ID, 'DEMO — Google AI Ultra (30 TB) (Google One)', [
        { basePlanId: 'demo-monthly', offerId: DEMO_OFFER_ID,
          pricingPhases: [
            { formattedPrice: '$19.99', priceAmountMicros: 19990000,
              priceCurrencyCode: 'USD', billingPeriod: 'P1M', billingCycleCount: 3 },
            { formattedPrice: '$199.99', priceAmountMicros: 199990000,
              priceCurrencyCode: 'USD', billingPeriod: 'P1M', recurrenceMode: 1 },
          ] },
      ]);
  }
}
