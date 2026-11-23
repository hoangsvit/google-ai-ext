import { browser } from 'wxt/browser';
import { analyzeOfferText, type Offer, type OfferKind } from '../../lib/offers';
import { extractHarNetworkOffers, isNetworkOffer, uniqueNetworkOffers, type NetworkOffer } from '../../lib/network-offers';
import { assessOffers, summarizeAssessments, type OfferStatus } from '../../lib/offer-assessment';
import { createDemoOffer, DEMO_LABEL, type DemoVariant } from '../../lib/demo-offer';
import { compareBasePlans } from '../../lib/base-plan-comparison';
import { isOfficialGoogleOneUrl, isPlanChoiceId, OFFICIAL_GOOGLE_AI_PLANS_URL, type PlanChoiceId } from '../../lib/official-google-one';
import './style.css';

type ScanReply = {
  kind: 'GOOGLE_ONE_OFFERS_RESULT';
  offers: Offer[];
  scannedAt: string;
  error?: string;
};

const scan = document.querySelector<HTMLButtonElement>('#scan')!;
const open = document.querySelector<HTMLButtonElement>('#open')!;
const analyze = document.querySelector<HTMLButtonElement>('#analyze')!;
const manualInput = document.querySelector<HTMLTextAreaElement>('#manual-input')!;
const results = document.querySelector<HTMLElement>('#results')!;
const count = document.querySelector<HTMLElement>('#count')!;
const status = document.querySelector<HTMLElement>('#status')!;
const networkRefresh = document.querySelector<HTMLButtonElement>('#network-refresh')!;
const networkClear = document.querySelector<HTMLButtonElement>('#network-clear')!;
const networkResults = document.querySelector<HTMLElement>('#network-results')!;
const harFile = document.querySelector<HTMLInputElement>('#har-file')!;
const harStatus = document.querySelector<HTMLElement>('#har-status')!;
const offerEvidence = document.querySelector<HTMLElement>('#offer-evidence')!;
const demoOffer = document.querySelector<HTMLButtonElement>('#demo-offer')!;
const demoPlan = document.querySelector<HTMLSelectElement>('#demo-plan')!;
const demoNote = document.querySelector<HTMLElement>('#demo-note')!;
const openRewriteLab = document.querySelector<HTMLButtonElement>('#open-rewrite-lab')!;
const officialChoice = document.querySelector<HTMLSelectElement>('#official-choice')!;
const officialSite = document.querySelector<HTMLButtonElement>('#official-site')!;
const officialPreview = document.querySelector<HTMLButtonElement>('#official-preview')!;
const officialLaunch = document.querySelector<HTMLButtonElement>('#official-launch')!;
const officialStatus = document.querySelector<HTMLElement>('#official-status')!;
let approvedPreview: { choice: PlanChoiceId; tabId: number } | null = null;

