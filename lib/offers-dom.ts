import { analyzeOfferText, dedupeOffers, type Offer } from './offers';

const PLAN_PATTERN = /(?:\b\d{1,3}\s*(?:TB|GB)\b|google\s*(?:ai\s*)?(?:ultra|pro|one))/i;

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

  // Fallback for Google's evolving layout: read only compact groups around CTA buttons.
  if (candidates.length === 0) {
    doc.querySelectorAll('button, [role="button"]').forEach((button) => {
      let parent = button.parentElement;
      for (let depth = 0; depth < 4 && parent; depth++, parent = parent.parentElement) {
        const text = (parent.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length > 30 && text.length <= 850 && PLAN_PATTERN.test(text)) {
          add(parent);
          break;
        }
      }
    });
  }

  const parsed: Offer[] = [];
  for (const text of candidates.slice(0, 100)) {
    const offer = analyzeOfferText(text, 'page');
    if (offer) parsed.push(offer);
  }
  // Never return raw text or URL query strings, which may contain user data.
  return dedupeOffers(parsed).slice(0, 20);
}
