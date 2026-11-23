import type { NetworkOffer } from './network-offers';

/**
 * Purely local, fictional sample for testing the extension's offer UI.
 * This product does not exist on Google Play and is never sent to Google.
 */
export const DEMO_PRODUCT_ID = 'g1.demo.ultra.3m';
export const DEMO_OFFER_ID = 'demo-3months';
export const DEMO_LABEL = 'DEMO — Không phải ưu đãi Google thực tế';

export function createDemoOffer(): NetworkOffer[] {
  const common = {
    productId: DEMO_PRODUCT_ID,
    plan: 'DEMO — Google AI Ultra 30 TB',
    basePlanId: 'demo-monthly',
    offerId: DEMO_OFFER_ID,
    currency: 'USD',
    billingPeriod: 'P1M',
    source: 'response' as const,
  };

  return [
    {
      ...common,
      price: '$19.99 / tháng (giá mẫu)',
      priceMicros: '19990000',
      phaseIndex: 0,
    },
    {
      ...common,
      price: '$199.99 / tháng (giá mẫu)',
      priceMicros: '199990000',
      phaseIndex: 1,
    },
  ];
}
