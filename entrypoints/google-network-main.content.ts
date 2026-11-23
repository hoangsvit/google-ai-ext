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
    type Endpoint = 'subscriptions' | 'play-commerce';
    const emit = (payload: string, source: NetworkSource,
      endpoint: Endpoint, httpStatus: number | null = null) => {
      // Also report allowlisted RPC activity when the response has no SKU.
      // Oversized private checkout payloads are never parsed or posted, but
      // their RPC/HTTP status can still be observed without raw data.
      try {
        const offers = payload && payload.length <= MAX_BODY
          ? extractNetworkOffers(payload, source) : [];
        window.postMessage({ kind: MARKER, activity: true, offers,
          rpc: { endpoint, stage: source, httpStatus } }, window.location.origin);
      } catch { /* Never interrupt the host application. */ }
    };
    const category = (url: string): Endpoint | null => {
      try {
        const actual = new URL(url, window.location.href);
        if (!isGoogleOneCommerceUrl(actual.href)) return null;
        return actual.hostname === 'tokenized.play.google.com'
          ? 'play-commerce' : 'subscriptions';
      } catch { return null; }
    };

    // Read only clones or string/URLSearchParams bodies for matching commerce RPCs.
    // Never consume original bodies, inspect FormData or mutate a checkout request.
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
      const input = args[0];
      let endpoint: Endpoint | null = null;
      try {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href : input?.url ?? '';
        endpoint = category(url);
        if (endpoint) {
          const initBody = args[1]?.body;
          if (typeof initBody === 'string') {
            emit(initBody, 'request', endpoint);
          } else if (initBody instanceof URLSearchParams) {
            emit(initBody.toString(), 'request', endpoint);
          } else if (!initBody && input instanceof Request) {
            // A clone is consumed asynchronously; the original request is untouched.
            const length = Number(input.headers.get('content-length') || '0');
            if (!input.bodyUsed && length <= MAX_BODY) {
              void input.clone().text().then((body) => emit(body, 'request', endpoint!)).catch(() => {});
            } else { emit('', 'request', endpoint); }
          } else { emit('', 'request', endpoint); }
        }
      } catch { /* Ignore inspection errors without reissuing the request. */ }

      // Call the original exactly once, regardless of URL or errors.
      const promise = originalFetch.apply(window, args);
      if (endpoint) {
        const site = endpoint;
        void promise.then((response) => {
          const length = Number(response.headers.get('content-length') || '0');
          if (!response.ok || length > MAX_BODY) {
            emit('', 'response', site, response.status);
            return;
          }
          void response.clone().text()
            .then((body) => emit(body, 'response', site, response.status))
            .catch(() => emit('', 'response', site, response.status));
        }).catch(() => emit('', 'response', site, 0));
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
      const endpoint = url ? category(url) : null;
      if (endpoint) {
        if (typeof body === 'string') emit(body, 'request', endpoint);
        else if (body instanceof URLSearchParams) emit(body.toString(), 'request', endpoint);
        else emit('', 'request', endpoint);
        this.addEventListener('loadend', () => {
          try {
            if (this.status < 200 || this.status >= 300 ||
                (this.responseType !== '' && this.responseType !== 'text')) {
              emit('', 'response', endpoint, this.status);
              return;
            }
            emit(this.responseText, 'response', endpoint, this.status);
          } catch {
            emit('', 'response', endpoint, this.status || 0);
          }
        }, { once: true });
      }
      return send.call(this, body);
    };
  },
});
