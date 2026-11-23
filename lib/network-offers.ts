/**
 * Read-only, allowlisted extraction of Google One product metadata.
 * No tokens, cookies, account details, request bodies or response bodies leave this function.
 */
export type NetworkSource = 'request' | 'response' | 'bootstrap' | 'page';

export interface NetworkOffer {
  productId: string;
  plan: string | null;
  basePlanId: string | null;
  offerId: string | null;
  price: string | null;
  currency: string | null;
  billingPeriod: string | null;
  source: NetworkSource;
  phaseIndex?: number | null;
  priceMicros?: string | null;
}

const MAX_BODY = 350_000;
const MAX_ITEMS = 40;
const PRODUCT_ID = /^g1\.[a-z0-9][a-z0-9._-]{1,79}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const BILLING_PERIOD = /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?$/i;
const SKU_PATTERN = /\bg1\.[a-z0-9][a-z0-9._-]{1,79}\b/gi;

function safeId(value: unknown, pattern = IDENTIFIER): string | null {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}
function safeCurrency(value: unknown): string | null {
  return typeof value === 'string' && CURRENCY.test(value) ? value : null;
}
function safePrice(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= 45 && trimmed.length > 0 && /\d/.test(trimmed) &&
    /(?:₫|đ|VND|USD|EUR|GBP|\$|€|£)/i.test(trimmed) ? trimmed : null;
}
function safeTitle(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 130) return null;
  const title = value.replace(/\s+/g, ' ').trim();
  return /google\s*(one|ai\s*(ultra|pro|plus))|ai\s*(ultra|pro|plus)/i.test(title) ? title : null;
}
function safeMicros(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^\d{1,19}$/.test(value)) return value;
  return null;
}
function safePeriod(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 14 && BILLING_PERIOD.test(value) ? value : null;
}

export function isGoogleOneCommerceUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://one.google.com/');
    return url.protocol === 'https:' && (
      (url.hostname === 'one.google.com' &&
        /\/SubscriptionsManagementUi\/data\/batchexecute$/.test(url.pathname)) ||
      (url.hostname === 'tokenized.play.google.com' &&
        /\/PlayCommerceAcquireUi\/data\/batchexecute$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

function scored(offer: NetworkOffer): number {
  return Number(Boolean(offer.plan)) + Number(Boolean(offer.basePlanId)) +
    Number(Boolean(offer.offerId)) + Number(Boolean(offer.price)) +
    Number(Boolean(offer.billingPeriod));
}

export function uniqueNetworkOffers(offers: NetworkOffer[]): NetworkOffer[] {
  const result: NetworkOffer[] = [];
  const seen = new Set<string>();
  for (const offer of [...offers].sort((a, b) => scored(b) - scored(a))) {
    const key = [offer.productId, offer.basePlanId, offer.offerId, offer.price,
      offer.phaseIndex ?? '', offer.priceMicros ?? '', offer.source].join('|');
    if (seen.has(key)) continue;
    // A well-formed plan from HTML or RPC supersedes the less precise jslog
    // button summary for the same SKU, preventing duplicate phantom cards.
    if (offer.source === 'page' && result.some((item) =>
      item.productId === offer.productId && item.basePlanId && item.price)) continue;
    // A detailed product record supersedes an identifier-only entry from the same payload.
    if (!offer.basePlanId && !offer.offerId && !offer.price && result.some((item) =>
      item.source === offer.source && item.productId === offer.productId &&
      (item.basePlanId || item.offerId || item.price))) continue;
    seen.add(key);
    result.push(offer);
    if (result.length >= MAX_ITEMS) break;
  }
  return result;
}

export function extractNetworkOffers(raw: string, source: NetworkSource): NetworkOffer[] {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_BODY) return [];
  const records: NetworkOffer[] = [];
  let nodes = 0;
  const visited = new Set<object>();

  const collect = (node: unknown, depth: number): void => {
    if (++nodes > 3_000 || depth > 18) return;

    if (typeof node === 'string') {
      const value = node.trim();
      if (value.length > MAX_BODY) return;
      if (value[0] === '[' || value[0] === '{') {
        try {
          collect(JSON.parse(value), depth + 1);
        } catch {
          // Nested Google RPC string is not always valid JSON.
        }
      }
      return;
    }

    if (node === null || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 300)) collect(item, depth + 1);
      return;
    }

    const data = node as Record<string, unknown>;
    const productId = safeId(data.productId, PRODUCT_ID);
    if (productId) {
      const plan = safeTitle(data.title) ?? safeTitle(data.name);
      const details = Array.isArray(data.subscriptionOfferDetails)
        ? data.subscriptionOfferDetails.slice(0, 30)
        : [];
      if (details.length === 0) {
        records.push({ productId, plan, basePlanId: null, offerId: null,
          price: null, currency: null, billingPeriod: null, source });
      }
      for (const detail of details) {
        if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
        const d = detail as Record<string, unknown>;
        const phases = Array.isArray(d.pricingPhases) ? d.pricingPhases.slice(0, 20) : [];
        if (phases.length === 0) {
          records.push({ productId, plan, basePlanId: safeId(d.basePlanId),
            offerId: safeId(d.offerId), price: null, currency: null, billingPeriod: null, source });
        }
        for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
          const phase = phases[phaseIndex];
          if (!phase || typeof phase !== 'object' || Array.isArray(phase)) continue;
          const p = phase as Record<string, unknown>;
          records.push({
            productId, plan, basePlanId: safeId(d.basePlanId), offerId: safeId(d.offerId),
            price: safePrice(p.formattedPrice), currency: safeCurrency(p.priceCurrencyCode),
            billingPeriod: safePeriod(p.billingPeriod), source,
            phaseIndex, priceMicros: safeMicros(p.priceAmountMicros),
          });
        }
      }
    }
    for (const child of Object.values(data).slice(0, 200)) collect(child, depth + 1);
  };

  let payload = raw.trim();
  if (payload.startsWith('f.req=')) {
    try { payload = new URLSearchParams(payload).get('f.req') ?? ''; }
    catch { return []; }
  }
  // Google batchexecute responses can start with an XSSI guard and length markers.
  if (payload.startsWith(")]}'")) payload = payload.slice(4).trim();
  const chunks = [payload];
  if (/^\d+\s*\n/.test(payload)) {
    const first = payload.indexOf('[');
    if (first >= 0) chunks.push(payload.slice(first));
  }

  for (const chunk of chunks) {
    if (!(chunk[0] === '[' || chunk[0] === '{')) continue;
    try { collect(JSON.parse(chunk), 0); } catch { /* best effort */ }
  }

  // Some Play checkout RPCs embed product IDs in compact positional arrays.
  // These have no reliable price/offer association: report the SKU only.
  const already = new Set(records.map((item) => item.productId));
  const candidates = payload.match(SKU_PATTERN) ?? [];
  for (const candidate of candidates.slice(0, 100)) {
    if (already.has(candidate) || !PRODUCT_ID.test(candidate)) continue;
    records.push({ productId: candidate, plan: null, basePlanId: null, offerId: null,
      price: null, currency: null, billingPeriod: null, source });
    already.add(candidate);
  }
  return uniqueNetworkOffers(records);
}

