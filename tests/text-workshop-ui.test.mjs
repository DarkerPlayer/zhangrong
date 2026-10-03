import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {url:"http://localhost:4317"});
for (const name of ["window","document","navigator","HTMLElement","Event","MouseEvent","File","FileReader"])
  Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { render, cleanup, fireEvent, act, waitFor } = await import("@testing-library/react");
const temporary = await mkdtemp(path.join(process.cwd(),"node_modules/.text-workshop-ui-"));
const bundle = path.join(temporary,"workshop.cjs");
await build({entryPoints:["src/TextWorkshop.jsx"],outfile:bundle,bundle:true,platform:"node",format:"cjs",loader:{".css":"empty"},external:["react","react-dom","react/jsx-runtime"]});
const TextWorkshop = createRequire(import.meta.url)(bundle).default;
const response = data => ({ok:true,json:async()=>data});
const metadata = (extra={}) => ({id:"pack-1",title:"雨夜对白",draft:true,mode:"dialogue",sourceName:"故事.txt",sourceFormat:"txt",sourceCharacters:900,totalEntries:27,createdAt:1,updatedAt:1,warnings:[],stats:{dialogue:27,narration:0,duplicates:2},...extra});
const sampleEntries = () => Array.from({length:27},(_,index)=>({id:`entry-${index+1}`,text:`句子${index+1}，我在这里。`,kind:"dialogue",category:"fallback",speaker:"",source:{chapter:"第一章",page:2,paragraph:index+1},occurrences:index===0?3:1}));
let packs, entries, calls, applied, readings, stopped, downloads, revoked, fetchOverride;
const nativeCreate = URL.createObjectURL, nativeRevoke = URL.revokeObjectURL;
beforeEach(()=>{
  packs=[];entries=sampleEntries();calls=[];applied=[];readings=[];stopped=0;downloads=[];revoked=[];fetchOverride=null;
  URL.createObjectURL=()=>`blob:export-${downloads.length}`;
  URL.revokeObjectURL=url=>revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,download:this.download});};
  globalThis.fetch=async(url,options={})=>{
    const payload=options.body?JSON.parse(options.body):null;
    calls.push({url,options,payload});
    if(fetchOverride) {const result=fetchOverride(url,options,payload);if(result)return result;}
    const parsed=new URL(url,"http://localhost:4317");
    if(url==="/api/text-packs") return response({packs:[...packs]});
    if(parsed.pathname.endsWith("/extract")) {
      packs=[metadata({mode:payload.mode})];
      return response({pack:packs[0],entries:entries.slice(0,25),total:entries.length,offset:0,limit:25});
    }
    if(parsed.pathname.endsWith("/save")) {packs[0]={...packs[0],title:payload.title,draft:false};return response({pack:packs[0]});}
    if(parsed.pathname.endsWith("/select")) return response({entries:entries.filter(entry=>payload.ids.includes(entry.id))});
    if(parsed.pathname.endsWith("/classify")) {
      const labels=entries.filter(entry=>payload.ids.includes(entry.id)).map(entry=>({...entry,category:"comfort",speaker:"林小姐"}));
      entries=entries.map(entry=>labels.find(label=>label.id===entry.id)||entry);
      return response({entries:labels,model:"local-model"});
    }
    if(parsed.pathname.endsWith("/labels")) {
      const updated=entries.filter(entry=>payload.labels.some(label=>label.id===entry.id)).map(entry=>({...entry,category:payload.labels.find(label=>label.id===entry.id).category}));
      entries=entries.map(entry=>updated.find(item=>item.id===entry.id)||entry);
      return response({entries:updated});
    }
    if(parsed.pathname.endsWith("/delete")) {packs=[];return response({ok:true});}
    if(parsed.pathname.endsWith("/export")) return {ok:true,headers:{get:()=>null},blob:async()=>new Blob(["导出内容"])};
    if(parsed.pathname==="/api/text-packs/pack-1") {
      const query=parsed.searchParams.get("query")||"",kind=parsed.searchParams.get("kind")||"";
      const found=entries.filter(entry=>(!query||entry.text.includes(query))&&(!kind||entry.kind===kind));
      const offset=Number(parsed.searchParams.get("offset")||0),limit=Number(parsed.searchParams.get("limit")||25);
      return response({pack:packs[0],entries:found.slice(offset,offset+limit),total:found.length,offset,limit});
    }
    throw Error(`Unexpected fetch ${url}`);
  };
});
afterEach(()=>{cleanup();URL.createObjectURL=nativeCreate;URL.revokeObjectURL=nativeRevoke;});
after(async()=>{await rm(temporary,{recursive:true,force:true});dom.window.close();});
const props = extra => ({personaId:"older-sister",personaName:"沈知意",corpusCount:0,model:"local-model",onApplyEntries:value=>{applied.push(value);return value.entries.length;},onRead:text=>readings.push(text),onStopRead:()=>stopped++,onClose(){},...extra});
async function mount(extra={}) {const ui=render(React.createElement(TextWorkshop,props(extra)));await act(async()=>{});return ui;}
async function extract(ui) {
  fireEvent.change(ui.getByRole("textbox",{name:"粘贴文本"}),{target:{value:"她说：“我在这里。”"}});
  fireEvent.click(ui.getByRole("button",{name:"提取对白",exact:true}));
  await waitFor(()=>assert.ok(ui.getByText("句子1，我在这里。")));
}
async function openPack(ui) {fireEvent.click(ui.getByRole("button",{name:"打开文本包：雨夜对白"}));await waitFor(()=>assert.ok(ui.getByText("句子1，我在这里。")));}

