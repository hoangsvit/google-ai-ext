import { browser } from 'wxt/browser';
import { extractHarNetworkOffers, isNetworkOffer, uniqueNetworkOffers, type NetworkOffer } from '../../lib/network-offers';
import { assessOffers, type OfferStatus } from '../../lib/offer-assessment';
import { compareBasePlans } from '../../lib/base-plan-comparison';
import { isOfficialGoogleOneUrl, OFFICIAL_GOOGLE_AI_PLANS_URL } from '../../lib/official-google-one';
import { skuChoicesFromCapturedRows, type SkuSelection, type SkuChoice } from '../../lib/sku-selection';
import type { Offer } from '../../lib/offers';
import './style.css';

interface TabCapture {
  connected: boolean;
  networkEvents: number;
  network: NetworkOffer[];
  dom: Offer[];
  updatedAt: number;
}

const connection = document.querySelector<HTMLElement>('#connection')!;
const activity = document.querySelector<HTMLElement>('#activity')!;
const networkResults = document.querySelector<HTMLElement>('#network-results')!;
const domResults = document.querySelector<HTMLElement>('#dom-results')!;
const rpcCount = document.querySelector<HTMLElement>('#rpc-count')!;
const domCount = document.querySelector<HTMLElement>('#dom-count')!;
const open = document.querySelector<HTMLButtonElement>('#open')!;
const reload = document.querySelector<HTMLButtonElement>('#reload')!;
const clear = document.querySelector<HTMLButtonElement>('#clear')!;
const harFile = document.querySelector<HTMLInputElement>('#har-file')!;
const harStatus = document.querySelector<HTMLElement>('#har-status')!;
const viewLive = document.querySelector<HTMLButtonElement>('#view-live')!;
const officialChoice = document.querySelector<HTMLSelectElement>('#official-choice')!;
const officialPreview = document.querySelector<HTMLButtonElement>('#official-preview')!;
const officialLaunch = document.querySelector<HTMLButtonElement>('#official-launch')!;
const officialStatus = document.querySelector<HTMLElement>('#official-status')!;

const empty: TabCapture = {
  connected: false, networkEvents: 0, network: [], dom: [], updatedAt: 0,
};
let activeId: number | null = null;
let snapshot: TabCapture = empty;
let importedHar: NetworkOffer[] | null = null;
let approved: { tabId: number; key: string; selection: SkuSelection } | null = null;

