import {
  LAB_CATALOG_URL, createLabTransport,
  createLabResponseRewriter, readLabPayload, type LabVariant,
} from '../../lib/response-lab';
import './style.css';

const variant = document.querySelector<HTMLSelectElement>('#variant')!;
const enabled = document.querySelector<HTMLInputElement>('#rewrite')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const before = document.querySelector<HTMLElement>('#before')!;
const after = document.querySelector<HTMLElement>('#after')!;
const afterLabel = document.querySelector<HTMLElement>('#after-label')!;
const status = document.querySelector<HTMLElement>('#status')!;

const transport = createLabTransport();
const rewritten = createLabResponseRewriter(transport, () => enabled.checked, () => {
  const valid: LabVariant[] = ['pro-5tb', 'pro-youtube', 'plus-400gb', 'ultra-3m'];
  return valid.find((item) => item === variant.value) ?? 'pro-5tb';
});

run.addEventListener('click', () => {
  void (async () => {
    run.disabled = true;
    status.textContent = 'Đang chạy request mô phỏng trong extension…';
    try {
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
