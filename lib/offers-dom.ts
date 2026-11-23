import { analyzeOfferText, dedupeOffers, type Offer } from './offers.ts';

const PLAN_PATTERN = /(?:\b\d{1,3}\s*(?:TB|GB)\b|google\s*(?:ai\s*)?(?:ultra|pro|plus|one))/i;

/**
 * Extract summaries from visible plan cards, without reading cookies,
 * intercepting requests, collecting account details, or exporting raw HTML.
 */
export function collectVisibleOffers(doc: Document): Offer[] {
  const candidates: string[] = [];
  const add = (element: Element | null) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('[aria-hidden="true"], [hidden]')) return;
    if (element.getClientRects().length === 0) return;
    const style = doc.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') return;
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length >= 10 && text.length <= 850 && PLAN_PATTERN.test(text)) {
      candidates.push(text);
    }
  };

  // Common card containers. Avoid reading the whole page or account profile.
  doc.querySelectorAll('article, [role="article"], section, li, [data-testid*="plan"], [class*="plan-card"], [class*="pricing-card"]')
    .forEach(add);

  // Google's actual Google One plan CTAs are frequently nested in plain divs
  // with a jslog SKU attribute, rather than <button> or a semantic <section>.
  // Always scan these, even if some generic cards were found above.
  const elements = doc.querySelectorAll<HTMLElement>(
    'button, [role="button"], [jslog]'
  );
  for (const node of Array.from(elements).slice(0, 250)) {
    let ancestor: HTMLElement | null = node;
    for (let depth = 0; depth < 8 && ancestor; depth++, ancestor = ancestor.parentElement) {
      if (ancestor === doc.body) break;
      const text = (ancestor.innerText || ancestor.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 1300) break;
      // Keep the nearest compact group carrying a recognizable plan and price.
      if (text.length >= 24 && PLAN_PATTERN.test(text) &&
          /(?:₫|VND|USD|\$|€|£)/i.test(text)) {
        add(ancestor);
        break;
      }
    }
  }

  const parsed: Offer[] = [];
  for (const text of candidates.slice(0, 100)) {
    const offer = analyzeOfferText(text, 'page');
    if (offer) parsed.push(offer);
  }
  // Never return raw text or URL query strings, which may contain user data.
  return dedupeOffers(parsed).slice(0, 20);
}
