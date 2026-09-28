import { test } from "node:test";
import assert from "node:assert/strict";
const { speak, stopSpeech } = await import("../src/audio.js");
test("a reference-voice error is reported without silently switching to a different voice", async () => {
  let spoken = false,
    ended;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: "参考音色合成失败，请重试。" }),
  });
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      getVoices() {
        return [{ lang: "zh-CN", localService: true }];
      },
      speak() {
        spoken = true;
      },
    },
  };
  globalThis.SpeechSynthesisUtterance = class {};
  await speak("只保存在本机的消息", (error) => {
    ended = error;
  });
  assert.equal(spoken, false);
  assert.match(ended?.message || "", /参考音色/);
});
test("stopping playback aborts a pending synthesis request and does not deliver a stale callback", async () => {
  let requestedSignal,
    completed = false;
  globalThis.window = { speechSynthesis: { cancel() {} } };
  globalThis.fetch = (_url, { signal }) =>
    new Promise((resolve, reject) => {
      requestedSignal = signal;
      signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("stopped"), { name: "AbortError" })),
      );
    });
  const pending = speak("你好", () => {
    completed = true;
  });
  stopSpeech();
  assert.ok(requestedSignal?.aborted);
  await pending;
  assert.equal(completed, false);
});

test('browser playback starts from the first streamed chunk and ends after the last scheduled sample',async()=>{
 const sources=[];let start=0,end=0,close;
 globalThis.window={speechSynthesis:{cancel(){}},AudioContext:class{
  currentTime=0;destination={};async resume(){};async decodeAudioData(){return {duration:.48}}
  createAnalyser(){return {fftSize:1024,connect(){},disconnect(){},getFloatTimeDomainData(a){a.fill(.1)}}}
  createBufferSource(){const source={connect(){},disconnect(){},start(){},stop(){}};sources.push(source);return source}
 }};
 globalThis.fetch=async()=>({ok:true,headers:{get:()=> 'application/x-ndjson'},body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"audio":"YWJj"}\n'));close=()=>{c.enqueue(new TextEncoder().encode('{"done":true}\n'));c.close()}}})});
 const pending=speak('流式朗读',error=>{assert.equal(error,undefined);end++},()=>start++);
 await new Promise(r=>setTimeout(r,0));assert.equal(start,1);assert.equal(end,0);assert.equal(sources.length,1);close();await new Promise(r=>setTimeout(r,0));assert.equal(end,0);sources[0].onended();await pending;assert.equal(end,1);
});
