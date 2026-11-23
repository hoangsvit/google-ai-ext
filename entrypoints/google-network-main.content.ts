import { extractNetworkOffers, isGoogleOneCommerceUrl, type NetworkSource } from '../lib/network-offers';

/**
 * Runs in the page's MAIN world. Never changes outgoing requests, incoming
 * responses, headers, billing options or checkout control flow.
 * Only bounded, allowlisted product metadata is sent to the isolated bridge.
 */
export default defineContentScript({
  matches: ['https://one.google.com/*', 'https://tokenized.play.google.com/*'],
  allFrames: true,
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const MARKER = '__eplus_g1_network_summary_v1__';
    const MAX_BODY = 350_000;
    const emit = (payload: string, source: NetworkSource) => {
      if (!payload || payload.length > MAX_BODY) return;
      try {
        const offers = extractNetworkOffers(payload, source);
        if (offers.length) {
          window.postMessage({ kind: MARKER, offers }, window.location.origin);
        }
      } catch {
        // This is a passive inspector. Never break the host application.
      }
    };
    const matches = (url: string) => {
      try { return isGoogleOneCommerceUrl(new URL(url, window.location.href).href); }
      catch { return false; }
    };

    // Observes URL-encoded request metadata if an application passes a string body.
    // FormData, streams and Request objects are deliberately not consumed.
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href : input?.url ?? '';
        if (matches(url)) {
          if (typeof args[1]?.body === 'string') emit(args[1].body, 'request');
          const promise = originalFetch.apply(window, args);
          void promise.then((response) => {
            if (!response.ok) return;
            const length = Number(response.headers.get('content-length') || '0');
            if (length > MAX_BODY) return;
            void response.clone().text().then((body) => emit(body, 'response')).catch(() => {});
          }).catch(() => {});
          return promise;
        }
      } catch {
        // On unexpected input, fall through to the original unmodified fetch.
      }
      return originalFetch.apply(window, args);
    };

    const urls = new WeakMap<XMLHttpRequest, string>();
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (...args: unknown[]) {
      const target = args[1];
      if (typeof target === 'string') urls.set(this, target);
      return Reflect.apply(open, this, args) as void;
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const url = urls.get(this);
      if (url && matches(url)) {
        if (typeof body === 'string') emit(body, 'request');
        this.addEventListener('loadend', () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            if (this.responseType !== '' && this.responseType !== 'text') return;
            emit(this.responseText, 'response');
          } catch { /* do not modify XHR result */ }
        }, { once: true });
      }
      return send.call(this, body);
    };
  },
});