export function extractHarNetworkOffers(input: unknown): NetworkOffer[] {
  if (!input || typeof input !== 'object') return [];
  const log = (input as { log?: { entries?: unknown } }).log;
  if (!Array.isArray(log?.entries)) return [];
  const collected: NetworkOffer[] = [];

  for (const entry of log.entries.slice(0, 500)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as {
      request?: { url?: unknown; postData?: { text?: unknown } };
      response?: { content?: { text?: unknown; encoding?: unknown } };
    };
    if (typeof item.request?.url !== 'string' ||
      !isGoogleOneCommerceUrl(item.request.url)) continue;
    const request = item.request.postData?.text;
    const response = item.response?.content;
    if (typeof request === 'string') collected.push(...extractNetworkOffers(request, 'request'));
    if (typeof response?.text === 'string' && !response.encoding) {
      collected.push(...extractNetworkOffers(response.text, 'response'));
    }
  }
  return uniqueNetworkOffers(collected).slice(0, MAX_ITEMS);
}

export function isNetworkOffer(value: unknown): value is NetworkOffer {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NetworkOffer>;
  return typeof candidate.productId === 'string' && PRODUCT_ID.test(candidate.productId) &&
    (candidate.source === 'request' || candidate.source === 'response' ||
      candidate.source === 'bootstrap' || candidate.source === 'page') &&
    [candidate.plan, candidate.basePlanId, candidate.offerId,
      candidate.price, candidate.currency, candidate.billingPeriod]
      .every((field) => field === null || (typeof field === 'string' && field.length <= 130)) &&
    (!candidate.currency || Boolean(safeCurrency(candidate.currency))) &&
    (!candidate.offerId || Boolean(safeId(candidate.offerId))) &&
    (!candidate.basePlanId || Boolean(safeId(candidate.basePlanId))) &&
    (candidate.phaseIndex === undefined || candidate.phaseIndex === null ||
      (Number.isInteger(candidate.phaseIndex) && candidate.phaseIndex >= 0 && candidate.phaseIndex < 30)) &&
    (candidate.priceMicros === undefined || candidate.priceMicros === null ||
      (typeof candidate.priceMicros === 'string' && /^\d{1,19}$/.test(candidate.priceMicros)));
}
