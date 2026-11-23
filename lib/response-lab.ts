import { createDemoOffer, type DemoVariant } from './demo-offer.ts';
import { isNetworkOffer, type NetworkOffer } from './network-offers.ts';

export const LAB_CATALOG_URL = 'https://response-lab.invalid/commerce/catalog';
export const LAB_CHECKOUT_URL = 'https://response-lab.invalid/commerce/checkout';

export type LabVariant = DemoVariant;
export interface LabPlan {
  basePlanId: string | null;
  offerId: string | null;
  phases: Array<{ price: string | null; billingPeriod: string | null; priceMicros: string | null }>;
}
export interface LabPayload {
  kind: 'eplus-response-lab';
  labOnly: true;
  productId: string;
  title: string;
  plans: LabPlan[];
}

type FetchTransport = typeof fetch;

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isLabPayload(value: unknown): value is LabPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LabPayload>;
  return candidate.kind === 'eplus-response-lab' && candidate.labOnly === true &&
    typeof candidate.productId === 'string' &&
    typeof candidate.title === 'string' && Array.isArray(candidate.plans);
}

function payloadFromFixture(variant: LabVariant): LabPayload {
  const rows = createDemoOffer(variant);
  const first = rows[0];
  if (!first) throw new Error('Missing local demo fixture');
  const plans: LabPlan[] = [];
  for (const row of rows) {
    const key = [row.basePlanId, row.offerId].join('|');
    let index = plans.findIndex((plan) =>
      [plan.basePlanId, plan.offerId].join('|') === key);
    if (index < 0) {
      index = plans.length;
      plans.push({ basePlanId: row.basePlanId, offerId: row.offerId, phases: [] });
    }
    plans[index]!.phases.push({
      price: row.price,
      billingPeriod: row.billingPeriod,
      priceMicros: row.priceMicros ?? null,
    });
  }
  return {
    kind: 'eplus-response-lab',
    labOnly: true,
    productId: first.productId,
    title: first.plan ?? 'Demo product',
    plans,
  };
}

/**
 * Convert a local HAR's already-sanitized metadata into a synthetic lab-only
 * response. Never include raw cookies, account data, request bodies or tokens.
 */
export function createLabPayloadFromOffers(rows: NetworkOffer[]): LabPayload | null {
  const usable = rows.filter(isNetworkOffer)
    .filter((row) => Boolean(row.basePlanId && row.price))
    .slice(0, 40);
  const first = usable[0];
  if (!first) return null;
  const selected = usable.filter((row) => row.productId === first.productId);
  const plans: LabPlan[] = [];
  for (const row of selected) {
    const key = [row.basePlanId, row.offerId].join('|');
    let index = plans.findIndex((plan) =>
      [plan.basePlanId, plan.offerId].join('|') === key);
    if (index < 0) {
      index = plans.length;
      plans.push({ basePlanId: row.basePlanId, offerId: row.offerId, phases: [] });
    }
    plans[index]!.phases.push({
      price: row.price,
      billingPeriod: row.billingPeriod,
      priceMicros: row.priceMicros ?? null,
    });
  }
  return {
    kind: 'eplus-response-lab',
    labOnly: true,
    productId: first.productId,
    title: first.plan ?? 'Google One — imported HAR metadata',
    plans,
  };
}

function basePayload(): LabPayload {
  return {
    kind: 'eplus-response-lab',
    labOnly: true,
    productId: 'g1.demo.original',
    title: 'DEMO — Google One original baseline',
    plans: [{
      basePlanId: 'monthly',
      offerId: null,
      phases: [{
        price: '489.000 ₫',
        billingPeriod: 'P1M',
        priceMicros: '489000000000',
      }],
    }],
  };
}

/**
 * Local transport, not a Google request. Uses .invalid (reserved, non-routable)
 * and deliberately rejects anything other than an exact lab catalog URL.
 */
export function createLabTransport(payload: LabPayload = basePayload()): FetchTransport {
  return (async (input: RequestInfo | URL) => {
    if (getUrl(input) !== LAB_CATALOG_URL) {
      throw new Error('LAB is restricted to the synthetic catalog URL');
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-lab-origin': 'local' },
    });
  }) as FetchTransport;
}

/**
 * Actual Fetch API Response replacement with a newly constructed Response.
 * Domain-locked to an extension-owned, fake catalog; cannot intercept or alter
 * Google One, Google Play, App Store or any real checkout.
 */
export function createLabResponseRewriter(
  transport: FetchTransport,
  enabled: () => boolean,
  selectedVariant: () => LabVariant,
): FetchTransport {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (!enabled() || getUrl(input) !== LAB_CATALOG_URL || !response.ok ||
        !response.headers.get('content-type')?.includes('application/json')) {
      return response;
    }
    let parsed: unknown;
    try {
      parsed = await response.clone().json();
    } catch {
      return response;
    }
    if (!isLabPayload(parsed)) return response;

    const replacement = payloadFromFixture(selectedVariant());
    return new Response(JSON.stringify(replacement), {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-lab-origin': 'local',
        'x-eplus-response-rewrite': 'demo-only',
      },
    });
  }) as FetchTransport;
}

export async function readLabPayload(response: Response): Promise<LabPayload> {
  const data: unknown = await response.json();
  if (!isLabPayload(data)) throw new Error('Not a LAB response');
  return data;
}
