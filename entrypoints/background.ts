import { browser } from 'wxt/browser';
import { isNetworkOffer, uniqueNetworkOffers, type NetworkOffer } from '../lib/network-offers';
import type { Offer } from '../lib/offers';
import { finishTrial, isSafeRpc, observeTrialRpc, startTrial, TRIAL_WINDOW_MS,
  type TrialState } from '../lib/trial-observer';

export interface TabCapture {
  connected: boolean;
  networkEvents: number;
  network: NetworkOffer[];
  dom: Offer[];
  updatedAt: number;
  trial: TrialState | null;
}
const emptyCapture = (): TabCapture => ({
  connected: false, networkEvents: 0, network: [], dom: [], updatedAt: 0,
  trial: null,
});
const tabKey = (id: number) => 'g1-tab-' + id;
const MAX_CAPTURED = 40;

function isGoogleSource(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' &&
      (url.hostname === 'one.google.com' || url.hostname === 'tokenized.play.google.com');
  } catch { return false; }
}
function safeDom(rows: unknown): Offer[] {
  if (!Array.isArray(rows)) return [];
  const kinds = new Set(['free-trial', 'discount', 'paid', 'unknown']);
  return rows.slice(0, 20).filter((row): row is Offer => {
    if (!row || typeof row !== 'object') return false;
    const o = row as Partial<Offer>;
    return o.source === 'page' && typeof o.plan === 'string' &&
      o.plan.length <= 100 && typeof o.kind === 'string' && kinds.has(o.kind) &&
      [o.storage, o.price, o.period, o.discount].every((v) =>
        v === null || (typeof v === 'string' && v.length <= 90));
  }).map(({ plan, storage, price, period, discount, kind, source }) => ({
    plan, storage, price, period, discount, kind, source,
  }));
}
function safeNetwork(rows: unknown): NetworkOffer[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isNetworkOffer).slice(0, MAX_CAPTURED).map((offer) => ({
    productId: offer.productId, plan: offer.plan, basePlanId: offer.basePlanId,
    offerId: offer.offerId, price: offer.price, currency: offer.currency,
    billingPeriod: offer.billingPeriod, source: offer.source,
    phaseIndex: offer.phaseIndex ?? null, priceMicros: offer.priceMicros ?? null,
  }));
}