const kindLabels: Record<OfferKind, string> = {
  'free-trial': 'Dùng thử miễn phí',
  discount: 'Có dấu hiệu ưu đãi',
  paid: 'Giá trả phí',
  unknown: 'Chưa rõ giá',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function render(offers: Offer[]) {
  results.replaceChildren();
  count.textContent = String(offers.length);
  if (offers.length === 0) {
    results.append(el('div', 'empty', 'Không phát hiện gói nào. Trang có thể chưa tải xong hoặc bố cục Google đã thay đổi.'));
    return;
  }

  for (const offer of offers) {
    const card = el('article', 'offer-card');
    const top = el('div', 'offer-top');
    const title = el('h3', '', offer.plan);
    const badge = el('span', 'offer-badge ' + offer.kind, kindLabels[offer.kind]);
    top.append(title, badge);
    card.append(top);

    if (offer.storage) card.append(el('div', 'storage', offer.storage));
    card.append(el('div', 'price', offer.price ?? 'Giá chưa xác định'));

    const details = [offer.period ? 'Thời hạn: ' + offer.period : null, offer.discount ? 'Giảm: ' + offer.discount : null]
      .filter((value): value is string => Boolean(value));
    if (details.length) card.append(el('div', 'offer-details', details.join(' · ')));
    card.append(el('div', 'source', offer.source === 'page' ? 'Nguồn: nội dung trang' : 'Nguồn: văn bản bạn dán'));
    results.append(card);
  }
}

async function scanTab() {
  scan.disabled = true;
  setStatus('Đang đọc các gói hiển thị trên tab hiện tại…');
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Không tìm thấy tab trình duyệt đang hoạt động.', true);
      return;
    }
    const reply: unknown = await browser.tabs.sendMessage(tab.id, { kind: 'GOOGLE_ONE_OFFERS_SCAN' });
    if (!reply || typeof reply !== 'object' || !('kind' in reply) ||
      reply.kind !== 'GOOGLE_ONE_OFFERS_RESULT' || !('offers' in reply) ||
      !Array.isArray(reply.offers)) {
      setStatus('Không đọc được kết quả. Hãy tải lại trang Google One và thử lại.', true);
      return;
    }
    const data = reply as ScanReply;
    render(data.offers);
    setStatus(data.error || ('Đã kiểm tra ' + new Date(data.scannedAt).toLocaleTimeString('vi-VN') + '. Chỉ là nhận diện sơ bộ.'), Boolean(data.error));
  } catch {
    render([]);
    setStatus('Hãy mở https://one.google.com/ai, tải lại trang rồi nhấn Quét tab. Trang Google One khác chưa được hỗ trợ.', true);
  } finally {
    scan.disabled = false;
  }
}

scan.addEventListener('click', () => void scanTab());
open.addEventListener('click', () => {
  void browser.tabs.create({ url: 'https://one.google.com/ai' });
});
analyze.addEventListener('click', () => {
  const text = manualInput.value.trim();
  if (!text) {
    setStatus('Nhập mô tả gói trước khi phân tích.', true);
    return;
  }
  const offer = analyzeOfferText(text);
  render(offer ? [offer] : []);
  setStatus(offer
    ? 'Đã phân tích văn bản bạn dán; chưa xác minh ưu đãi với Google.'
    : 'Không tìm thấy gói Google One/AI hoặc dung lượng phù hợp trong mô tả.', !offer);
});

/** Repeated text nodes are created safely via textContent rather than HTML. */
const networkKinds: Record<OfferStatus, string> = {
  trial: 'Có giai đoạn dùng thử',
  introductory: 'Có giá giới thiệu',
  'offer-candidate': 'Có Offer ID · cần xác nhận giá',
  standard: 'Gói theo giá thông thường',
  unknown: 'Chưa xác định giá',
};

