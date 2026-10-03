import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {spawn} from 'node:child_process';
import { createLocalStudio } from '../server/local-studio.mjs';
import {LOOKS,getLook,setLocalLooks,isLookId} from '../server/looks.mjs';
import {setLocalWardrobe,getCharacterForLook,getOutfitVariant,getWardrobeFit,resolveWardrobeAppearance} from '../server/wardrobe.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const reference = { name: '参考.png', dataUrl: `data:image/png;base64,${PNG.toString('base64')}` };
const RIG = { armMobility:0,head:{x:.5,y:.1,neckY:.18,radiusX:.1,radiusY:.08},eyes:[{x:.46,y:.1,rx:.02,ry:.004,skin:[.8,.7,.6],lid:[.1,.1,.1]},{x:.54,y:.1,rx:.02,ry:.004,skin:[.8,.7,.6],lid:[.1,.1,.1]}],mouth:{x:.5,y:.14,rx:.02,ry:.006,skin:[.8,.7,.6],lip:[.6,.2,.2],inner:[.1,.1,.1]},shoulders:{left:[.35,.22],right:[.65,.22]},bounds:{left:.2,top:.02,right:.8,bottom:.98} };
async function fixture(t, overrides={}) {
  const directory = await mkdtemp(join(tmpdir(),'muyu-studio-test-'));
  const site = join(directory,'site');
  await mkdir(join(site,'looks','ruby-velvet'),{recursive:true});
  await mkdir(join(site,'wardrobe','items'),{recursive:true});
  await writeFile(join(site,'looks','ruby-velvet','character.png'),PNG);
  await writeFile(join(site,'wardrobe','items','black-pointed-heels.png'),PNG);
  const calls=[];
  const runtime={info:async()=>({ready:true,state:'ready'}),setup:async()=>{},generate:async input=>{
    calls.push(input);
    input.onProgress({phase:'cutout',progress:90,message:'抠图'});
    await mkdir(input.outputDirectory,{recursive:true});
    const assetPath=join(input.outputDirectory,'character.png'),rigPath=join(input.outputDirectory,'rig.json');
    await writeFile(assetPath,PNG);await writeFile(rigPath,JSON.stringify(RIG));
    return {assetPath,rigPath,width:512,height:768,warnings:['请检查肩部位置']};
  },...overrides};
  const store=join(directory,'store');
  const studio=await createLocalStudio({directory:store,staticRoot:site,runtime});
  t.after(async()=>{await studio.close();await rm(directory,{recursive:true,force:true});});
  return {studio,directory,store,site,runtime,calls};
}
async function settled(studio,id) {
  for(let i=0;i<100;i++) {const state=await studio.info();const job=state.jobs.find(x=>x.id===id);if(!['running','queued'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail('任务没有结束');
}
test('generates references privately, previews, imports once, and persists a reusable local character',async t=>{
  const {studio,calls,store,site,runtime}=await fixture(t);
  const submitted=await studio.createJob({kind:'character',name:'自定义伙伴',prompt:'成年角色，白色衬衫，全身',references:[reference],resolution:'small'});
  const preview=await settled(studio,submitted.id);
  assert.equal(preview.status,'preview');assert.deepEqual(preview.rig,RIG);assert.match(preview.previewUrl,/^\/local-studio\/jobs\//);
  assert.equal(calls[0].width,512);assert.equal(calls[0].references.length,1);
  assert.doesNotMatch(JSON.stringify(await studio.info()),/data:image|referencePaths|outputDirectory/);
  const imported=await studio.importJob(preview.id,{name:'小白',rig:RIG});
  assert.equal(imported.job.status,'imported');assert.equal(imported.catalog.looks[0].character,'小白');assert.equal(imported.catalog.looks[0].actions,null);
  assert.equal(imported.job.importedLookId,imported.catalog.looks[0].id);
  await assert.rejects(studio.importJob(preview.id,{}),/已导入/);
  await studio.close();
  const restored=await createLocalStudio({directory:store,staticRoot:site,runtime});
  const info=await restored.info();assert.equal(info.catalog.looks.length,1);assert.equal(info.jobs[0].status,'imported');
  assert.deepEqual(await readFile(await restored.getAsset(info.catalog.looks[0].asset)),PNG);
  await restored.close();
});
test('single generation lock and cancellation prevent cancelled results from reaching preview',async t=>{
  const {studio}=await fixture(t,{generate:async input=>new Promise((resolve,reject)=>{input.signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'})),{once:true});})});
  const job=await studio.createJob({kind:'character',name:'取消测试',prompt:'全身',references:[reference]});
  await assert.rejects(studio.createJob({kind:'character',name:'重复',prompt:'全身',references:[reference]}),error=>error.status===409);
  const cancelled=await studio.cancelJob(job.id);assert.equal(cancelled.status,'cancelled');
  assert.equal((await settled(studio,job.id)).status,'cancelled');await studio.close();assert.equal((await studio.info()).activeJob,null);
});
test('validates actual image containers, upload count, input lengths and rig coordinates',async t=>{
  const {studio}=await fixture(t);
  const base={kind:'character',name:'测试',prompt:'全身',references:[reference]};
  for(const input of [{...base,name:'名'.repeat(61)},{...base,prompt:'长'.repeat(2001)},{...base,references:[]},{...base,references:Array(4).fill(reference)},{...base,references:[{name:'假.png',dataUrl:'data:image/png;base64,aGVsbG8='}]}]) await assert.rejects(studio.createJob(input),error=>error.status===400);
  const job=await studio.createJob(base);await settled(studio,job.id);
  await assert.rejects(studio.importJob(job.id,{rig:{...RIG,mouth:{...RIG.mouth,x:2}}}),error=>error.status===400);
  await assert.rejects(studio.importJob(job.id,{rig:{...RIG,eyes:[{...RIG.eyes[0],x:null},RIG.eyes[1]]}}),error=>error.status===400);
  assert.equal((await studio.info()).catalog.looks.length,0);
});
test('fit generation includes the existing person and shoe, importing a complete fit without wrong pose frames',async t=>{
  const {studio,calls}=await fixture(t);
  const job=await studio.createJob({kind:'fit',name:'本地高跟鞋',prompt:'只换鞋，保持人物和衣服',baseLookId:'ruby-velvet',itemId:'black-pointed-heels',references:[],resolution:'medium'});
  await settled(studio,job.id);assert.equal(calls[0].references.length,2);assert.equal(calls[0].height,1152);
  const result=await studio.importJob(job.id,{});assert.equal(result.catalog.fits.length,1);assert.equal(result.catalog.fits[0].lookId,'ruby-velvet');assert.equal(result.job.importedItemId,'black-pointed-heels');assert.equal(result.catalog.looks.length,0);
});
test('new uploaded shoes become a reusable item with a fit and original image asset',async t=>{
  const {studio}=await fixture(t);
  const job=await studio.createJob({kind:'fit',name:'银色高跟鞋',prompt:'银色鞋',baseLookId:'ruby-velvet',slot:'shoes',references:[reference]});await settled(studio,job.id);
  const result=await studio.importJob(job.id,{});assert.equal(result.catalog.items[0].slot,'shoes');assert.equal(result.catalog.fits[0].itemId,result.catalog.items[0].id);
  assert.deepEqual(await readFile(await studio.getAsset(result.catalog.items[0].asset)),PNG);
});
test('nail colors fit without raster references and combinations reuse the exact current artwork',async t=>{
  const {studio,calls,site}=await fixture(t);
  await writeFile(join(site,'wardrobe','items','fancha-white-watch.png'),PNG);
  const nails=await studio.createJob({kind:'fit',name:'紫色指甲',prompt:'只改变甲油颜色',baseLookId:'ruby-velvet',slot:'nails',itemId:'fancha-violet-nails'});
  await settled(studio,nails.id);assert.equal(calls[0].references.length,1);assert.match(calls[0].prompt,/#A45BEF/);
  const first=await studio.importJob(nails.id,{});
  assert.deepEqual(first.job.importedSelection,{nails:'fancha-violet-nails'});
  await assert.rejects(studio.createJob({kind:'fit',name:'不可借用他人适配',prompt:'只加手表',baseLookId:'linwei-red-sole',slot:'watch',itemId:'fancha-white-watch',baseSelection:first.job.importedSelection}),/尚未适配/);
  const watch=await studio.createJob({kind:'fit',name:'紫甲与腕表',prompt:'只加白色手表',baseLookId:'ruby-velvet',slot:'watch',itemId:'fancha-white-watch',baseSelection:first.job.importedSelection});
  await settled(studio,watch.id);
  assert.equal(calls[1].references.length,2);
  assert.match(calls[1].references[0],new RegExp(`/jobs/${watch.id}/references/source-1\\.png$`));
  assert.match(calls[1].prompt,/watch/);
  const second=await studio.importJob(watch.id,{});
  assert.deepEqual(second.job.importedSelection,{nails:'fancha-violet-nails',watch:'fancha-white-watch'});
  assert.equal(second.catalog.fits.length,2);
  assert.deepEqual(second.catalog.fits[0].selection,{nails:'fancha-violet-nails'});
  const restore=await studio.createJob({kind:'fit',name:'恢复指甲',prompt:'恢复原始指甲，保留手表',baseLookId:'ruby-velvet',slot:'nails',operation:'restore',baseSelection:second.job.importedSelection});
  await settled(studio,restore.id);
  assert.equal(calls[2].references.length,2);assert.match(calls[2].prompt,/Restore only the fingernail color/);
  const restored=await studio.importJob(restore.id,{});
  assert.deepEqual(restored.job.importedSelection,{watch:'fancha-white-watch'});
  assert.equal(restored.catalog.items.length,0);
  assert.equal(restored.catalog.fits.length,3);
  const onlyWatch=restored.catalog.fits.find(fit=>Object.keys(fit.selection).length===1 && fit.selection.watch);
  assert.ok(onlyWatch);
  assert.equal(onlyWatch.itemId,undefined);
  const restoreAll=await studio.createJob({kind:'fit',name:'恢复所有原配',prompt:'恢复原始手表',baseLookId:'ruby-velvet',slot:'watch',operation:'restore',baseSelection:restored.job.importedSelection});
  await settled(studio,restoreAll.id);
  const original=await studio.importJob(restoreAll.id,{});
  assert.deepEqual(original.job.importedSelection,{});
  assert.equal(original.job.importedItemId,undefined);
});
test('generic uploaded parts retain their slot and hairstyle fitting permits only hair changes',async t=>{
  const {studio,calls}=await fixture(t);
  const job=await studio.createJob({kind:'fit',name:'短发',prompt:'黑色短发',baseLookId:'ruby-velvet',slot:'hair',references:[reference]});
  await settled(studio,job.id);assert.match(calls[0].prompt,/Replace only the hairstyle/);
  assert.doesNotMatch(calls[0].prompt,/face, hairstyle, clothes/);
  const result=await studio.importJob(job.id,{});
  assert.equal(result.catalog.items[0].slot,'hair');
  assert.deepEqual(result.job.importedSelection,{hair:result.job.importedItemId});
});
test('fit requests reject malformed, unsupported, or unavailable starting combinations',async t=>{
  const {studio}=await fixture(t);
  const base={kind:'fit',name:'测试',prompt:'局部换装',baseLookId:'ruby-velvet',itemId:'fancha-violet-nails',slot:'nails'};
  for(const extra of [
    {slot:'watch'}, {slot:'not-a-slot'}, {baseSelection:[]}, {baseSelection:{nails:'fancha-white-watch'}},
    {baseSelection:{unknown:'fancha-white-watch'}}, {baseSelection:{watch:'fancha-white-watch'}},
    {operation:'delete'}, {operation:'restore'},
  ]) await assert.rejects(studio.createJob({...base,...extra}),error=>error.status===400);
  await assert.rejects(studio.createJob({...base,operation:'restore',itemId:undefined,baseSelection:{}}),/没有|替换/);
  assert.equal((await studio.info()).jobs.length,0);
});
test('asset access excludes uploads, runtime files, traversal and symlinks outside managed assets',async t=>{
  const {studio,store,directory}=await fixture(t);
  await mkdir(join(store,'assets','test'),{recursive:true});await writeFile(join(directory,'secret'),'private');await symlink(join(directory,'secret'),join(store,'assets','test','leak.png'));
  for(const path of ['/local-studio/../secret','/local-studio/runtime/file','/local-studio/jobs/id/references/ref.png','/local-studio/assets/test/leak.png','/local-studio/assets/%2e%2e/file']) await assert.rejects(studio.getAsset(path),error=>[400,403,404].includes(error.status));
});
test('restart marks interrupted work failed and keeps finished previews',async t=>{
  const {studio,store,site,runtime}=await fixture(t);await studio.close();
  await writeFile(join(store,'manifest.json'),JSON.stringify({version:1,jobs:[{id:'interrupted',kind:'character',name:'中断',status:'running',input:{},createdAt:new Date().toISOString()}],catalog:{looks:[],items:[],fits:[]}}));
  const restarted=await createLocalStudio({directory:store,staticRoot:site,runtime});const state=await restarted.info();assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].message,/中断/);assert.equal(state.activeJob,null);await restarted.close();
});
test('dynamic imports refresh character and outfit maps and repeat loading keeps catalogs stable',async t=>{
  const {studio}=await fixture(t);const initialCount=LOOKS.length;
  t.after(()=>{setLocalLooks([]);setLocalWardrobe({items:[],fits:[]});});
  const character=await studio.createJob({kind:'character',name:'本地小林',prompt:'成年，通勤全身',references:[reference]});await settled(studio,character.id);
  const imported=await studio.importJob(character.id,{});setLocalLooks(imported.catalog.looks);setLocalWardrobe(imported.catalog);
  assert.equal(isLookId(imported.job.importedLookId),true);assert.equal(getCharacterForLook(imported.job.importedLookId).defaultName,'本地小林');assert.match(getOutfitVariant(imported.job.importedLookId).rig,/^\/local-studio\//);
  const outfit=await studio.createJob({kind:'outfit',name:'蓝色外套',prompt:'蓝色外套',baseLookId:imported.job.importedLookId,references:[]});await settled(studio,outfit.id);
  const changed=await studio.importJob(outfit.id,{});setLocalLooks(changed.catalog.looks);setLocalWardrobe(changed.catalog);
  assert.equal(getLook(changed.job.importedLookId).characterId,getLook(imported.job.importedLookId).characterId);assert.equal(getCharacterForLook(changed.job.importedLookId).lookIds.length,2);
  const fit=await studio.createJob({kind:'fit',name:'黑色鞋',prompt:'换黑色鞋',baseLookId:changed.job.importedLookId,itemId:'black-pointed-heels'});await settled(studio,fit.id);
  const fitted=await studio.importJob(fit.id,{});setLocalLooks(fitted.catalog.looks);setLocalWardrobe(fitted.catalog);setLocalLooks(fitted.catalog.looks);setLocalWardrobe(fitted.catalog);
  assert.equal(LOOKS.length,initialCount+2);assert.ok(getWardrobeFit(changed.job.importedLookId,'black-pointed-heels'));assert.equal(resolveWardrobeAppearance(changed.job.importedLookId,{shoes:'black-pointed-heels'}).actions,null);
});
test('corrupted existing metadata fails safely without overwriting the original file',async t=>{
  const {studio,store,site,runtime}=await fixture(t);await studio.close();const original='{"version":999,"valuable":"keep"}';await writeFile(join(store,'manifest.json'),original);
  await assert.rejects(createLocalStudio({directory:store,staticRoot:site,runtime}),error=>error.status===500);assert.equal(await readFile(join(store,'manifest.json'),'utf8'),original);
});
test('exclusive studio ownership rejects a second instance and cannot overwrite the first catalog',async t=>{
  const {studio,store,site,runtime}=await fixture(t);
  await assert.rejects(createLocalStudio({directory:store,staticRoot:site,runtime}),error=>error.status===409 && /另一|已打开|已运行/.test(error.message));
  const job=await studio.createJob({kind:'character',name:'保留人物',prompt:'成年，完整全身',references:[reference]});await settled(studio,job.id);await studio.importJob(job.id,{});
  await studio.close();
  const reopened=await createLocalStudio({directory:store,staticRoot:site,runtime});assert.equal((await reopened.info()).catalog.looks.length,1);await reopened.close();
});
test('stale owner metadata is recovered and failed initialization releases exclusive ownership',async t=>{
  const {studio,store,site,runtime}=await fixture(t);await studio.close();
  await writeFile(join(store,'studio-owner.lock'),JSON.stringify({pid:2147483647,token:'crashed-owner',createdAt:'2000-01-01T00:00:00Z'}));
  const recovered=await createLocalStudio({directory:store,staticRoot:site,runtime});const owner=JSON.parse(await readFile(join(store,'studio-owner.lock'),'utf8'));assert.equal(owner.pid,process.pid);assert.notEqual(owner.token,'crashed-owner');await recovered.close();
  await writeFile(join(store,'manifest.json'),'{broken');await assert.rejects(createLocalStudio({directory:store,staticRoot:site,runtime}),error=>error.status===500);
  await writeFile(join(store,'manifest.json'),JSON.stringify({version:1,jobs:[],catalog:{looks:[],items:[],fits:[]}}));const afterFailure=await createLocalStudio({directory:store,staticRoot:site,runtime});await afterFailure.close();
});
test('simultaneous stale owner recovery admits exactly one owner',async t=>{
  const {studio,store,site,runtime}=await fixture(t);await studio.close();await writeFile(join(store,'studio-owner.lock'),JSON.stringify({pid:2147483647,token:'stale'}));
  const attempts=await Promise.allSettled([createLocalStudio({directory:store,staticRoot:site,runtime}),createLocalStudio({directory:store,staticRoot:site,runtime})]);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);const rejected=attempts.find(result=>result.status==='rejected');assert.equal(rejected.reason.status,409);
  await attempts.find(result=>result.status==='fulfilled').value.close();
});
test('a crashed parent releases kernel ownership and the next process recovers the catalog',async t=>{
  const {studio,store,site,runtime}=await fixture(t);const job=await studio.createJob({kind:'character',name:'崩溃保留',prompt:'成年，全身',references:[reference]});await settled(studio,job.id);await studio.importJob(job.id,{});await studio.close();
  const moduleUrl=new URL('../server/local-studio.mjs',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {createLocalStudio} from ${JSON.stringify(moduleUrl)};await createLocalStudio({directory:${JSON.stringify(store)},staticRoot:${JSON.stringify(site)},runtime:{info:async()=>({ready:false})}});console.log('OWNED');`],{stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('close',resolve));let output='',errors='';child.stderr.on('data',chunk=>{errors+=chunk.toString();});
  t.after(async()=>{child.kill('SIGKILL');await exited;});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('crash owner startup timed out: '+errors)),4000);child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('OWNED')){clearTimeout(timer);resolve();}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{if(!output.includes('OWNED')){clearTimeout(timer);reject(new Error(`crash owner exited ${code}: ${errors}`));}});});
  assert.equal(JSON.parse(await readFile(join(store,'studio-owner.lock'),'utf8')).pid,child.pid);child.kill('SIGKILL');await exited;
  let restored;
  for(let attempt=0;attempt<40;attempt++){try{restored=await createLocalStudio({directory:store,staticRoot:site,runtime});break;}catch(error){if(error.status!==409)throw error;await new Promise(resolve=>setTimeout(resolve,10));}}
  assert.ok(restored,'kernel ownership should recover after parent crash');assert.equal((await restored.info()).catalog.looks.length,1);await restored.close();
});
