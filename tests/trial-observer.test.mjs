import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  startTrial, finishTrial, observeTrialRpc, formatTrialStatus,
  isSafeRpc, TRIAL_WINDOW_MS,
} from '../lib/trial-observer.ts';

const start = () => {
  const trial = startTrial('g1.play.helium.student','132.000 ₫', 1000);
  assert.ok(trial);
  return trial;
};

test('trial does not submit purchase and starts without a fabricated HTTP result',()=>{
  assert.equal(startTrial('bad','132.000 ₫',1000),null);
  assert.equal(startTrial('g1.2tb.ai','not available',1000),null);
  const state=start();
  assert.equal(state.status,'waiting');
  assert.equal(state.responseCount,0);
  assert.equal(state.lastHttpStatus,null);
});

test('a missing official CTA is explicitly reported as not sent',()=>{
  const state=finishTrial(start(),false,1010);
  assert.equal(state.status,'no-cta');
  assert.match(formatTrialStatus(state),/Chưa gửi/);
  assert.deepEqual(observeTrialRpc(state,{
    endpoint:'play-commerce',stage:'response',httpStatus:200,
  },['g1.play.helium.student'],1020),state);
});

test('checkout entry button click without an RPC is not counted as a request',()=>{
  const state=finishTrial(start(),true,1010);
  assert.equal(state.status,'cta-clicked');
  assert.equal(state.responseCount,0);
  assert.match(formatTrialStatus(state),/chưa quan sát request/);
});

test('observed RPC tracks endpoint, HTTP status and SKU evidence without declaring success',()=>{
  let state=start();
  state=observeTrialRpc(state,{endpoint:'subscriptions',stage:'request',httpStatus:null},[],1100);
  assert.equal(state.requestCount,1);
  state=observeTrialRpc(state,{
    endpoint:'play-commerce',stage:'response',httpStatus:200,
  },['g1.play.helium.student'],1300);
  state=finishTrial(state,true,1350);
  assert.equal(state.status,'response-observed');
  assert.equal(state.responseCount,1);
  assert.equal(state.lastHttpStatus,200);
  assert.equal(state.skuSeenInRpc,true);
  assert.match(formatTrialStatus(state),/HTTP 200/);
  assert.match(formatTrialStatus(state),/không đồng nghĩa/);
  assert.doesNotMatch(formatTrialStatus(state),/đăng ký thành công/i);
});

test('HTTP failure is recorded, not confused with eligibility rejection',()=>{
  let state=start();
  state=observeTrialRpc(state,{
    endpoint:'play-commerce',stage:'response',httpStatus:403,
  },[],1200);
  state=finishTrial(state,true,1210);
  assert.equal(state.lastHttpStatus,403);
  assert.match(formatTrialStatus(state),/HTTP 403/);
  assert.match(formatTrialStatus(state),/Chưa xác minh request chứa đúng SKU/);
});

test('unknown endpoint, missing status, expired window and backdated events are ignored',()=>{
  const initial=start();
  const invalid=[
    {endpoint:'malicious',stage:'response',httpStatus:200},
    {endpoint:'subscriptions',stage:'checkout',httpStatus:200},
    {endpoint:'subscriptions',stage:'response',httpStatus:undefined},
    {endpoint:'subscriptions',stage:'response',httpStatus:1000},
  ];
  for (const event of invalid){
    assert.equal(isSafeRpc(event),false);
    assert.deepEqual(observeTrialRpc(initial,event,[],1200),initial);
  }
  assert.deepEqual(observeTrialRpc(initial,{
    endpoint:'subscriptions',stage:'response',httpStatus:200,
  },[],1000+TRIAL_WINDOW_MS+1),initial);
  assert.deepEqual(observeTrialRpc(initial,{
    endpoint:'subscriptions',stage:'response',httpStatus:200,
  },[],999),initial);
});

test('network bridge and popup use sanitized trial tracking, not raw billing responses',async()=>{
  const {readFileSync}=await import('node:fs');
  const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const main=read('entrypoints/google-network-main.content.ts');
  const bridge=read('entrypoints/google-network-bridge.content.ts');
  const background=read('entrypoints/background.ts');
  const popup=read('entrypoints/popup/main.ts');
  assert.match(main,/rpc: \{ endpoint, stage: source, httpStatus \}/);
  assert.match(bridge,/isSafeRpc\(eventData\.rpc\)/);
  assert.match(background,/G1_TRIAL_START/);
  assert.match(background,/G1_TRIAL_FINISH/);
  assert.match(background,/observeTrialRpc/);
  assert.match(popup,/formatTrialStatus/);
  assert.match(popup,/kind: 'G1_TRIAL_START'/);
  assert.match(popup,/kind: 'G1_TRIAL_FINISH'/);
  assert.doesNotMatch(popup,/skuDetailsToken|offerIdToken|authuser=/);
});