test("paste extraction keeps source, previews one entry, saves the whole pack, and applies only selected entries",async()=>{
  const ui=await mount({corpusCount:38});
  await extract(ui);
  assert.equal(calls.find(call=>call.url.endsWith("/extract")).payload.mode,"dialogue");
  assert.ok(ui.getByText(/第一章.*第 2 页.*第 1 段/));
  fireEvent.click(ui.getByRole("button",{name:"试听片段 1"}));
  assert.deepEqual(readings,["句子1，我在这里。"]);
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 1"}));
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.equal(applied.length,1));
  assert.equal(applied[0].personaId,"older-sister");
  assert.equal(applied[0].pack.id,"pack-1");
  assert.deepEqual(applied[0].entries.map(entry=>entry.id),["entry-1"]);
  fireEvent.change(ui.getByRole("textbox",{name:"文本包名称"}),{target:{value:"夜谈摘录"}});
  fireEvent.click(ui.getByRole("button",{name:"保存文本包",exact:true}));
  await waitFor(()=>assert.ok(ui.getByRole("button",{name:"打开文本包：夜谈摘录"})));
  assert.equal(packs[0].totalEntries,27);
  assert.equal(packs[0].draft,false);
  fireEvent.click(ui.getByRole("button",{name:"导出 JSON 文本包"}));
  await waitFor(()=>assert.equal(downloads.length,1));
  fireEvent.click(ui.getByRole("button",{name:"导出 TXT 文本"}));
  await waitFor(()=>assert.equal(downloads.length,2));
  assert.ok(calls.some(call=>call.url.endsWith("export?format=json")));
  assert.ok(calls.some(call=>call.url.endsWith("export?format=txt")));
  fireEvent.click(ui.getByRole("button",{name:"删除文本包",exact:true}));
  await waitFor(()=>assert.ok(!ui.queryByRole("button",{name:"打开文本包：夜谈摘录"})));
});

test("selection spans bounded pages and a capacity rejection preserves the selected entries",async()=>{
  packs=[metadata({draft:false})];
  const ui=await mount({corpusCount:39,onApplyEntries:value=>{
    if(value.entries.length>1)throw new Error("剩余容量不足，整批未导入。");
    applied.push(value);return value.entries.length;
  }});await openPack(ui);
  assert.equal(ui.getAllByRole("checkbox",{name:/选择片段/}).length,25);
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 1"}));
  fireEvent.click(ui.getByRole("button",{name:"下一页"}));
  await waitFor(()=>assert.ok(ui.getByRole("checkbox",{name:"选择片段 26"})));
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 26"}));
  assert.equal(ui.getByRole("button",{name:"加入沈知意的语料"}).disabled,false);
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.equal(ui.getByRole("alert").textContent,"剩余容量不足，整批未导入。"));
  assert.ok(ui.getByText(/还可新增 1 条。重复会跳过/));
  assert.deepEqual(applied,[]);
  assert.equal(ui.getByRole("checkbox",{name:"选择片段 26"}).checked,true);
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 26"}));
  fireEvent.change(ui.getByRole("searchbox",{name:"搜索片段"}),{target:{value:"句子27"}});
  fireEvent.click(ui.getByRole("button",{name:"搜索",exact:true}));
  await waitFor(()=>assert.equal(ui.getAllByRole("checkbox",{name:/选择片段/}).length,1));
  assert.ok(calls.some(call=>call.url.includes("query=%E5%8F%A5%E5%AD%9027")&&call.url.includes("offset=0")));
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.equal(applied.length,1));
  assert.deepEqual(applied[0].entries.map(entry=>entry.id),["entry-1"]);
});

