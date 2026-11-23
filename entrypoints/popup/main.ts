import { browser } from 'wxt/browser';
import { analyzeOfferText, type Offer, type OfferKind } from '../../lib/offers';
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