export default defineBackground(() => {
  // Session memory survives service-worker suspension but not browser restart.
  // Per-tab mutation ordering avoids simultaneous iframe messages overwriting captures.
  const pending = new Map<number, Promise<void>>();
  const read = async (tabId: number): Promise<TabCapture> => {
    const stored = await browser.storage.session.get(tabKey(tabId));
    const value = stored[tabKey(tabId)] as TabCapture | undefined;
    return value && typeof value === 'object'
      ? { ...value, trial: value.trial ?? null } : emptyCapture();
  };
  const update = (tabId: number, patch: (previous: TabCapture) => TabCapture): Promise<void> => {
    const previousTask = pending.get(tabId) ?? Promise.resolve();
    const task = previousTask.catch(() => {}).then(async () => {
      const original = await read(tabId);
      const next = patch(original);
      if (JSON.stringify({
        connected: original.connected, networkEvents: original.networkEvents,
        network: original.network, dom: original.dom, trial: original.trial,
      }) === JSON.stringify({
        connected: next.connected, networkEvents: next.networkEvents,
        network: next.network, dom: next.dom, trial: next.trial,
      })) return;
      await browser.storage.session.set({ [tabKey(tabId)]: next });
      const count = Math.max(new Set(next.network.map((item) => item.productId)).size, next.dom.length);
      try {
        await browser.action.setBadgeText({
          tabId, text: count === 0 ? '' : count > 9 ? '9+' : String(count),
        });
        if (count) await browser.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
      } catch { /* Tab closed while recording. */ }
    });
    pending.set(tabId, task);
    void task.finally(() => {
      if (pending.get(tabId) === task) pending.delete(tabId);
    }).catch(() => {});
    return task;
  };
  const clear = async (tabId: number): Promise<void> => {
    await (pending.get(tabId) ?? Promise.resolve()).catch(() => {});
    const previous = await read(tabId);
    // A normal page navigation can follow a valid checkout entry click.
    // Preserve its short-lived diagnostics while clearing stale SKU metadata.
    if (previous.trial && Date.now() - previous.trial.startAt <= TRIAL_WINDOW_MS) {
      await browser.storage.session.set({
        [tabKey(tabId)]: { ...emptyCapture(), trial: previous.trial },
      });
    } else {
      await browser.storage.session.remove(tabKey(tabId));
    }
    try { await browser.action.setBadgeText({ tabId, text: '' }); }
    catch { /* Tab closed. */ }
  };

  browser.runtime.onMessage.addListener((raw: unknown, sender) => {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as {
      kind?: string; offers?: unknown; tabId?: number; activity?: boolean;
      rpc?: unknown; productId?: unknown; expectedPrice?: unknown;
      clicked?: unknown;
    };
    if (message.kind === 'G1_CAPTURE_GET' && Number.isInteger(message.tabId) &&
        sender.tab === undefined && message.tabId! >= 0) {
      return read(message.tabId!).then((state) => ({ state }));
    }
    if (message.kind === 'G1_CAPTURE_CLEAR' && Number.isInteger(message.tabId) &&
        sender.tab === undefined && message.tabId! >= 0) {
      return clear(message.tabId!).then(() => ({ ok: true }));
    }
    // Only the extension's popup can start/finish a trial. This is a passive
    // observation window, not a billing request.
    if (message.kind === 'G1_TRIAL_START' && Number.isInteger(message.tabId) &&
        sender.tab === undefined && message.tabId! >= 0) {
      const state = startTrial(
        typeof message.productId === 'string' ? message.productId : '',
        typeof message.expectedPrice === 'string' ? message.expectedPrice : '',
        Date.now(),
      );
      if (!state) return Promise.resolve({ ok: false });
      return update(message.tabId!, (previous) => ({
        ...previous, trial: state, updatedAt: Date.now(),
      })).then(() => ({ ok: true }));
    }
    if (message.kind === 'G1_TRIAL_FINISH' && Number.isInteger(message.tabId) &&
        sender.tab === undefined && message.tabId! >= 0) {
      return update(message.tabId!, (previous) => ({
        ...previous,
        trial: previous.trial ? finishTrial(previous.trial, message.clicked === true, Date.now()) : null,
        updatedAt: Date.now(),
      })).then(() => ({ ok: true }));
    }

    const tabId = sender.tab?.id;
    if (tabId === undefined || !isGoogleSource(sender.url)) return;

    if (message.kind === 'G1_DOM_CAPTURE') {
      const dom = safeDom(message.offers);
      return update(tabId, (previous) => ({
        ...previous, connected: true, dom, updatedAt: Date.now(),
      })).then(() => ({ ok: true }));
    }
    if (message.kind === 'G1_BOOTSTRAP_CAPTURE') {
      const found = safeNetwork(message.offers);
      return update(tabId, (previous) => ({
        ...previous, connected: true,
        // Bootstrap data is not a network event: do not increase RPC count.
        network: uniqueNetworkOffers([...found, ...previous.network]).slice(0, MAX_CAPTURED),
        updatedAt: Date.now(),
      })).then(() => ({ ok: true }));
    }
    if (message.kind === 'G1_NETWORK_CAPTURE' && message.activity === true) {
      const found = safeNetwork(message.offers);
      return update(tabId, (previous) => ({
        ...previous, connected: true,
        networkEvents: Math.min(previous.networkEvents + 1, 9999),
        network: uniqueNetworkOffers([...found, ...previous.network]).slice(0, MAX_CAPTURED),
        trial: isSafeRpc(message.rpc) ? observeTrialRpc(
          previous.trial, message.rpc, found.map((offer) => offer.productId), Date.now(),
        ) : previous.trial,
        updatedAt: Date.now(),
      })).then(() => ({ ok: true }));
    }
  });

  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') void clear(tabId).catch(() => {});
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void clear(tabId).catch(() => {});
  });
});
