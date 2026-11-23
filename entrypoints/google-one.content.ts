import { browser } from 'wxt/browser';
import { collectVisibleOffers } from '../lib/offers-dom';
import { extractBootstrapOffers, extractJslogOffers } from '../lib/bootstrap-offers';
import { matchesOfficialSkuCta, validSkuSelection, type SkuSelection } from '../lib/sku-selection';
import { uniqueNetworkOffers, type NetworkOffer } from '../lib/network-offers';
import {
  isCandidateMatch, isOfficialGoogleOneUrl, isPlanChoiceId,
  type PlanChoiceId,
} from '../lib/official-google-one';

type OfficialAction = 'G1_OFFICIAL_PLAN_PREVIEW' | 'G1_OFFICIAL_PLAN_OPEN';
type PlanMessage = { kind: OfficialAction; choice: unknown };
type Found = { element: HTMLElement; label: string };

export default defineContentScript({
  matches: ['https://one.google.com/*'],
  runAt: 'document_idle',
  main() {
    let lastPreview: { choice: PlanChoiceId; element: HTMLElement; at: number } | null = null;

    const isVisible = (item: HTMLElement): boolean => {
      if (!item.isConnected || item.getClientRects().length === 0 ||
          item.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      const style = window.getComputedStyle(item);
      return style.visibility !== 'hidden' && style.display !== 'none' &&
        style.pointerEvents !== 'none';
    };

    const safeAction = (candidate: HTMLElement): boolean => {
      if (!isVisible(candidate)) return false;
      if ((candidate instanceof HTMLButtonElement && (candidate.disabled ||
          candidate.type === 'submit')) ||
          candidate.getAttribute('aria-disabled') === 'true') return false;
      if (candidate instanceof HTMLAnchorElement && candidate.href) {
        try {
          const url = new URL(candidate.href, location.href);
          // Only this verified official Google One site may be opened.
          if (!isOfficialGoogleOneUrl(url.href)) return false;
        } catch { return false; }
      }
      return true;
    };

    const findMatchingButtons = (choice: PlanChoiceId): Found[] => {
      if (!isOfficialGoogleOneUrl(location.href)) return [];
      const result: Found[] = [];
      const nodes = document.querySelectorAll<HTMLElement>('a, button, [role="button"]');
      for (const node of Array.from(nodes).slice(0, 800)) {
        if (!safeAction(node)) continue;
        const label = (node.getAttribute('aria-label') ?? node.innerText ?? node.textContent ?? '').trim();
        if (!label || label.length > 90) continue;

        let parent: HTMLElement | null = node;
        for (let depth = 0; depth < 8 && parent; depth++, parent = parent.parentElement) {
          if (parent === document.body || parent === document.documentElement) break;
          const text = (parent.innerText ?? parent.textContent ?? '').trim();
          if (isCandidateMatch(text, label, choice)) {
            result.push({ element: node, label });
            break;
          }
          if (text.length > 2300) break;
        }
      }
      return result;
    };

    const inspectAction = (raw: PlanMessage) => {
      if (!isPlanChoiceId(raw.choice)) {
        return { status: 'invalid', message: 'Gói không được hỗ trợ. Không gửi request.' };
      }
      const choice = raw.choice;
      const candidates = findMatchingButtons(choice);
      if (raw.kind === 'G1_OFFICIAL_PLAN_PREVIEW') {
        lastPreview = null;
        if (!candidates.length) {
          return { status: 'not-found', message:
            'Không thấy nút chọn gói và đúng giá trên trang Google One. Không gửi SKU từ HAR.' };
        }
        if (candidates.length !== 1) {
          return { status: 'ambiguous', message:
            'Có nhiều nút phù hợp. Vui lòng chọn gói trực tiếp trên website Google.' };
        }
        const match = candidates[0]!;
        lastPreview = { choice, element: match.element, at: Date.now() };
        match.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        match.element.style.outline = '3px solid #5b9aff';
        match.element.style.outlineOffset = '3px';
        return { status: 'ready', message: 'Đã tìm thấy nút Google One: ' + match.label +
          '. Nhấn Mở gói trên Google để tiếp tục.', label: match.label };
      }

      // Explicit second action from the popup, never a scheduled or auto-submitted purchase.
      if (!lastPreview || lastPreview.choice !== choice ||
          Date.now() - lastPreview.at > 90_000) {
        return { status: 'not-previewed', message: 'Hãy tìm và kiểm tra gói trước khi mở.' };
      }
      const matches = candidates.filter((item) => item.element === lastPreview?.element);
      if (candidates.length !== 1 || matches.length !== 1) {
        lastPreview = null;
        return { status: 'changed', message: 'Trang Google đã thay đổi; hãy tìm lại gói.' };
      }
      const candidate = matches[0]!.element;
      lastPreview = null;
      // Triggers Google One's own existing plan-entry control. This may make
      // legitimate requests in the page session; no private RPC is constructed.
      candidate.click();
      return { status: 'clicked', message:
        'Đã nhấn nút mở gói trên website Google. Kiểm tra giá, thuế và điều kiện trên checkout chính thức trước khi thanh toán.' };
    };



    let lastSkuPreview: { selection: SkuSelection; element: HTMLElement; at: number } | null = null;

    function findSkuCta(selection: SkuSelection): Found[] {
      if (!isOfficialGoogleOneUrl(location.href)) return [];
      const found: Found[] = [];
      for (const node of Array.from(document.querySelectorAll<HTMLElement>('[jslog]')).slice(0, 400)) {
        if (!safeAction(node)) continue;
        const jslog = node.getAttribute('jslog') ?? '';
        const label = (node.getAttribute('aria-label') ??
          node.innerText ?? node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 95);
        if (!label || label.length > 90) continue;

        // Only the exact DOM element with this SKU, NEVER a made-up checkout URL
        // or a request assembled from captured billing data.
        let parent: HTMLElement | null = node;
        for (let depth = 0; depth < 6 && parent; depth++, parent = parent.parentElement) {
          if (parent === document.body || parent === document.documentElement) break;
          const text = (parent.innerText ?? parent.textContent ?? '').trim().replace(/\s+/g, ' ');
          if (text.length > 1500) break;
          if (matchesOfficialSkuCta(jslog, label, text, selection)) {
            found.push({ element: node, label });
            break;
          }
        }
      }
      return found;
    }

    function inspectSku(raw: { selection?: unknown; kind?: unknown }) {
      if (!validSkuSelection(raw.selection)) {
        return { status: 'invalid', message: 'SKU hoặc giá không hợp lệ. Không thực hiện yêu cầu.' };
      }
      const selection = raw.selection;
      const matches = findSkuCta(selection);
      if (raw.kind === 'G1_SKU_PREVIEW') {
        lastSkuPreview = null;
        if (!matches.length) {
          return { status: 'not-found', message:
            'SKU có trong dữ liệu nhưng không có nút đăng ký cùng giá trên trang hiện tại. Không thể mở checkout cho SKU này.' };
        }
        if (matches.length !== 1) {
          return { status: 'ambiguous', message:
            'Có nhiều nút cùng SKU/giá. Vui lòng thao tác trực tiếp trên website Google.' };
        }
        const match = matches[0]!;
        lastSkuPreview = { selection, element: match.element, at: Date.now() };
        match.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        match.element.style.outline = '3px solid #5b9aff';
        match.element.style.outlineOffset = '3px';
        return { status: 'ready', message:
          'Đúng SKU ' + selection.productId + ' · ' + selection.expectedPrice +
          '. Đã đánh dấu nút đăng ký. Xác nhận để Google One tự mở luồng checkout.' };
      }
      if (!lastSkuPreview || Date.now() - lastSkuPreview.at > 60_000 ||
          lastSkuPreview.selection.productId !== selection.productId ||
          lastSkuPreview.selection.expectedPrice !== selection.expectedPrice ||
          lastSkuPreview.selection.basePlanId !== selection.basePlanId ||
          lastSkuPreview.selection.billingPeriod !== selection.billingPeriod) {
        return { status: 'expired', message: 'SKU hoặc trang đã thay đổi, hãy kiểm tra lại trước.' };
      }
      const match = matches.filter((candidate) => candidate.element === lastSkuPreview?.element);
      if (matches.length !== 1 || match.length !== 1) {
        lastSkuPreview = null;
        return { status: 'changed', message: 'Nút đăng ký đã thay đổi, không thực hiện.' };
      }
      const target = match[0]!.element;
      lastSkuPreview = null;
      target.style.outline = '';
      target.style.outlineOffset = '';
      // Only invoke Google's currently visible entry CTA, not any final
      // payment action. Google may reject enrollment or ignore synthetic clicks.
      target.click();
      return { status: 'clicked', message:
        'Đã nhấn nút đăng ký gắn với SKU ' + selection.productId +
        '. Kiểm tra cửa sổ checkout của Google để biết giá và khả năng đăng ký; chưa xác nhận mua thành công.' };
    }

    // Detect visible plans automatically on page load and after Google SPA
    // changes. Only sanitized Offer fields, never raw page HTML, leave the tab.
    let lastFingerprint = '';
    let lastBootstrapFingerprint = '';
    // Scan each Google bootstrap script once, not on every SPA DOM mutation.
    const bootstrapCache = new WeakMap<HTMLScriptElement, NetworkOffer[]>();

    function captureEmbedded() {
      try {
        const rows: NetworkOffer[] = [];
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>(
          'script:not([src])'
        )).slice(0, 80);
        for (const script of scripts) {
          let extracted = bootstrapCache.get(script);
          if (!extracted) {
            const content = script.textContent ?? '';
            extracted = content.includes('AF_initDataCallback')
              ? extractBootstrapOffers(content) : [];
            bootstrapCache.set(script, extracted);
          }
          rows.push(...extracted);
        }

        // Prefer structured bootstrap metadata; jslog is a fallback for
        // SKUs missing from the embedded catalog.
        const detailed = new Set(rows.filter((row) =>
          row.productId && row.basePlanId && row.price
        ).map((row) => row.productId));
        rows.push(...extractJslogOffers(document).filter((row) =>
          !detailed.has(row.productId)));
        const safe = uniqueNetworkOffers(rows).slice(0, 40);
        const fingerprint = JSON.stringify(safe);
        if (fingerprint === lastBootstrapFingerprint) return;
        lastBootstrapFingerprint = fingerprint;
        void browser.runtime.sendMessage({
          kind: 'G1_BOOTSTRAP_CAPTURE', offers: safe,
        }).catch(() => { lastBootstrapFingerprint = ''; });
      } catch { /* Local inspection must never interrupt Google's page. */ }
    }

    let captureTimer: ReturnType<typeof setTimeout> | undefined;
    function captureVisible() {
      try {
        const offers = collectVisibleOffers(document);
        const fingerprint = JSON.stringify(offers);
        if (fingerprint === lastFingerprint) return;
        lastFingerprint = fingerprint;
        void browser.runtime.sendMessage({ kind: 'G1_DOM_CAPTURE', offers }).catch(() => {
          // Extension may have been reloaded while this Google tab stayed open.
          lastFingerprint = '';
        });
      } catch { /* Passive reader must never break the page. */ }
    }
    function captureAll() {
      captureVisible();
      captureEmbedded();
    }
    function scheduleCapture() {
      if (captureTimer !== undefined) clearTimeout(captureTimer);
      captureTimer = setTimeout(() => {
        captureTimer = undefined;
        captureAll();
      }, 300);
    }
    captureAll();
    const observer = new MutationObserver(scheduleCapture);
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        subtree: true, childList: true, characterData: true,
      });
    }
    window.addEventListener('pageshow', scheduleCapture);
    window.addEventListener('popstate', scheduleCapture);
    window.addEventListener('hashchange', scheduleCapture);

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return;
      if (message.kind === 'G1_SKU_PREVIEW' || message.kind === 'G1_SKU_OPEN') {
        sendResponse(inspectSku(message as { selection?: unknown; kind?: unknown }));
        return;
      }
      if (message.kind === 'G1_OFFICIAL_PLAN_PREVIEW' || message.kind === 'G1_OFFICIAL_PLAN_OPEN') {
        sendResponse(inspectAction(message as PlanMessage));
        return;
      }
      if (message.kind === 'G1_DOM_REFRESH') {
        lastFingerprint = '';
        lastBootstrapFingerprint = '';
        captureAll();
        sendResponse({ ok: true });
      }
    });
  },
});
