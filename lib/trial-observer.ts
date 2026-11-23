/** Local observation only. A request/HTTP 200 is NOT a successful purchase. */
export type Endpoint = 'subscriptions' | 'play-commerce';
export type RpcStage = 'request' | 'response';
export interface SafeRpc {
  endpoint: Endpoint;
  stage: RpcStage;
  httpStatus: number | null;
}
export type TrialStatus =
  | 'waiting' | 'cta-clicked' | 'no-cta' | 'request-observed' | 'response-observed';
export interface TrialState {
  productId: string;
  expectedPrice: string;
  startAt: number;
  status: TrialStatus;
  ctaResult: 'pending' | 'clicked' | 'not-found';
  requestCount: number;
  responseCount: number;
  lastHttpStatus: number | null;
  endpoint: Endpoint | null;
  skuSeenInRpc: boolean;
}

const SKU = /^g1\.[a-z0-9][a-z0-9._-]{1,79}$/i;
export const TRIAL_WINDOW_MS = 45_000;

export function isSafeRpc(input: unknown): input is SafeRpc {
  if (!input || typeof input !== 'object') return false;
  const item = input as Partial<SafeRpc>;
  return (item.endpoint === 'subscriptions' || item.endpoint === 'play-commerce') &&
    (item.stage === 'request' || item.stage === 'response') &&
    (item.httpStatus === null ||
      (typeof item.httpStatus === 'number' && Number.isInteger(item.httpStatus) &&
       item.httpStatus >= 0 && item.httpStatus <= 599));
}
export function startTrial(productId: string, expectedPrice: string, now: number): TrialState | null {
  if (!SKU.test(productId) || expectedPrice.length < 3 || expectedPrice.length > 45 ||
      !/\d/.test(expectedPrice) || !Number.isFinite(now)) return null;
  return {
    productId, expectedPrice, startAt: now, status: 'waiting', ctaResult: 'pending',
    requestCount: 0, responseCount: 0, lastHttpStatus: null,
    endpoint: null, skuSeenInRpc: false,
  };
}
export function finishTrial(
  state: TrialState, clicked: boolean, now: number,
): TrialState {
  if (now - state.startAt > TRIAL_WINDOW_MS) return state;
  if (!clicked) {
    return { ...state, ctaResult: 'not-found', status: 'no-cta' };
  }
  return {
    ...state, ctaResult: 'clicked',
    status: state.responseCount ? 'response-observed' :
      state.requestCount ? 'request-observed' : 'cta-clicked',
  };
}
export function observeTrialRpc(
  state: TrialState | null, rpc: unknown,
  observedSkus: string[], now: number,
): TrialState | null {
  if (!state || !isSafeRpc(rpc) || now - state.startAt < 0 ||
      now - state.startAt > TRIAL_WINDOW_MS ||
      state.ctaResult === 'not-found') return state;
  const next = {
    ...state, endpoint: rpc.endpoint,
    requestCount: state.requestCount + Number(rpc.stage === 'request'),
    responseCount: state.responseCount + Number(rpc.stage === 'response'),
    lastHttpStatus: rpc.stage === 'response' ? rpc.httpStatus : state.lastHttpStatus,
    skuSeenInRpc: state.skuSeenInRpc || observedSkus.includes(state.productId),
  };
  next.status = next.responseCount ? 'response-observed' : 'request-observed';
  return next;
}
export function formatTrialStatus(state: TrialState): string {
  if (state.status === 'no-cta') {
    return 'Chưa gửi: Google không có nút đăng ký cùng SKU/giá trên trang.';
  }
  if (state.responseCount) {
    const http = state.lastHttpStatus === null ? 'chưa rõ' :
      state.lastHttpStatus === 0 ? 'lỗi kết nối' : String(state.lastHttpStatus);
    const sku = state.skuSeenInRpc ? 'Có SKU trong dữ liệu quan sát được.' :
      'Chưa xác minh request chứa đúng SKU.';
    return 'Google đã phản hồi RPC (HTTP ' + http + ', ' + state.endpoint +
      '). ' + sku + ' HTTP 200 không đồng nghĩa được chấp nhận ưu đãi.';
  }
  if (state.requestCount) {
    return 'Đã quan sát ' + state.requestCount +
      ' RPC sau thao tác. Chưa có response để xác định kết quả.';
  }
  return state.ctaResult === 'clicked'
    ? 'Đã nhấn nút đăng ký Google; chưa quan sát request. Kiểm tra checkout.'
    : 'Đang chuẩn bị thử SKU trên Google One.';
}
