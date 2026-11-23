import { browser } from 'wxt/browser';
import { collectVisibleOffers } from '../lib/offers-dom';

export default defineContentScript({
  matches: ['https://one.google.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object' || message.kind !== 'GOOGLE_ONE_OFFERS_SCAN') {
        return;
      }

      try {
        sendResponse({
          kind: 'GOOGLE_ONE_OFFERS_RESULT',
          offers: collectVisibleOffers(document),
          scannedAt: new Date().toISOString(),
        });
      } catch {
        sendResponse({
          kind: 'GOOGLE_ONE_OFFERS_RESULT',
          offers: [],
          scannedAt: new Date().toISOString(),
          error: 'Unable to inspect visible plans on this page.',
        });
      }
    });
  },
});
