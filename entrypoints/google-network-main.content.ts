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
      // Also report allowlisted RPC activity when the response has no SKU.
      if (payload.length > MAX_BODY) return;
      try {
        const offers = payload ? extractNetworkOffers(payload, source) : [];
        window.postMessage({ kind: MARKER, activity: true, offers }, window.location.origin);
      } catch { /* Never interrupt the host application. */ }
    };
    const matches = (url: string) => {
      try { return isGoogleOneCommerceUrl(new URL(url, window.location.href).href); }
      catch { return false; }
    };

    // Read only clones or string/URLSearchParams bodies for matching commerce RPCs.
    // Never consume original bodies, inspect FormData or mutate a checkout request.
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
      const input = args[0];
      let targeted = false;
      try {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href : input?.url ?? '';
        targeted = matches(url);
        if (targeted) {
          const initBody = args[1]?.body;
          if (typeof initBody === 'string') {
            emit(initBody, 'request');
          } else if (initBody instanceof URLSearchParams) {
            emit(initBody.toString(), 'request');
          } else if (!initBody && input instanceof Request) {
            // A clone is consumed asynchronously; the original request is untouched.
            const length = Number(input.headers.get('content-length') || '0');
            if (!input.bodyUsed && length <= MAX_BODY) {
              void input.clone().text().then((body) => emit(body, 'request')).catch(() => {});
            } else { emit('', 'request'); }
          } else { emit('', 'request'); }
        }
      } catch { /* Ignore inspection errors without reissuing the request. */ }

      // Call the original exactly once, regardless of URL or errors.
      const promise = originalFetch.apply(window, args);
      if (targeted) {
        void promise.then((response) => {
          if (!response.ok) return;
          const length = Number(response.headers.get('content-length') || '0');
          if (length > MAX_BODY) return;
          void response.clone().text().then((body) => emit(body, 'response')).catch(() => {});
        }).catch(() => {});
      }
      return promise;
    };

    const urls = new WeakMap<XMLHttpRequest, string>();
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      const target = args[1];
      if (typeof target === 'string') urls.set(this, target);
      return Reflect.apply(open, this, args) as void;
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const url = urls.get(this);
      if (url && matches(url)) {
        if (typeof body === 'string') emit(body, 'request');
        else if (body instanceof URLSearchParams) emit(body.toString(), 'request');
        else emit('', 'request');
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
