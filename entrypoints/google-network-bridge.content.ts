import { browser } from 'wxt/browser';
import { isNetworkOffer, type NetworkOffer } from '../lib/network-offers';

/** Relay *only* sanitized summaries, never raw network content. */
export default defineContentScript({
  matches: ['https://one.google.com/*', 'https://tokenized.play.google.com/*'],
  allFrames: true,
  world: 'ISOLATED',
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message: unknown = event.data;
      if (!message || typeof message !== 'object') return;
      const eventData = message as { kind?: unknown; offers?: unknown };
      if (eventData.kind !== '__eplus_g1_network_summary_v1__' ||
          !Array.isArray(eventData.offers)) return;
      const offers = eventData.offers.filter(isNetworkOffer).slice(0, 40).map((offer: NetworkOffer) => ({
        productId: offer.productId, plan: offer.plan,
        basePlanId: offer.basePlanId, offerId: offer.offerId,
        price: offer.price, currency: offer.currency,
        billingPeriod: offer.billingPeriod, source: offer.source,
      }));
      if (offers.length) {
        void browser.runtime.sendMessage({ kind: 'G1_NETWORK_CAPTURE', offers })
          .catch(() => { /* ignore service worker sleep/restarts */ });
      }
    });
  },
});
