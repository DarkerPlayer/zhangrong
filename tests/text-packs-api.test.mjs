import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startServer} from '../server/index.mjs';

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'muyu-text-api-'));
  const site=join(directory,'site');await mkdir(site);await writeFile(join(site,'index.html'),'<p>text workshop</p>');
  const app=await startServer({port:0,staticDir:site,voiceDirectory:join(directory,'voices'),studioDirectory:join(directory,'studio'),textPackDirectory:join(directory,'packs')});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.port}/api/text-packs`;
  const post=(path,value)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  return {base,post};
}

test('local text workflow extracts, pages, saves, selects, exports and reimports without chat state',async t=>{
  const {base,post}=await fixture(t);
  assert.deepEqual(await (await fetch(base)).json(),{packs:[]});
  const extracted=await post('/extract',{name:'雨天.txt',title:'雨天对白',mode:'dialogue',text:'第一章 回家\n小雨说：“慢慢来，我在听。”\n“今天辛苦啦。”'});
  assert.equal(extracted.status,201);
  const preview=await extracted.json();
  assert.equal(preview.pack.draft,true);assert.equal(preview.entries.length,2);
  const id=preview.pack.id;
  const selected=await (await post(`/${id}/select`,{ids:[preview.entries[0].id]})).json();
  assert.equal(selected.entries[0].text,'慢慢来，我在听。');
  const corrected=await (await post(`/${id}/labels`,{labels:[{id:selected.entries[0].id,category:'comfort'}]})).json();
  assert.equal(corrected.entries[0].text,selected.entries[0].text);
  assert.equal(corrected.entries[0].category,'comfort');
  assert.equal((await post(`/${id}/labels`,{labels:[{id:selected.entries[0].id,category:'comfort',text:'不应改写'}]})).status,400);
  const saved=await post(`/${id}/save`,{title:'雨天对白'});assert.equal(saved.status,200);
  assert.equal((await saved.json()).pack.draft,false);
  const page=await (await fetch(`${base}/${id}?offset=1&limit=1`)).json();
  assert.equal(page.entries.length,1);assert.equal(page.total,2);
  const exported=await fetch(`${base}/${id}/export?format=json`);
  assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/attachment/);
  const portable=await exported.text();assert.equal(JSON.parse(portable).format,'muyu-text-pack');
  const reimported=await post('/extract',{name:'雨天.json',fileBase64:Buffer.from(portable).toString('base64'),mode:'dialogue'});
  assert.equal(reimported.status,201);assert.notEqual((await reimported.json()).pack.id,id);
  const txt=await (await fetch(`${base}/${id}/export?format=txt`)).text();assert.match(txt,/慢慢来，我在听/);
  assert.equal((await post(`/${id}/delete`,{})).status,200);
  assert.equal((await fetch(`${base}/${id}`)).status,404);
});

test('text routes reject invalid requests before calling a model or disclosing files',async t=>{
  const {base,post}=await fixture(t);
  assert.equal((await post('/extract',{text:'两种来源',fileBase64:'YWJj',mode:'reading'})).status,400);
  assert.equal((await post('/extract',{text:'普通文字',mode:'unknown'})).status,400);
  const data=await (await post('/extract',{text:'正常短段落。',mode:'reading'})).json();
  const id=data.pack.id;
  for(const query of ['offset=-1','limit=9999','limit=oops'])assert.equal((await fetch(`${base}/${id}?${query}`)).status,400);
  assert.equal((await post(`/${id}/classify`,{ids:Array(9).fill(data.entries[0].id)})).status,400);
  assert.equal((await post(`/${id}/select`,{ids:['missing']})).status,404);
  assert.equal((await fetch(`${base}/${id}/export?format=html`)).status,400);
  assert.equal((await fetch(base,{headers:{Origin:'https://untrusted.example'}})).status,403);
});
