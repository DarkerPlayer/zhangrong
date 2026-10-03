import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTextEntries} from '../server/text-classifier.mjs';
const entries=[{id:'e1',text:'不要难过，我会听你说。',speaker:'小雨'}];
const getModels=async()=>({available:true,defaultModel:'qwen3.5:4b',models:[{name:'qwen3.5:4b'}]});
const reply=items=>new Response(JSON.stringify({done:true,message:{content:JSON.stringify({items})}}));

test('classification only sends selected local text and returns metadata, never rewritten source',async()=>{
  let payload;
  const result=await classifyTextEntries(entries,{getModels,fetchImpl:async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/chat');payload=JSON.parse(options.body);
    return reply([{id:'e1',category:'comfort',speaker:'小雨',text:'伪造文本'}]);
  }});
  assert.equal(payload.think,false);assert.equal(payload.stream,false);
  assert.equal(payload.format.type,'object');
  assert.match(payload.messages[0].content,/材料|指令/);
  assert.deepEqual(result,{model:'qwen3.5:4b',entries:[{id:'e1',category:'comfort',speaker:'小雨'}]});
  assert.equal(entries[0].text,'不要难过，我会听你说。');
});

test('unknown ids, incomplete output and unavailable model fail without fabricated fallback',async()=>{
  for(const items of [[{id:'other',category:'comfort',speaker:''}],[],[{id:'e1',category:'invalid',speaker:''}]]){
    await assert.rejects(classifyTextEntries(entries,{getModels,fetchImpl:async()=>reply(items)}),/分类|标签/);
  }
  await assert.rejects(classifyTextEntries(entries,{model:'cloud',getModels}),/本机|安装/);
  await assert.rejects(classifyTextEntries(entries,{getModels:async()=>({available:false,models:[]})}),/本地模型/);
});

test('classifier bounds batch, prevents invented speakers and responds to cancellation',async()=>{
  await assert.rejects(classifyTextEntries(Array.from({length:9},(_,i)=>({id:`e${i}`,text:'你好'}))),/8/);
  const value=await classifyTextEntries(entries,{getModels,fetchImpl:async()=>reply([{id:'e1',category:'comfort',speaker:'不存在的人'}])});
  assert.equal(value.entries[0].speaker,'小雨');
  const controller=new AbortController();controller.abort();
  await assert.rejects(classifyTextEntries(entries,{getModels,signal:controller.signal}),{name:'AbortError'});
});

test('classification cancels an in-flight request and releases a stalled response body',async()=>{
  const controller=new AbortController();let cancelled=false;
  const response=new Response(new ReadableStream({start(){},cancel(){cancelled=true;}}));
  const pending=classifyTextEntries(entries,{getModels,signal:controller.signal,fetchImpl:async()=>response});
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(cancelled,true);
});

test('classifier timeout returns an explicit timeout and cancels the model body',async()=>{
  let cancelled=0;
  const response=new Response(new ReadableStream({cancel(){cancelled++;}}));
  await assert.rejects(classifyTextEntries(entries,{getModels,timeoutMs:10,fetchImpl:async()=>response}),error=>error.status===504 && /超时/.test(error.message));
  assert.equal(cancelled,1);
});

test('oversized classifier output is rejected and its response reader is released',async()=>{
  let cancelled=0;
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(128*1024+1));},cancel(){cancelled++;}}));
  await assert.rejects(classifyTextEntries(entries,{getModels,fetchImpl:async()=>response}),error=>error.status===502 && /过长/.test(error.message));
  assert.equal(cancelled,1);
});

test('cancellation as fetch resolves releases the response without accepting labels',async()=>{
  const controller=new AbortController();let cancelled=0;
  const response=new Response(new ReadableStream({cancel(){cancelled++;}}));
  await assert.rejects(classifyTextEntries(entries,{getModels,signal:controller.signal,fetchImpl:async()=>{controller.abort();return response;}}),{name:'AbortError'});
  assert.equal(cancelled,1);
});
