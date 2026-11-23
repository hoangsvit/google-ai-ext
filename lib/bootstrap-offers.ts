import {
  extractNetworkOffers, uniqueNetworkOffers, type NetworkOffer,
} from './network-offers.ts';

/**
 * Google One may ship its catalog in AF_initDataCallback() inside the initial
 * HTML, before any fetch/XHR hook can observe a product RPC.
 *
 * Never execute or evaluate the callback. Parse only standalone JSON string
 * literals containing subscription product metadata, then strictly whitelist
 * safe fields via extractNetworkOffers().
 */
const MAX_SCRIPT = 350_000;
const MAX_LITERAL = 35_000;
const MAX_PRODUCTS = 180;
const SKU = /\bg1\.[a-z0-9][a-z0-9._-]{1,79}\b/i;
const VND_PRICE = /(?:^|[^\d])(\d{1,3}(?:[.,]\d{3})+|\d{4,10})\s*(?:₫|VND|đồng)(?!\w)/i;

export function extractBootstrapOffers(source: string): NetworkOffer[] {
  if (typeof source !== 'string' || source.length > MAX_SCRIPT ||
      !source.includes('AF_initDataCallback')) return [];
  const collected: NetworkOffer[] = [];
  let count = 0;

  // Read JS double-quoted literals without interpreting callback expressions.
  // Google embeds escaped JSON product objects as string values inside data:[].
  for (let i = 0; i < source.length && count < MAX_PRODUCTS;) {
    if (source[i] !== '"') { i++; continue; }
    const start = i++;
    let escaped = false;
    while (i < source.length) {
      const c = source[i++];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') break;
    }
    if (source[i - 1] !== '"' || i - start > MAX_LITERAL) continue;
    const literal = source.slice(start, i);
    if (!literal.includes('productId') || !literal.includes('g1.')) continue;

    try {
      const decoded: unknown = JSON.parse(literal);
      if (typeof decoded !== 'string' || decoded.length > MAX_LITERAL) continue;
      const product: unknown = JSON.parse(decoded);
      if (!product || typeof product !== 'object' || Array.isArray(product)) continue;
      const record = product as { productId?: unknown; type?: unknown };
      if (typeof record.productId !== 'string' || !SKU.test(record.productId) ||
          record.type !== 'subs') continue;

      // The only serialized output is a small allowlisted NetworkOffer object.
      collected.push(...extractNetworkOffers(JSON.stringify(product), 'bootstrap'));
      count++;
    } catch {
      // Arbitrary JS string literal, not a valid product object. Ignore.
    }
  }

  return uniqueNetworkOffers(collected).slice(0, 40);
}

/** Read a SKU from Google's element telemetry, not as a purchase instruction. */
export function skuFromJslog(jslog: string): string | null {
  if (typeof jslog !== 'string' || jslog.length > 3000) return null;
  return jslog.match(SKU)?.[0] ?? null;
}

/**
 * Fallback for pages that render plan CTAs without a bootstrap catalog. The
 * price must appear in a compact same-CTA ancestor (not the entire page).
 */
export function extractJslogOffers(doc: Document): NetworkOffer[] {
  const matches: NetworkOffer[] = [];
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[jslog]')).slice(0, 250)) {
    const productId = skuFromJslog(node.getAttribute('jslog') ?? '');
    if (!productId) continue;
    if (node.closest('[aria-hidden="true"],[hidden],[inert]')) continue;
    if (node.getClientRects().length === 0) continue;

    let ancestor: HTMLElement | null = node;
    let price: string | null = null;
    let period: string | null = null;
    for (let depth = 0; depth < 6 && ancestor; depth++, ancestor = ancestor.parentElement) {
      if (ancestor === doc.body) break;
      const text = (ancestor.innerText ?? ancestor.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Restrict matching to the CTA's close ancestors to avoid another card's price.
      if (text.length > 1300) break;
      const found = text.match(VND_PRICE);
      if (found) {
        price = found[1].replace(/,/g, '.') + ' ₫';
        period = /\/\s*(?:năm|year)/i.test(text) ? 'P1Y'
          : /\/\s*(?:tháng|month)/i.test(text) ? 'P1M' : null;
        break;
      }
    }
    const buttonText = (node.innerText ?? node.textContent ?? '').replace(/\s+/g, ' ').slice(0, 150);
    const name = /ai\s+plus/i.test(buttonText) ? 'Google AI Plus'
      : /ai\s+ultra/i.test(buttonText) ? 'Google AI Ultra'
      : /ai\s+pro/i.test(buttonText) ? 'Google AI Pro' : null;

    matches.push({
      productId, plan: name, basePlanId: null, offerId: null,
      price, currency: price ? 'VND' : null, billingPeriod: period,
      source: 'page',
    });
  }
  return uniqueNetworkOffers(matches).slice(0, 40);
}