function renderNetwork(raw: NetworkOffer[], isDemo = false) {
  demoNote.hidden = !isDemo;
  networkResults.classList.toggle('demo-mode', isDemo);
  networkResults.replaceChildren();
  const safeRows = uniqueNetworkOffers(raw.filter(isNetworkOffer)).slice(0, 40);
  const assessments = assessOffers(safeRows);
  const comparisons = compareBasePlans(safeRows);
  const summary = summarizeAssessments(assessments);
  offerEvidence.textContent = isDemo
    ? DEMO_LABEL + ' · Dữ liệu mẫu lấy từ fixture cục bộ, không kết nối API Google. ' +
      (comparisons.length ? 'Có ' + comparisons.length + ' cặp base plan để so sánh.' :
        'Xem thông tin gói mẫu bên dưới.')
    : assessments.length
      ? summary.products + ' sản phẩm · ' + summary.candidates +
        ' gói có dấu hiệu ưu đãi. ' + summary.message
      : 'Chưa có dữ liệu mạng để xác định ưu đãi. Tải lại Google One hoặc nhập file HAR.';

  if (!assessments.length) {
    networkResults.append(el('div', 'empty', 'Chưa có dữ liệu. Có thể nhập HAR hoặc quét lại trang Google One.'));
    return;
  }

  for (const comparison of comparisons) {
    const card = el('article', 'compare-card');
    card.append(el('h3', '', 'So sánh base plan · ' +
      (comparison.plan ?? comparison.productId)));
    const prices = el('div', 'compare-prices');
    const higher = el('div');
    higher.append(el('small', '', comparison.higherBasePlanId));
    higher.append(el('strong', '', comparison.higherPrice));
    const lower = el('div');
    lower.append(el('small', '', comparison.lowerBasePlanId));
    lower.append(el('strong', '', comparison.lowerPrice));
    prices.append(higher, lower);
    card.append(prices);
    card.append(el('div', 'compare-warning',
      'Chênh lệch ' + comparison.differencePercent.toLocaleString('vi-VN') +
      '% cùng chu kỳ ' + comparison.billingPeriod +
      '. Đây là hai base plan riêng, không phải giá giảm theo thời gian. Chưa xác minh điều kiện mua.'));
    networkResults.append(card);
  }

  for (const offer of assessments) {
    const card = el('article', 'net-card');
    card.append(el('h3', '', offer.plan ?? 'Google One · sản phẩm'));
    card.append(el('div', 'net-code', offer.productId));
    card.append(el('div', 'offer-state', networkKinds[offer.kind]));
    card.append(el('div', 'net-price', offer.initialPrice ?? 'Giá chưa xác định'));

    const attributes = [
      offer.basePlanId && 'Base plan: ' + offer.basePlanId,
      offer.offerId && 'Offer ID: ' + offer.offerId,
      offer.billingPeriod && 'Chu kỳ: ' + offer.billingPeriod,
      offer.laterPrice && 'Giá sau ưu đãi: ' + offer.laterPrice,
      offer.phaseCount > 1 && 'Các giai đoạn giá: ' + offer.phaseCount,
    ].filter((item): item is string => Boolean(item));
    if (attributes.length) card.append(el('div', 'net-meta', attributes.join(' · ')));
    networkResults.append(card);
  }
}

async function currentTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function refreshNetwork() {
  networkRefresh.disabled = true;
  try {
    const tabId = await currentTabId();
    if (tabId === null) {
      harStatus.textContent = 'Không có tab hiện tại.';
      return;
    }
    const reply: unknown = await browser.runtime.sendMessage({ kind: 'G1_NETWORK_GET', tabId });
    const offers = reply && typeof reply === 'object' && 'offers' in reply &&
      Array.isArray(reply.offers) ? reply.offers.filter(isNetworkOffer) : [];
    renderNetwork(offers);
    harStatus.textContent = offers.length
      ? 'Đã đọc ' + offers.length + ' bản ghi metadata trong bộ nhớ tạm.'
      : 'Chưa có bản ghi. Tải lại trang Google One và thử lại.';
  } catch {
    harStatus.textContent = 'Không kết nối được bộ nhớ mạng của extension.';
  } finally {
    networkRefresh.disabled = false;
  }
}

networkRefresh.addEventListener('click', () => void refreshNetwork());
demoOffer.addEventListener('click', () => {
  // Local-only fixture. Never send a request or patch the live page.
  const supported: DemoVariant[] = ['ultra-3m', 'pro-5tb', 'pro-youtube', 'plus-400gb'];
  const selected = supported.find((option) => option === demoPlan.value) ?? 'pro-5tb';
  renderNetwork(createDemoOffer(selected), true);
  harStatus.textContent = 'Đã nạp gói DEMO: ' + demoPlan.selectedOptions[0]?.textContent +
    '. Không thay đổi response hoặc thanh toán Google.';
});
networkClear.addEventListener('click', () => {
  void (async () => {
    const tabId = await currentTabId();
    if (tabId !== null) await browser.runtime.sendMessage({ kind: 'G1_NETWORK_CLEAR', tabId });
    renderNetwork([]);
    harFile.value = '';
    harStatus.textContent = 'Đã xóa dữ liệu tạm của tab hiện tại.';
  })().catch(() => { harStatus.textContent = 'Không xóa được dữ liệu mạng.'; });
});

