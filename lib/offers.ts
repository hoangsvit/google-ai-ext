/**
 * Pure, best-effort parsing of plan text already visible to the user.
 * These are UI hints, NOT Google billing entitlements or verified prices.
 */
export type OfferKind = 'free-trial' | 'discount' | 'paid' | 'unknown';
export type OfferSource = 'page' | 'manual';

export interface Offer {
  plan: string;
  storage: string | null;
  price: string | null;
  period: string | null;
  discount: string | null;
  kind: OfferKind;
  source: OfferSource;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function analyzeOfferText(raw: string, source: OfferSource = 'manual'): Offer | null {
  const text = clean(raw.slice(0, 1800));
  if (text.length < 5) return null;

  const hasUltra = /\b(?:google\s*(?:ai\s*)?ultra|ai\s*ultra)\b/i.test(text);
  const hasPro = /\b(?:google\s*ai\s*pro|ai\s*pro)\b/i.test(text);
  const hasGoogleOne = /\bgoogle\s*one\b/i.test(text);
  const storageMatch = text.match(/\b(\d{1,3})\s*(TB|GB)\b/i);
  if (!storageMatch && !hasUltra && !hasPro && !hasGoogleOne) return null;

  const plan = hasUltra
    ? 'Google AI Ultra'
    : hasPro
      ? 'Google AI Pro'
      : 'Google One';
  const storage = storageMatch ? storageMatch[1] + ' ' + storageMatch[2].toUpperCase() : null;

  const money = text.match(/(?:US\$|A\$|CA\$|\$|€|£)\s*\d[\d,.]*/i)
    ?? text.match(/\b\d[\d.,\s]{0,14}\s*(?:₫|VND|đồng|đ)(?=\s|\/|$)/i);
  const price = money ? clean(money[0]) : null;

  const periodMatch = text.match(/\b\d{1,2}\s*(?:tháng|months?|mos?\.?|năm|years?)\b/i);
  const period = periodMatch ? clean(periodMatch[0]) : null;
  const percentMatch = text.match(/\b(?:giảm|save|off)\s*(\d{1,3})\s*%/i)
    ?? text.match(/\b(\d{1,3})\s*%\s*(?:off|discount|giảm|saving)/i);
  const discount = percentMatch ? percentMatch[1] + '%' : null;

  const freeWords = /(?:miễn\s*phí|dùng\s*thử\s*miễn\s*phí|free\s*(?:trial|for|months?|plan)|no\s*charge)\b/i.test(text)
    || /\b0\s*(?:₫|VND|đồng)(?=\s|\/|$)/i.test(text);
  const promoWords = /(?:ưu\s*đãi|khuyến\s*mãi|giảm\s*giá|discount|introductory|promotion|promo|special\s*offer|first\s+\d+\s+months?)/i.test(text);
  const kind: OfferKind = freeWords
    ? 'free-trial'
    : price && (discount !== null || promoWords)
      ? 'discount'
      : price
        ? 'paid'
        : 'unknown';

  return { plan, storage, price, period, discount, kind, source };
}

export function dedupeOffers(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = [offer.plan, offer.storage, offer.price, offer.period, offer.kind]
      .map((value) => (value ?? '').toLocaleLowerCase())
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
