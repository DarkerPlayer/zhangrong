import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {startServer} from '../server/index.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const rig={head:{x:.5,y:.1,neckY:.2,radiusX:.1,radiusY:.08},eyes:[{x:.46,y:.1,rx:.02,ry:.005,skin:[.8,.7,.6],lid:[.1,.1,.1]},{x:.54,y:.1,rx:.02,ry:.005,skin:[.8,.7,.6],lid:[.1,.1,.1]}],mouth:{x:.5,y:.14,rx:.02,ry:.006,skin:[.8,.7,.6],lip:[.6,.2,.2],inner:[.1,.1,.1]},shoulders:{left:[.35,.22],right:[.65,.22]},bounds:{left:.2,top:.02,right:.8,bottom:.98},armMobility:0};
const input={kind:'character',name:'接口人物',prompt:'白色衬衫，全身',references:[{name:'参考.png',dataUrl:`data:image/png;base64,${PNG.toString('base64')}`}]};
async function fixture(t,{wait=false,ready=true}={}) {
 const dir=await mkdtemp(join(tmpdir(),'muyu-studio-api-'));const site=join(dir,'site');await mkdir(site);await writeFile(join(site,'index.html'),'<h1>studio</h1>');
 let finish,setupCalls=0;
 const runtime={info:async()=>({ready,state:ready?'ready':'missing'}),setup:async()=>{setupCalls++;ready=true;},generate:async args=>{
   if(wait)await new Promise((resolve,reject)=>{finish=resolve;args.signal.addEventListener('abort',()=>reject(Object.assign(new Error('stop'),{name:'AbortError'})),{once:true});});
   await mkdir(args.outputDirectory,{recursive:true});const assetPath=join(args.outputDirectory,'character.png'),rigPath=join(args.outputDirectory,'rig.json');await writeFile(assetPath,PNG);await writeFile(rigPath,JSON.stringify(rig));return {assetPath,rigPath,warnings:[]};
 }};
 const app=await startServer({port:0,staticDir:site,voiceDirectory:join(dir,'voice'),studioDirectory:join(dir,'studio'),imageRuntime:runtime});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});const url=`http://127.0.0.1:${app.port}`;
 const post=(path,payload={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const info=async()=>await(await fetch(url+'/api/studio')).json();
 return {url,post,info,get finish(){return finish;},get setupCalls(){return setupCalls;}};
}
async function until(fn,predicate) {for(let i=0;i<100;i++){const result=await fn();if(predicate(result))return result;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('studio did not settle');}
test('studio API provides a real preview asset and imported local catalog, without leaking upload or absolute paths',async t=>{
 const {url,post,info}=await fixture(t);const response=await post('/api/studio/jobs',input);assert.equal(response.status,202);const {job}=await response.json();
 const state=await until(info,state=>state.jobs[0]?.status==='preview');assert.doesNotMatch(JSON.stringify(state),/data:image|\/private\/|referencePaths/);
 const preview=await fetch(url+state.jobs[0].previewUrl);assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/image\/png/);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),PNG);
 const imported=await post(`/api/studio/jobs/${job.id}/import`,{name:'本地伙伴',rig});assert.equal(imported.status,200);const result=await imported.json();assert.equal(result.catalog.looks.length,1);assert.equal(result.job.importedLookId,result.catalog.looks[0].id);
 assert.equal((await post('/api/chat',{message:'你好',lookId:result.job.importedLookId})).status,200);
 assert.equal((await post(`/api/studio/jobs/${job.id}/import`,{})).status,409);
 assert.equal((await fetch(url+'/local-studio/manifest.json')).status,404);
});
test('running image generation pauses chat and TTS, supports cancellation, and returns readable errors',async t=>{
 const f=await fixture(t,{wait:true});const {job}=await(await f.post('/api/studio/jobs',input)).json();await until(f.info,state=>state.activeJob?.status==='running'&&f.finish);
 for(const [path,payload] of [['/api/chat',{message:'你好'}],['/api/tts',{text:'你好'}]]){const response=await f.post(path,payload);assert.equal(response.status,503);assert.match((await response.json()).error,/生成/);}
 assert.equal((await f.post('/api/studio/jobs',input)).status,409);assert.equal((await f.post(`/api/studio/jobs/${job.id}/cancel`)).status,200);
 await until(f.info,state=>!state.activeJob);assert.equal((await f.post('/api/chat',{message:'你好'})).status,200);
});
test('setup is asynchronous and unready generation does not create a phantom job',async t=>{
 const f=await fixture(t,{ready:false});assert.equal((await f.post('/api/studio/jobs',input)).status,503);assert.equal((await f.info()).jobs.length,0);
 const response=await f.post('/api/studio/setup');assert.equal(response.status,202);await until(f.info,state=>state.runtime.ready&&!state.activeJob);assert.equal(f.setupCalls,1);
});
test('a failed server listen releases studio ownership so a fresh server can start',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'muyu-studio-listen-'));const site=join(dir,'site');await mkdir(site);await writeFile(join(site,'index.html'),'<h1>test</h1>');
 const blocker=http.createServer((request,response)=>response.end('occupied'));await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>blocker.close(resolve));await rm(dir,{recursive:true,force:true});});
 const options={staticDir:site,voiceDirectory:join(dir,'voice'),studioDirectory:join(dir,'studio'),imageRuntime:{info:async()=>({ready:false})}};
 await assert.rejects(startServer({...options,port:blocker.address().port}),error=>error.code==='EADDRINUSE');
 const app=await startServer({...options,port:0});await app.close();
});