harFile.addEventListener('change', () => {
  void (async () => {
    const file = harFile.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      harStatus.textContent = 'File HAR vượt quá 8 MB; không đọc để tránh treo popup.';
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const offers = extractHarNetworkOffers(parsed);
      renderNetwork(offers);
      harStatus.textContent = 'Đã phân tích trên thiết bị: ' + offers.length +
        ' bản ghi. Không lưu hoặc gửi file HAR đi đâu.';
    } catch {
      harStatus.textContent = 'File HAR/JSON không hợp lệ.';
    }
  })();
});

openRewriteLab.addEventListener('click', () => {
  void browser.tabs.create({ url: browser.runtime.getURL('/response-lab.html') });
});


function resetOfficialPreview(): void {
  approvedPreview = null;
  officialLaunch.disabled = true;
}

async function activeOfficialTab(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id && isOfficialGoogleOneUrl(tab.url) ? tab.id : null;
}

officialChoice.addEventListener('change', () => {
  resetOfficialPreview();
  officialStatus.textContent = 'Đã đổi gói. Bấm Tìm gói trên trang để kiểm tra với Google.';
});

officialSite.addEventListener('click', () => {
  resetOfficialPreview();
  officialStatus.textContent = 'Đã mở trang gói chính thức. Chọn tab đó và mở lại extension để tiếp tục.';
  void browser.tabs.create({ url: OFFICIAL_GOOGLE_AI_PLANS_URL }).catch(() => {
    officialStatus.textContent = 'Không mở được trang Google One.';
  });
});

officialPreview.addEventListener('click', () => {
  void (async () => {
    resetOfficialPreview();
    officialPreview.disabled = true;
    try {
      const choice = officialChoice.value;
      if (!isPlanChoiceId(choice)) throw new Error('Gói không hợp lệ.');
      const tabId = await activeOfficialTab();
      if (tabId === null) {
        officialStatus.textContent = 'Bạn cần đang ở tab https://one.google.com. Bấm Mở Google One rồi thử lại.';
        return;
      }
      const reply: unknown = await browser.tabs.sendMessage(tabId, {
        kind: 'G1_OFFICIAL_PLAN_PREVIEW', choice,
      });
      if (!reply || typeof reply !== 'object' || !('status' in reply)) {
        throw new Error('Không xác nhận được gói trên website.');
      }
      const result = reply as { status: string; message?: string };
      officialStatus.textContent = result.message ?? 'Không tìm thấy gói.';
      if (result.status === 'ready') {
        approvedPreview = { choice, tabId };
        officialLaunch.disabled = false;
      }
    } catch {
      officialStatus.textContent =
        'Không tìm được nút chọn gói. Hãy tải lại Google One và thử lại, hoặc chọn thủ công trên website.';
    } finally {
      officialPreview.disabled = false;
    }
  })();
});

officialLaunch.addEventListener('click', () => {
  void (async () => {
    const preview = approvedPreview;
    resetOfficialPreview();
    if (!preview) return;
    const tabId = await activeOfficialTab();
    if (tabId !== preview.tabId || officialChoice.value !== preview.choice) {
      officialStatus.textContent = 'Tab hoặc gói đã đổi; vui lòng tìm lại trước khi mở.';
      return;
    }
    try {
      const reply: unknown = await browser.tabs.sendMessage(tabId, {
        kind: 'G1_OFFICIAL_PLAN_OPEN', choice: preview.choice,
      });
      if (!reply || typeof reply !== 'object' || !('status' in reply)) {
        officialStatus.textContent = 'Trang đã thay đổi, hãy kiểm tra trực tiếp trên tab Google One.';
        return;
      }
      const result = reply as { status: string; message?: string };
      officialStatus.textContent = result.message ??
        'Không thể xác nhận đã mở gói. Hãy thao tác trực tiếp trên Google One.';
    } catch {
      officialStatus.textContent = 'Google One có thể đang chuyển trang. Hãy kiểm tra giao diện chính thức.';
    }
  })();
});

// Network data is cached only in a temporary background service worker.
void refreshNetwork();
