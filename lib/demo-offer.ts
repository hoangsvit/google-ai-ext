import { extractNetworkOffers, type NetworkOffer } from './network-offers.ts';

/**
 * Fictional response-shaped fixture. Reuses the real parser and assessment
 * pipeline, but NEVER replaces an HTTP response or reaches Google checkout.
 */
export const DEMO_PRODUCT_ID = 'g1.demo.ultra.3m';
export const DEMO_OFFER_ID = 'demo-3months';
export const DEMO_LABEL = 'DEMO — Không phải ưu đãi Google thực tế';

export function createDemoOffer(): NetworkOffer[] {
  const responseFixture = {
    productId: DEMO_PRODUCT_ID,
    title: 'DEMO — Google AI Ultra 30 TB',
    subscriptionOfferDetails: [{
      basePlanId: 'demo-monthly',
      offerId: DEMO_OFFER_ID,
      pricingPhases: [
        {
          formattedPrice: '$19.99',
          priceAmountMicros: 19990000,
          priceCurrencyCode: 'USD',
          billingPeriod: 'P1M',
          billingCycleCount: 3,
        },
        {
          formattedPrice: '$199.99',
          priceAmountMicros: 199990000,
          priceCurrencyCode: 'USD',
          billingPeriod: 'P1M',
          recurrenceMode: 1,
        },
      ],
    }],
  };
  return extractNetworkOffers(JSON.stringify(responseFixture), 'response');
}