const networkLabels: Record<OfferStatus, string> = {
  trial: 'Có giai đoạn miễn phí',
  introductory: 'Có giá giới thiệu',
  'offer-candidate': 'Có Offer ID · chưa xác minh điều kiện',
  standard: 'Gói thông thường',
  unknown: 'Chưa đủ dữ liệu về giá',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function emptyMessage(target: HTMLElement, message: string) {
  target.replaceChildren(element('div', 'empty', message));
}
function renderNetwork(rows: NetworkOffer[], events: number) {
  networkResults.replaceChildren();
  const safe = uniqueNetworkOffers(rows.filter(isNetworkOffer)).slice(0, 40);
  const assessed = assessOffers(safe);
  const comparisons = compareBasePlans(safe);
  rpcCount.textContent = String(assessed.length);

  for (const compared of comparisons) {
    const card = element('article', 'offer-card compare');
    card.append(element('h3', '', 'So sánh base plan · ' + (compared.plan ?? compared.productId)));
    card.append(element('div', 'meta', compared.higherBasePlanId + ': ' + compared.higherPrice));
    card.append(element('div', 'meta', compared.lowerBasePlanId + ': ' + compared.lowerPrice));
    card.append(element('div', 'meta',
      'Chênh lệch ' + compared.differencePercent.toLocaleString('vi-VN') +
      '%. Chưa xác minh quyền mua base plan giá thấp.'));
    networkResults.append(card);
  }
  for (const offer of assessed) {
    const card = element('article', 'offer-card');
    card.append(element('h3', '', offer.plan ?? 'Google One'));
    card.append(element('div', 'sku', offer.productId));
    card.append(element('div', 'tag', networkLabels[offer.kind]));
    card.append(element('div', 'price', offer.initialPrice ?? 'Chưa rõ giá'));
    const provenance = [...new Set(safe.filter((row) =>
      row.productId === offer.productId).map((row) => row.source))].map((source) =>
      source === 'bootstrap' ? 'HTML khởi tạo' :
      source === 'page' ? 'nút trên trang' :
      source === 'request' ? 'request' : 'response');
    const fields = [
      'Nguồn: ' + provenance.join(' + '),
      offer.basePlanId && 'Base Plan: ' + offer.basePlanId,
      offer.offerId && 'Offer ID: ' + offer.offerId,
      offer.billingPeriod && 'Chu kỳ: ' + offer.billingPeriod,
      offer.laterPrice && 'Giá giai đoạn sau: ' + offer.laterPrice,
    ].filter((v): v is string => Boolean(v));
    if (fields.length) card.append(element('div', 'meta', fields.join(' · ')));
    networkResults.append(card);
  }
  if (!assessed.length) {
    emptyMessage(networkResults, events
      ? 'Đã quan sát ' + events + ' lượt request/response, nhưng không có SKU/gói trong dữ liệu được đọc.'
      : 'Chưa thấy request Google One chứa metadata gói. Mở trang Google One để extension tự theo dõi.');
  }
}
function renderDom(rows: Offer[]) {
  domResults.replaceChildren();
  const safe = rows.filter((row) => row.source === 'page' && typeof row.plan === 'string').slice(0, 20);
  domCount.textContent = String(safe.length);
  for (const item of safe) {
    const card = element('article', 'offer-card');
    card.append(element('h3', '', item.plan + (item.storage ? ' · ' + item.storage : '')));
    card.append(element('div', 'price', item.price ?? 'Chưa rõ giá'));
    const details = [
      item.period && 'Thời hạn: ' + item.period,
      item.discount && 'Giảm: ' + item.discount,
      'Nguồn: trang đang hiển thị',
    ].filter((v): v is string => Boolean(v));
    card.append(element('div', 'meta', details.join(' · ')));
    domResults.append(card);
  }
  if (!safe.length) {
    emptyMessage(domResults, 'Google chưa hiển thị gói trong khu vực có thể đọc, hoặc trang vẫn đang tải.');
  }
}
function renderLive() {
  if (importedHar) return;
  renderSkuChoices();
  connection.textContent = activeId === null
    ? 'Chưa mở Google One trong tab hiện tại'
    : snapshot.connected ? 'Đang theo dõi Google One tự động' : 'Đang chờ kết nối Google One…';
  activity.textContent = activeId === null
    ? 'Mở Google One rồi quay lại popup để xem các kết quả tự động.'
    : 'Đã quan sát ' + snapshot.networkEvents + ' lượt RPC · ' +
      snapshot.network.filter((row) => row.source === 'bootstrap' || row.source === 'page').length +
      ' bản ghi SKU từ HTML · ' +
      snapshot.network.filter((row) => row.source === 'request' || row.source === 'response').length +
      ' bản ghi từ mạng · ' + snapshot.dom.length +
      ' gói từ giao diện. Chỉ lưu trong phiên trình duyệt.';
  renderNetwork(snapshot.network, snapshot.networkEvents);
  renderDom(snapshot.dom);
}
async function currentGoogleTab(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id !== undefined && isOfficialGoogleOneUrl(tab.url) ? tab.id : null;
}
async function loadLive() {
  activeId = await currentGoogleTab();
  if (activeId !== null) {
    try {
      const response: unknown = await browser.runtime.sendMessage({
        kind: 'G1_CAPTURE_GET', tabId: activeId,
      });
      const state = response && typeof response === 'object' && 'state' in response
        ? response.state : null;
      if (state && typeof state === 'object') {
        const data = state as TabCapture;
        snapshot = {
          connected: data.connected === true,
          networkEvents: Number.isInteger(data.networkEvents) ? data.networkEvents : 0,
          network: Array.isArray(data.network) ? data.network.filter(isNetworkOffer) : [],
          dom: Array.isArray(data.dom) ? data.dom : [],
          updatedAt: data.updatedAt ?? 0,
        };
      } else snapshot = empty;
    } catch { snapshot = empty; }
  } else snapshot = empty;
  renderLive();
}

// The popup is live: storage.session changes as content scripts observe Google.
// No "Quét" request is needed, including after the MV3 worker suspends.
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'session' || activeId === null) return;
  const changed = changes['g1-tab-' + activeId];
  if (!changed) return;
  if (!changed.newValue) snapshot = empty;
  else {
    const state = changed.newValue as TabCapture;
    snapshot = {
      connected: state.connected === true,
      networkEvents: Number.isInteger(state.networkEvents) ? state.networkEvents : 0,
      network: Array.isArray(state.network) ? state.network.filter(isNetworkOffer) : [],
      dom: Array.isArray(state.dom) ? state.dom : [],
      updatedAt: state.updatedAt ?? 0,
    };
  }
  renderLive();
});

open.addEventListener('click', () => {
  void browser.tabs.create({ url: OFFICIAL_GOOGLE_AI_PLANS_URL });
});
reload.addEventListener('click', () => {
  void (async () => {
    const id = await currentGoogleTab();
    if (id === null) {
      connection.textContent = 'Chọn tab Google One trước, hoặc bấm Mở Google One.';
      return;
    }
    await browser.tabs.reload(id);
  })().catch(() => { connection.textContent = 'Không thể tải lại tab hiện tại.'; });
});
clear.addEventListener('click', () => {
  void (async () => {
    const id = await currentGoogleTab();
    if (id === null) return;
    await browser.runtime.sendMessage({ kind: 'G1_CAPTURE_CLEAR', tabId: id });
    snapshot = empty;
    importedHar = null;
    viewLive.hidden = true;
    renderLive();
  })().catch(() => { activity.textContent = 'Không xóa được dữ liệu tạm.'; });
});