test("cancelling extraction and switching personas discard delayed extraction results",async()=>{
  const pending=[];
  fetchOverride=(url,options)=>url.endsWith("/extract")?new Promise(resolve=>pending.push({resolve,signal:options.signal})):null;
  const ui=await mount();
  fireEvent.change(ui.getByRole("textbox",{name:"粘贴文本"}),{target:{value:"待处理文字"}});
  fireEvent.click(ui.getByRole("button",{name:"提取对白",exact:true}));
  await waitFor(()=>assert.equal(pending.length,1));
  assert.ok(ui.getByRole("progressbar",{name:"文本处理进度"}));
  fireEvent.click(ui.getByRole("button",{name:"取消处理"}));
  assert.equal(pending[0].signal.aborted,true);
  fireEvent.click(ui.getByRole("button",{name:"提取对白",exact:true}));
  await waitFor(()=>assert.equal(pending.length,2));
  ui.rerender(React.createElement(TextWorkshop,props({personaId:"boss-girlfriend",personaName:"林岚"})));
  await act(async()=>{});
  assert.equal(pending[1].signal.aborted,true);
  await act(async()=>{for(const request of pending)request.resolve(response({pack:metadata(),entries:[entries[0]],total:1,offset:0,limit:25}));});
  assert.ok(!ui.queryByText("句子1，我在这里。"));
  assert.equal(ui.getByRole("textbox",{name:"粘贴文本"}).value,"");
  assert.deepEqual(applied,[]);
});

test("local classification is batched by eight and cancellation keeps completed labels without starting more batches",async()=>{
  packs=[metadata()];let finishSecond,secondSignal;
  fetchOverride=(url,options,payload)=>{
    if(url.endsWith("/classify")&&calls.filter(call=>call.url.endsWith("/classify")).length===2)
      return new Promise(resolve=>{finishSecond=()=>resolve(response({entries:entries.filter(entry=>payload.ids.includes(entry.id)).map(entry=>({...entry,speaker:"过时标注"})),model:"local-model"}));secondSignal=options.signal;});
    return null;
  };
  const ui=await mount();await openPack(ui);
  fireEvent.click(ui.getByRole("button",{name:"选择本页"}));
  fireEvent.click(ui.getByRole("button",{name:"本地 AI 分类"}));
  await waitFor(()=>assert.ok(finishSecond));
  assert.deepEqual(calls.filter(call=>call.url.endsWith("/classify")).map(call=>call.payload.ids.length),[8,8]);
  assert.equal(ui.getAllByText("林小姐").length,8);
  fireEvent.click(ui.getByRole("button",{name:"取消处理"}));
  assert.equal(secondSignal.aborted,true);
  await act(async()=>finishSecond());
  assert.ok(!ui.queryByText("过时标注"));
  assert.equal(calls.filter(call=>call.url.endsWith("/classify")).length,2);
});

test("file import checks size before reading and sends the chosen reading mode",async()=>{
  const ui=await mount();
  fireEvent.click(ui.getByRole("button",{name:"选择文件",exact:true}));
  const input=ui.getByLabelText("导入文本文件");
  fireEvent.change(input,{target:{files:[{name:"too-large.txt",size:20*1024*1024+1}]}});
  assert.match(ui.getByRole("alert").textContent,/20 MB/);
  assert.equal(calls.some(call=>call.url.endsWith("/extract")),false);
  const file=new File(["一段完整的叙述。"],"故事.txt",{type:"text/plain"});
  fireEvent.change(input,{target:{files:[file]}});
  fireEvent.click(ui.getByRole("radio",{name:"完整阅读分段"}));
  fireEvent.click(ui.getByRole("button",{name:"生成阅读片段",exact:true}));
  await waitFor(()=>assert.ok(calls.find(call=>call.url.endsWith("/extract"))));
  const payload=calls.find(call=>call.url.endsWith("/extract")).payload;
  assert.equal(payload.mode,"reading");assert.equal(payload.name,"故事.txt");
  assert.equal(Buffer.from(payload.fileBase64,"base64").toString("utf8"),"一段完整的叙述。");
  assert.equal(payload.text,undefined);
});

test("persona switching aborts entry retrieval before the apply callback can run",async()=>{
  packs=[metadata()];let finishSelect,selectSignal;
  fetchOverride=(url,options)=>url.endsWith("/select")?new Promise(resolve=>{finishSelect=()=>resolve(response({entries:[entries[0]]}));selectSignal=options.signal;}):null;
  const ui=await mount();await openPack(ui);
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 1"}));
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.ok(finishSelect));
  ui.rerender(React.createElement(TextWorkshop,props({personaId:"boss-girlfriend",personaName:"林岚"})));
  await act(async()=>finishSelect());
  assert.equal(selectSignal.aborted,true);assert.deepEqual(applied,[]);
});

