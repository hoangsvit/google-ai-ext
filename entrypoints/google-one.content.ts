import { browser } from 'wxt/browser';
import { collectVisibleOffers } from '../lib/offers-dom';
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


    // Detect visible plans automatically on page load and after Google SPA
    // changes. Only sanitized Offer fields, never raw page HTML, leave the tab.
    let lastFingerprint = '';
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
    function scheduleCapture() {
      if (captureTimer !== undefined) clearTimeout(captureTimer);
      captureTimer = setTimeout(() => {
        captureTimer = undefined;
        captureVisible();
      }, 300);
    }
    captureVisible();
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
      if (message.kind === 'G1_OFFICIAL_PLAN_PREVIEW' || message.kind === 'G1_OFFICIAL_PLAN_OPEN') {
        sendResponse(inspectAction(message as PlanMessage));
        return;
      }
      if (message.kind === 'G1_DOM_REFRESH') {
        lastFingerprint = '';
        captureVisible();
        sendResponse({ ok: true });
      }
    });
  },
});
