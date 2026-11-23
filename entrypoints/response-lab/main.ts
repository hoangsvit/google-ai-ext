import {
  LAB_CATALOG_URL, createLabTransport,
  createLabResponseRewriter, createLabPayloadFromOffers, readLabPayload, type LabVariant,
  type LabPayload,
} from '../../lib/response-lab';
import { extractHarNetworkOffers } from '../../lib/network-offers';
import './style.css';

const variant = document.querySelector<HTMLSelectElement>('#variant')!;
const enabled = document.querySelector<HTMLInputElement>('#rewrite')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const before = document.querySelector<HTMLElement>('#before')!;
const after = document.querySelector<HTMLElement>('#after')!;
const afterLabel = document.querySelector<HTMLElement>('#after-label')!;
const status = document.querySelector<HTMLElement>('#status')!;
const harInput = document.querySelector<HTMLInputElement>('#har-input')!;
let importedPayload: LabPayload | undefined;

function selectedVariant(): LabVariant {
  const valid: LabVariant[] = ['pro-5tb', 'pro-youtube', 'plus-400gb', 'ultra-3m'];
  return valid.find((item) => item === variant.value) ?? 'pro-5tb';
}

harInput.addEventListener('change', () => {
  void (async () => {
    const file = harInput.files?.[0];
    importedPayload = undefined;
    if (!file) return;
    if (file.size > 8_000_000) {
      status.textContent = 'HAR vượt 8 MB; từ chối phân tích để bảo vệ popup.';
      return;
    }
    try {
      const json: unknown = JSON.parse(await file.text());
      importedPayload = createLabPayloadFromOffers(extractHarNetworkOffers(json)) ?? undefined;
      status.textContent = importedPayload
        ? 'Đã nạp metadata từ HAR: ' + importedPayload.productId +
          '. File không được tải lên máy chủ. Nhấn Gửi request mô phỏng để thử.'
        : 'Không tìm thấy sản phẩm có giá trong HAR; dùng response gốc mẫu.';
    } catch {
      status.textContent = 'HAR không phải JSON hợp lệ.';
    }
  })();
});

run.addEventListener('click', () => {
  void (async () => {
    run.disabled = true;
    status.textContent = 'Đang chạy request mô phỏng trong extension…';
    try {
      const transport = createLabTransport(importedPayload);
      const rewritten = createLabResponseRewriter(transport, () => enabled.checked, selectedVariant);
      const [baseline, result] = await Promise.all([
        readLabPayload(await transport(LAB_CATALOG_URL)),
        readLabPayload(await rewritten(LAB_CATALOG_URL)),
      ]);
      before.textContent = JSON.stringify(baseline, null, 2);
      after.textContent = JSON.stringify(result, null, 2);
      const changed = baseline.productId !== result.productId;
      afterLabel.textContent = changed ? 'RESPONSE REWRITTEN · DEMO' : 'REWRITE OFF';
      afterLabel.classList.toggle('rewritten', changed);
      status.textContent = changed
        ? 'Đã thay nội dung HTTP Response trong LAB. Không có request nào được gửi tới Google.'
        : 'Không thay đổi response (đang tắt chế độ rewrite).';
    } catch {
      status.textContent = 'Không xử lý được response mô phỏng.';
    } finally {
      run.disabled = false;
    }
  })();
});