test("empty dialogue results recommend reading mode and request errors preserve the pasted source",async()=>{
  const ui=await mount();entries=[];
  fireEvent.change(ui.getByRole("textbox",{name:"粘贴文本"}),{target:{value:"没有对白的叙述原文。"}});
  fireEvent.click(ui.getByRole("button",{name:"提取对白",exact:true}));
  await waitFor(()=>assert.ok(ui.getByText(/没有找到对白.*完整阅读分段/)));
  fetchOverride=url=>url.endsWith("/extract")?{ok:false,json:async()=>({error:"这份文件暂时无法读取。"})}:null;
  fireEvent.click(ui.getByRole("radio",{name:"完整阅读分段"}));
  fireEvent.click(ui.getByRole("button",{name:"生成阅读片段",exact:true}));
  await waitFor(()=>assert.equal(ui.getByRole("alert").textContent,"这份文件暂时无法读取。"));
  assert.equal(ui.getByRole("textbox",{name:"粘贴文本"}).value,"没有对白的叙述原文。");
});

test("a full persona can reapply a duplicate selection and reports the actual zero added count",async()=>{
  packs=[metadata()];
  const ui=await mount({corpusCount:40,onApplyEntries:value=>{applied.push(value);return 0;}});await openPack(ui);
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 1"}));
  assert.equal(ui.getByRole("button",{name:"加入沈知意的语料"}).disabled,false);
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.ok(ui.getByText("已加入 0 条语料，已有内容保留。")));
  assert.equal(applied.length,1);
});

test("new callback references do not cancel a request but closing the workshop stops its preview",async()=>{
  let finish,signal;
  fetchOverride=(url,options)=>url.endsWith("/extract")?new Promise(resolve=>{finish=()=>resolve(response({pack:metadata(),entries:[entries[0]],total:1,offset:0,limit:25}));signal=options.signal;}):null;
  const ui=await mount();
  fireEvent.change(ui.getByRole("textbox",{name:"粘贴文本"}),{target:{value:"重新渲染时保留请求"}});
  fireEvent.click(ui.getByRole("button",{name:"提取对白",exact:true}));
  await waitFor(()=>assert.ok(finish));
  ui.rerender(React.createElement(TextWorkshop,props({corpusCount:1})));
  assert.equal(signal.aborted,false);
  await act(async()=>finish());
  fireEvent.click(ui.getByRole("button",{name:"试听片段 1"}));
  assert.equal(stopped,0);
  ui.unmount();
  assert.equal(stopped,1);
});

test("cross-page selection cannot exceed forty and page selection never silently selects a partial page",async()=>{
  entries=Array.from({length:50},(_,index)=>({...sampleEntries()[0],id:`entry-${index+1}`,text:`句子${index+1}，我在这里。`}));
  packs=[metadata({totalEntries:50})];
  const ui=await mount();await openPack(ui);
  fireEvent.click(ui.getByRole("button",{name:"选择本页"}));
  fireEvent.click(ui.getByRole("button",{name:"下一页"}));
  await waitFor(()=>assert.ok(ui.getByRole("checkbox",{name:"选择片段 26"})));
  fireEvent.click(ui.getByRole("button",{name:"选择本页"}));
  assert.match(ui.getByRole("alert").textContent,/最多选择 40 条/);
  assert.ok(ui.getByText("已选 25 条"));
  for(let index=26;index<=40;index++)fireEvent.click(ui.getByRole("checkbox",{name:`选择片段 ${index}`}));
  assert.equal(ui.getByRole("checkbox",{name:"选择片段 41"}).disabled,true);
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.equal(applied.length,1));
  assert.equal(applied[0].entries.length,40);
  assert.equal(calls.find(call=>call.url.endsWith("/select")).payload.ids.length,40);
});

test("a reader can correct an entry category without changing its words, source, or speaker",async()=>{
  packs=[metadata()];entries[0].speaker="小雨";
  const original=structuredClone(entries[0]);
  const ui=await mount();await openPack(ui);
  fireEvent.change(ui.getByRole("combobox",{name:"片段 1 分类"}),{target:{value:"daily"}});
  await waitFor(()=>assert.equal(ui.getByRole("combobox",{name:"片段 1 分类"}).value,"daily"));
  assert.deepEqual(calls.find(call=>call.url.endsWith("/labels")).payload,{labels:[{id:"entry-1",category:"daily"}]});
  assert.ok(ui.getByText(original.text));
  assert.ok(ui.getByText("小雨"));
  assert.ok(ui.getByText(/第一章.*第 2 页.*第 1 段/));
  fireEvent.click(ui.getByRole("checkbox",{name:"选择片段 1"}));
  fireEvent.click(ui.getByRole("button",{name:"加入沈知意的语料"}));
  await waitFor(()=>assert.equal(applied.length,1));
  assert.deepEqual(applied[0].entries[0],{...original,category:"daily"});
});
