import { browser } from 'wxt/browser';
import { isNetworkOffer, uniqueNetworkOffers, type NetworkOffer } from '../lib/network-offers';

type CaptureMessage = { kind: 'G1_NETWORK_CAPTURE'; offers: NetworkOffer[] };
type QueryMessage = { kind: 'G1_NETWORK_GET'; tabId: number };
type ClearMessage = { kind: 'G1_NETWORK_CLEAR'; tabId: number };
type IncomingMessage = CaptureMessage | QueryMessage | ClearMessage;

export default defineBackground(() => {
  // Memory only; service-worker sleep or browser restart intentionally clears it.
  const byTab = new Map<number, NetworkOffer[]>();

  browser.runtime.onMessage.addListener((raw: unknown, sender) => {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as Partial<IncomingMessage>;
    if (message.kind === 'G1_NETWORK_CAPTURE') {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      const senderUrl = sender.url ?? '';
      let allowed = false;
      try {
        const url = new URL(senderUrl);
        allowed = url.protocol === 'https:' &&
          (url.hostname === 'one.google.com' ||
            url.hostname === 'tokenized.play.google.com');
      } catch { /* ignore untrusted sources */ }
      if (!allowed || !Array.isArray(message.offers)) return;
      const safe: NetworkOffer[] = message.offers.filter(isNetworkOffer).slice(0, 40).map((offer) => ({
        productId: offer.productId, plan: offer.plan,
        basePlanId: offer.basePlanId, offerId: offer.offerId,
        price: offer.price, currency: offer.currency,
        billingPeriod: offer.billingPeriod, source: offer.source,
        phaseIndex: offer.phaseIndex ?? null, priceMicros: offer.priceMicros ?? null,
      }));
      byTab.set(tabId, uniqueNetworkOffers([...(byTab.get(tabId) ?? []), ...safe]).slice(0, 40));
      return;
    }
    if (message.kind === 'G1_NETWORK_GET' && Number.isInteger(message.tabId)) {
      return Promise.resolve({ offers: byTab.get(message.tabId as number) ?? [] });
    }
    if (message.kind === 'G1_NETWORK_CLEAR' && Number.isInteger(message.tabId)) {
      byTab.delete(message.tabId as number);
      return Promise.resolve({ ok: true });
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => byTab.delete(tabId));
});
