/**
 * Authorized Google One UI actions, not billing API calls.
 *
 * A HAR product ID is not a checkout URL, and a visible price is not
 * proof of account eligibility. Never synthesize a purchase RPC.
 */
export const OFFICIAL_GOOGLE_AI_PLANS_URL = 'https://one.google.com/about/google-ai-plans/';

export const PLAN_CHOICES = {
  'plus': { kind: 'plus', priceDigits: null, label: 'AI Plus · giá Google đang hiển thị' },
  'plus-132': { kind: 'plus', priceDigits: '132000', label: 'AI Plus · 132.000 ₫ (nếu xuất hiện)' },
  'pro': { kind: 'pro', priceDigits: null, label: 'AI Pro · giá Google đang hiển thị' },
  'pro-489': { kind: 'pro', priceDigits: '489000', label: 'AI Pro · 489.000 ₫ (nếu xuất hiện)' },
  'pro-122': { kind: 'pro', priceDigits: '122000', label: 'AI Pro · 122.000 ₫ (nếu xuất hiện)' },
  'pro-youtube': { kind: 'pro-youtube', priceDigits: '159000', label: 'AI Pro + YouTube · 159.000 ₫ (nếu xuất hiện)' },
  'ultra': { kind: 'ultra', priceDigits: null, label: 'AI Ultra · giá Google đang hiển thị' },
} as const;

export type PlanChoiceId = keyof typeof PLAN_CHOICES;
export type PlanKind = typeof PLAN_CHOICES[PlanChoiceId]['kind'];

export function isPlanChoiceId(value: unknown): value is PlanChoiceId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAN_CHOICES, value);
}

export function isOfficialGoogleOneUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'one.google.com';
  } catch { return false; }
}

function normalize(input: string): string {
  return input.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function isSafePlanEntryLabel(input: string): boolean {
  const label = normalize(input);
  if (!label || label.length > 90 ||
    /\b(pay|payment|confirm|purchase|place order|submit order|finalize|complete purchase|subscribe & pay|subscribe now|checkout now)\b/.test(label) ||
    /(thanh toán|xác nhận|mua ngay|hoàn tất|đặt mua|trả tiền|đặt hàng)/.test(label)) {
    return false;
  }
  return /^(get|start|select|choose|view|explore|upgrade|try|go to|see)\b/.test(label) ||
    /^(chọn gói|xem gói|xem chi tiết|bắt đầu|nâng cấp|khám phá|dùng thử|nhận gói|đăng ký gói)/.test(label);
}

export function matchesPlanText(text: string, kind: PlanKind): boolean {
  const value = normalize(text);
  if (value.length > 2300) return false; // Reject giant page-wide ancestors.
  const isPlus = /(?:google\s+ai|ai)\s+plus\b/.test(value);
  const isPro = /(?:google\s+ai|ai)\s+pro\b/.test(value);
  const isUltra = /(?:google\s+ai|ai)\s+ultra\b/.test(value);
  if (kind === 'plus') return isPlus && !isPro && !isUltra;
  if (kind === 'pro') return isPro && !isUltra && !isPlus;
  if (kind === 'pro-youtube') return isPro && /youtube\s+premium/i.test(value) && !isUltra && !isPlus;
  return isUltra && !isPro && !isPlus;
}

/**
 * Match the explicitly requested VND price in the same visible plan card.
 * Price 122.000 is never silently downgraded to the normal 489.000 plan.
 */
export function matchesObservedPrice(text: string, expectedDigits: string | null): boolean {
  if (!expectedDigits) return true;
  const value = normalize(text);
  if (!/^\d{6,9}$/.test(expectedDigits)) return false;
  const len = expectedDigits.length - 3;
  const beginning = expectedDigits.slice(0, len);
  const tail = expectedDigits.slice(len);
  const pattern = new RegExp('(?:^|[^0-9])' + beginning + '[.,\\s]?' + tail + '(?![0-9])');
  return pattern.test(value);
}

export function isCandidateMatch(text: string, label: string, choiceId: PlanChoiceId): boolean {
  const choice = PLAN_CHOICES[choiceId];
  return isSafePlanEntryLabel(label) &&
    matchesPlanText(text, choice.kind) &&
    matchesObservedPrice(text, choice.priceDigits);
}