harFile.addEventListener('change', () => {
  void (async () => {
    const file = harFile.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      harStatus.textContent = 'HAR lớn hơn 8 MB, không thể phân tích trong popup.';
      return;
    }
    try {
      const raw: unknown = JSON.parse(await file.text());
      importedHar = extractHarNetworkOffers(raw);
      resetOfficial();
      renderSkuChoices();
      viewLive.hidden = false;
      connection.textContent = 'Đang xem HAR cục bộ · KHÔNG phải dữ liệu live';
      activity.textContent = 'Đã phân tích ' + importedHar.length +
        ' bản ghi sản phẩm trong HAR. Không gửi file ra ngoài.';
      renderNetwork(importedHar, 0);
      renderDom([]);
      harStatus.textContent = 'Đã đọc HAR trên máy. Nhấn Quay lại dữ liệu trực tiếp để xem trang Google.';
    } catch { harStatus.textContent = 'HAR/JSON không hợp lệ.'; }
  })();
});
viewLive.addEventListener('click', () => {
  importedHar = null;
  viewLive.hidden = true;
  harFile.value = '';
  harStatus.textContent = 'Đang hiển thị dữ liệu trực tiếp.';
  renderLive();
});


function skuKey(choice: SkuSelection): string {
  return [choice.productId, choice.expectedPrice, choice.billingPeriod ?? ''].join('|');
}

function availableChoices(): SkuChoice[] {
  // Only live tab captures qualify. Importing a HAR does not authorize a
  // request for an old or another account's product.
  return importedHar ? [] : skuChoicesFromCapturedRows(snapshot.network);
}

function resetOfficial() {
  approved = null;
  officialLaunch.disabled = true;
}

function renderSkuChoices() {
  const previousKey = officialChoice.value;
  const items = availableChoices();
  const placeholder = element('option', '', items.length
    ? 'Chọn SKU đang được Google hiển thị'
    : 'Chưa có SKU có giá trên tab Google One');
  placeholder.value = '';
  officialChoice.replaceChildren(placeholder);
  for (const item of items) {
    const option = element('option', '',
      item.productId + ' · ' + item.expectedPrice +
      (item.billingPeriod ? ' · ' + item.billingPeriod : '') +
      (item.basePlanId ? ' · ' + item.basePlanId : ''));
    option.value = skuKey(item);
    officialChoice.append(option);
  }
  if (items.some((item) => skuKey(item) === previousKey)) {
    officialChoice.value = previousKey;
  } else {
    resetOfficial();
    officialChoice.value = '';
  }
  officialPreview.disabled = importedHar !== null || items.length === 0;
}

function getSkuSelection(): SkuSelection | null {
  const key = officialChoice.value;
  const item = availableChoices().find((choice) => skuKey(choice) === key);
  if (!item) return null;
  return {
    productId: item.productId, expectedPrice: item.expectedPrice,
    currency: item.currency, basePlanId: item.basePlanId,
    billingPeriod: item.billingPeriod,
  };
}

officialChoice.addEventListener('change', () => {
  resetOfficial();
  officialStatus.textContent =
    'Đã chọn SKU. Nhấn Kiểm tra nút đăng ký để đối chiếu với Google One.';
});

officialPreview.addEventListener('click', () => {
  void (async () => {
    resetOfficial();
    officialPreview.disabled = true;
    try {
      const selection = getSkuSelection();
      const tabId = await currentGoogleTab();
      if (!selection || tabId === null) {
        officialStatus.textContent = 'Hãy mở tab Google One và chọn một SKU có giá.';
        return;
      }
      const reply: unknown = await browser.tabs.sendMessage(tabId, {
        kind: 'G1_SKU_PREVIEW', selection,
      });
      if (!reply || typeof reply !== 'object' || !('status' in reply)) {
        officialStatus.textContent = 'Không thể tìm nút đăng ký tương ứng trên Google One.';
        return;
      }
      const result = reply as { status: string; message?: string };
      officialStatus.textContent = result.message ?? 'Không thấy gói khớp.';
      if (result.status === 'ready') {
        approved = { tabId, key: skuKey(selection), selection };
        officialLaunch.disabled = false;
      }
    } catch {
      officialStatus.textContent =
        'Không kết nối được tab Google One. Tải lại trang một lần rồi thử lại.';
    } finally {
      officialPreview.disabled = availableChoices().length === 0;
    }
  })();
});

officialLaunch.addEventListener('click', () => {
  void (async () => {
    const preview = approved;
    resetOfficial();
    const selected = getSkuSelection();
    if (!preview || !selected || await currentGoogleTab() !== preview.tabId ||
        skuKey(selected) !== preview.key) {
      officialStatus.textContent = 'Tab hoặc SKU đã thay đổi. Kiểm tra lại trước khi tiếp tục.';
      return;
    }
    try {
      const reply: unknown = await browser.tabs.sendMessage(preview.tabId, {
        kind: 'G1_SKU_OPEN', selection: preview.selection,
      });
      const result = reply && typeof reply === 'object' && 'status' in reply
        ? reply as { status: string; message?: string } : null;
      officialStatus.textContent = result?.message ??
        'Kiểm tra tab Google để xem checkout đã mở hay chưa.';
    } catch {
      officialStatus.textContent =
        'Trang Google có thể đã điều hướng. Kiểm tra kết quả trên tab Google One.';
    }
  })();
});

void loadLive();
