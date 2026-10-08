import { randomUUID, randomInt } from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile, realpath, stat, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';
import {fileURLToPath} from 'node:url';
import { LOOKS } from './looks.mjs';
import { WARDROBE_ITEMS, WARDROBE_FITS, GARMENT_SLOT_IDS, normalizeWardrobeSelection, wardrobeSelectionKey, getWardrobeCombinationFit } from './wardrobe.mjs';

export const DEFAULT_STUDIO_DIRECTORY = join(homedir(), 'Library/Application Support/沐语/local-studio');
export const STUDIO_BODY_LIMIT = 34 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACTIVE = new Set(['queued', 'running']);
const RESOLUTIONS = { small: [512, 768], medium: [768, 1152] };
const SLOT_DESCRIPTION = Object.freeze({hair:'hairstyle',top:'upper garment',bottom:'lower garment',dress:'dress or one-piece outfit',outerwear:'outerwear',underwear:'opaque underlayer',hosiery:'hosiery',shoes:'shoes',nails:'fingernail color',watch:'wristwatch',earrings:'earrings',accessories:'accessories'});
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const clone = value => JSON.parse(JSON.stringify(value));
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); };
const CRC_TABLE = Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=(value & 1)?0xedb88320 ^ (value >>> 1):value >>> 1;return value >>> 0;});
const crc32 = bytes => {let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);return (crc ^ 0xffffffff) >>> 0;};

// The kernel lock, rather than a PID check followed by unlink, makes stale-owner
// recovery atomic even when several app processes restart at the same time.
// Closing the parent pipe (including a crash) releases ownership automatically.
const OWNER_LOCK_HELPER = String.raw`
import datetime, fcntl, json, os, sys
filename, owner_json = sys.argv[1:3]
owner = json.loads(owner_json)
fd = os.open(filename, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
with os.fdopen(fd, 'r+', encoding='utf8') as stream:
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        try:
            existing = json.loads(stream.read(4096))
        except Exception:
            existing = {}
        print(json.dumps({'type': 'busy', 'pid': existing.get('pid')}), flush=True)
        sys.exit(73)
    stream.seek(0)
    stream.write(json.dumps(owner))
    stream.truncate()
    stream.flush()
    os.fsync(stream.fileno())
    print(json.dumps({'type': 'owned', 'token': owner['token']}), flush=True)
    try:
        sys.stdin.buffer.read()
    finally:
        stream.seek(0)
        try:
            current = json.loads(stream.read(4096))
        except Exception:
            current = {}
        if current.get('token') == owner['token'] and current.get('pid') == owner['pid']:
            current['releasedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            stream.seek(0)
            stream.write(json.dumps(current))
            stream.truncate()
            stream.flush()
        fcntl.flock(stream, fcntl.LOCK_UN)
`;

async function acquireStudioOwnership(directory) {
  const filename=join(directory,'studio-owner.lock'),token=randomUUID();
  const python=[fileURLToPath(new URL('../.runtime/voice/python/bin/python3',import.meta.url)),join(directory,'runtime','bin','python'),'/usr/bin/python3'].find(existsSync);
  if(!python)throw fail('本地工作室需要可用的 Python 运行环境，请先准备本地运行环境。',503);
  const owner={pid:process.pid,token,createdAt:new Date().toISOString(),processStartedAt:new Date(Date.now()-process.uptime()*1000).toISOString()};
  const child=spawn(python,['-I','-S','-u','-c',OWNER_LOCK_HELPER,filename,JSON.stringify(owner)],{shell:false,stdio:['pipe','pipe','pipe']});
  let owned=false,released=false,pending='',diagnostics='';
  const exited=new Promise(resolve=>{child.once('close',()=>{owned=false;resolve();});child.once('error',()=>{owned=false;resolve();});});
  child.stdin.on('error',()=>{});
  child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-2000);});
  const release=async()=>{if(released)return exited;released=true;child.stdin.end();await exited;};
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill('SIGTERM');reject(fail('本地工作室独占锁初始化超时，请重启应用。',503));},5000);
      const finish=(error)=>{clearTimeout(timer);error?reject(error):resolve();};
      child.stdout.on('data',chunk=>{
        pending+=chunk.toString();const newline=pending.indexOf('\n');if(newline<0)return;
        let event;try{event=JSON.parse(pending.slice(0,newline));}catch{return finish(fail('本地工作室独占锁无法初始化。',503));}
        pending='';
        if(event.type==='owned' && event.token===token){owned=true;finish();}
        else if(event.type==='busy')finish(fail('本地工作室已在另一应用进程中打开，请先关闭旧窗口或开发服务，再重新启动。',409));
        else finish(fail('本地工作室独占锁无法初始化。',503));
      });
      child.once('error',()=>finish(fail('本地工作室运行环境无法启动，请检查本地 Python 环境。',503)));
      child.once('close',()=>{if(!owned)finish(fail(diagnostics?'本地工作室独占锁无法启动，请检查本地 Python 环境。':'本地工作室独占锁已中断，请重启应用。',503));});
    });
    return {get owned(){return owned && !released;},assert(){if(!owned || released)throw fail('本地工作室独占锁已释放，请重启应用。',503);},release};
  } catch(error) {await release();throw error;}
}

function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(`${label}需要为 1 至 ${max} 字。`);
  return value.trim();
}
function imageSize(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 45 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw fail('PNG 图片内容无效。');
    let width, height, bitDepth, colorType, interlace, end = false;
    const data = [];
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8), next = offset + 12 + length;
      if (next > bytes.length || length > MAX_IMAGE_BYTES) throw fail('PNG 图片数据不完整。');
      if(crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw fail('PNG 图片校验失败，请重新选择图片。');
      if (offset === 8 && (kind !== 'IHDR' || length !== 13)) throw fail('PNG 图片尺寸无效。');
      if (kind === 'IHDR') {
        if(offset!==8 || bytes[offset+18]!==0 || bytes[offset+19]!==0 || ![0,1].includes(bytes[offset+20]))throw fail('PNG 图片头无效。');
        width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12); bitDepth = bytes[offset + 16]; colorType = bytes[offset + 17];interlace=bytes[offset+20];
      }
      if (kind === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + length));
      if (kind === 'IEND') { end = length === 0 && next === bytes.length; break; }
      offset = next;
    }
    if (!end || !data.length) throw fail('PNG 图片数据不完整。');
    if (!width || !height || width > 4096 || height > 4096) throw fail('参考图片最长边不能超过 4096 像素。');
    const validDepths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]},channels={0:1,2:3,3:1,4:2,6:4};
    if(!validDepths[colorType]?.includes(bitDepth))throw fail('PNG 图片颜色格式无效。');
    const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
    const rows=passes.map(([x,y,dx,dy])=>{const columns=Math.max(0,Math.ceil((width-x)/dx)),count=Math.max(0,Math.ceil((height-y)/dy));return {size:Math.ceil(columns*channels[colorType]*bitDepth/8)+1,count:columns?count:0};});
    const expected=rows.reduce((sum,row)=>sum+row.size*row.count,0);
    try {
      const decoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});
      if(decoded.length!==expected)throw new Error();
      let cursor=0;for(const row of rows)for(let index=0;index<row.count;index++){if(decoded[cursor]>4)throw new Error();cursor+=row.size;}
    } catch {throw fail('PNG 图片无法解码。');}
    return [width, height];
  }
  if (mime === 'image/jpeg') {
    if (bytes.length < 16 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw fail('JPEG 图片内容无效。');
    let dimensions = null;
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset++] !== 255) throw fail('JPEG 图片结构无效。');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218) { if (dimensions) return dimensions; break; }
      if (marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) throw fail('JPEG 图片数据不完整。');
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (size < 8) throw fail('JPEG 图片尺寸无效。');
        dimensions = [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      }
      offset += size;
    }
    throw fail('JPEG 图片无法识别。');
  }
  if (mime === 'image/webp') {
    if (bytes.length < 30 || bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) throw fail('WebP 图片内容无效。');
    let dimensions = null, hasImage = false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = bytes.toString('ascii',offset,offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (start + length > bytes.length) throw fail('WebP 图片数据不完整。');
      if (kind === 'VP8X' && length >= 10) dimensions = [1 + bytes.readUIntLE(start + 4,3), 1 + bytes.readUIntLE(start + 7,3)];
      if (kind === 'VP8 ' && length >= 10 && bytes.subarray(start + 3,start + 6).equals(Buffer.from([157,1,42]))) { dimensions ||= [bytes.readUInt16LE(start + 6) & 16383,bytes.readUInt16LE(start + 8) & 16383]; hasImage = true; }
      if (kind === 'VP8L' && length >= 5 && bytes[start] === 47) { const bits = bytes.readUInt32LE(start + 1); dimensions ||= [(bits & 16383) + 1,((bits >>> 14) & 16383) + 1]; hasImage = true; }
      offset = start + length + (length % 2);
    }
    if (dimensions && hasImage) return dimensions;
    throw fail('请选择静态 WebP 图片。');
  }
  throw fail('只支持 PNG、JPEG 或 WebP 图片。');
}
function referenceImage(value) {
  if (!value || typeof value !== 'object' || typeof value.dataUrl !== 'string') throw fail('参考图片格式无效。');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);
  if (!match || match[2].length % 4 !== 0) throw fail('参考图片需要为 PNG、JPEG 或 WebP。');
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw fail('每张参考图片最多 8 MB。',413);
  const bytes = Buffer.from(match[2],'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw fail('每张参考图片最多 8 MB。',413);
  const [width,height] = imageSize(bytes, match[1]);
  if (!width || !height || width > 4096 || height > 4096) throw fail('参考图片最长边不能超过 4096 像素。');
  return { bytes, extension: { 'image/png':'.png', 'image/jpeg':'.jpg', 'image/webp':'.webp' }[match[1]], name: typeof value.name === 'string' ? value.name.replace(/[\\/\0]/g,'').slice(0,128) || '参考图片' : '参考图片' };
}

export function validateStudioRig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('动画定位数据无效。');
  const unit = number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1;
  const positive = number => unit(number) && number > 0 && number <= .5;
  const color = numbers => Array.isArray(numbers) && numbers.length === 3 && numbers.every(unit);
  const point = numbers => Array.isArray(numbers) && numbers.length === 2 && numbers.every(unit);
  const h=value.head,m=value.mouth,b=value.bounds,s=value.shoulders,e=value.eyes;
  if (!h || ![h.x,h.y,h.neckY].every(unit) || ![h.radiusX,h.radiusY].every(positive) || h.neckY < h.y) throw fail('头部定位数据无效。');
  if (!Array.isArray(e) || e.length !== 2 || e.some(eye=>!eye || ![eye.x,eye.y].every(unit) || ![eye.rx,eye.ry].every(positive) || !color(eye.skin) || !color(eye.lid))) throw fail('眼睛定位数据无效。');
  if (!m || ![m.x,m.y].every(unit) || ![m.rx,m.ry].every(positive) || !color(m.skin) || !color(m.lip) || !color(m.inner)) throw fail('嘴部定位数据无效。');
  if (!s || !point(s.left) || !point(s.right) || s.left[0] >= s.right[0]) throw fail('肩部定位数据无效。');
  if (!b || ![b.left,b.top,b.right,b.bottom].every(unit) || b.left >= b.right || b.top >= b.bottom) throw fail('人物边界数据无效。');
  return clone({head:h,eyes:e,mouth:m,shoulders:s,bounds:b,armMobility:0});
}

function publicJob(job) {
  const result = {id:job.id,kind:job.kind,name:job.name,status:job.status,phase:job.phase,progress:job.progress || 0,message:job.message || '',createdAt:job.createdAt,updatedAt:job.updatedAt};
  for (const key of ['previewUrl','rig','warnings','importedLookId','importedItemId','importedSelection','peakMemoryBytes','maxRssBytes']) if (job[key] !== undefined) result[key] = clone(job[key]);
  if (job.input) result.input = {kind:job.input.kind,name:job.input.name,prompt:job.input.prompt,resolution:job.input.resolution,baseLookId:job.input.baseLookId,itemId:job.input.itemId,slot:job.input.slot,operation:job.input.operation,baseSelection:job.input.baseSelection,referenceNames:job.input.referenceNames || [],referenceCount:job.input.referenceNames?.length || 0};
  return result;
}

export async function createLocalStudio({directory=DEFAULT_STUDIO_DIRECTORY,staticRoot,runtime,onGenerateStart=async()=>{},onCatalogChange=()=>{}}={}) {
  if(staticRoot)staticRoot=await realpath(resolve(staticRoot));
  directory=resolve(directory);
  await mkdir(directory,{recursive:true,mode:0o700});
  directory=await realpath(directory);
  const ownership=await acquireStudioOwnership(directory);
  try {
  await mkdir(join(directory,'assets'),{recursive:true,mode:0o700});
  await mkdir(join(directory,'jobs'),{recursive:true,mode:0o700});
  if (!runtime) { const module=await import('./local-image-runtime.mjs');runtime=module.createLocalImageRuntime({directory}); }
  const manifestPath=join(directory,'manifest.json');
  let manifest={version:1,jobs:[],catalog:{looks:[],items:[],fits:[]}};
  try {
    const parsed=JSON.parse(await readFile(manifestPath,'utf8'));
    if(parsed.version!==1 || !Array.isArray(parsed.jobs) || !parsed.catalog || !['looks','items','fits'].every(key=>Array.isArray(parsed.catalog[key]))) throw new Error('Invalid local studio manifest');
    manifest=parsed;
  } catch(error) {if(error.code!=='ENOENT') throw fail('本地工作室数据无法读取，请检查数据目录。',500);}
  for(const job of manifest.jobs) if(ACTIVE.has(job.status)) {job.status='failed';job.phase='interrupted';job.message='上次任务被中断，请重新生成。';job.updatedAt=new Date().toISOString();}
  let closed=false,closePromise,operation=Promise.resolve(),active=null;
  const pending=new Set();
  const save=async()=>{ownership.assert();const temporary=join(directory,`manifest-${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(manifest,null,2),{mode:0o600});ownership.assert();await rename(temporary,manifestPath);};
  const mutate=fn=>{const result=operation.then(fn);operation=result.catch(()=>{});return result;};
  const catalog=()=>clone(manifest.catalog);
  const currentCatalog=()=>({
    looks:[...new Map([...LOOKS,...manifest.catalog.looks].map(look=>[look.id,look])).values()],
    items:[...new Map([...WARDROBE_ITEMS,...manifest.catalog.items].map(item=>[item.id,item])).values()],
    // Imported results supersede stale global copies while preserving other combinations.
    fits:[...manifest.catalog.fits,...WARDROBE_FITS],
  });
  const publish=()=>onCatalogChange(catalog());
  await save();publish();
  const findJob=id=>{const job=manifest.jobs.find(job=>job.id===id);if(!job)throw fail('生成任务不存在。',404);return job;};
  const localPath=async(path,root=directory)=>{
    const candidate=resolve(root,path);
    if(!inside(root,candidate))throw fail('禁止访问此路径。',403);
    const actual=await realpath(candidate).catch(()=>{throw fail('文件不存在。',404);});
    if(!inside(root,actual) || !(await stat(actual)).isFile())throw fail('禁止访问此路径。',403);
    return actual;
  };
  const getAsset=async(url)=>{
    let pathname;try {pathname=decodeURIComponent(String(url).split('?')[0]);}catch{throw fail('路径格式无效。');}
    if(pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part=>part==='..' || part.startsWith('.')))throw fail('禁止访问此路径。',403);
    if(!/^\/local-studio\/(?:assets\/[\w-]+\/(?:character\.png|rig\.json|item\.(?:png|jpg|webp))|jobs\/[\w-]+\/output\/(?:character\.png|rig\.json))$/.test(pathname))throw fail('文件不存在。',404);
    return localPath(pathname.slice('/local-studio/'.length));
  };
  const sourceAsset=async(url)=>{
    if(typeof url!=='string')throw fail('这个造型没有可用的全身图片。');
    if(url.startsWith('/local-studio/'))return getAsset(url);
    if(!staticRoot || !/^\/(?:looks|wardrobe)\//.test(url) || url.includes('\\') || url.includes('\0'))throw fail('人物来源图片不存在。',404);
    return localPath(`.${url}`,resolve(staticRoot));
  };
  const safeMessage=value=>String(value || '').split(directory).join('[本地工作室]').split(staticRoot || '\0').join('[应用资源]').split(homedir()).join('[用户目录]').replace(/\/(?:private|var|tmp|Applications|Library)\/[^\s"'<>]+/g,'[本地路径]');
  const cleanJob=job=>{const result=publicJob(job);result.message=safeMessage(result.message);return result;};
  const info=async()=>{
    const profile=await runtime.info(),publicRuntime={};
    for(const key of ['ready','state','model','modelRevision','mfluxVersion','downloadBytes','resolutions','maxReferences'])if(profile[key]!==undefined)publicRuntime[key]=clone(profile[key]);
    publicRuntime.message=safeMessage(profile.message);
    return {runtime:publicRuntime,activeJob:active?cleanJob(active.job):null,jobs:manifest.jobs.slice().reverse().map(cleanJob),catalog:catalog()};
  };
  const report=(job,value)=>{
    if(!ACTIVE.has(job.status) || closed || !value || typeof value!=='object')return;
    if(typeof value.phase==='string')job.phase=value.phase.slice(0,80);
    if(Number.isFinite(value.progress))job.progress=Math.max(0,Math.min(100,value.progress));
    if(typeof value.message==='string')job.message=value.message.slice(0,300);
    if(Number.isFinite(value.peakMemoryBytes) && value.peakMemoryBytes>=0)job.peakMemoryBytes=Math.max(job.peakMemoryBytes || 0,value.peakMemoryBytes);
    job.updatedAt=new Date().toISOString();
  };
  const run=async(job,controller,isSetup)=>{
    try {
      await mutate(async()=>{if(controller.signal.aborted)return;job.status='running';job.phase=isSetup?'installing':'preparing';await save();});
      if(controller.signal.aborted)return;
      if(isSetup) await runtime.setup({signal:controller.signal,onProgress:value=>report(job,value)});
      else {
        await onGenerateStart({signal:controller.signal});
        if(controller.signal.aborted)throw Object.assign(new Error('cancelled'),{name:'AbortError'});
        const refs=[];
        for(const path of job.sourceReferencePaths || [])refs.push(await localPath(path));
        for(const path of job.referencePaths)refs.push(await localPath(path));
        const outputDirectory=join(directory,'jobs',job.id,'output');await mkdir(outputDirectory,{recursive:true});
        if(controller.signal.aborted)throw Object.assign(new Error('cancelled'),{name:'AbortError'});
        const [width,height]=RESOLUTIONS[job.input.resolution];
        const typeInstructions=job.generationInstructions;
        const prompt=`${typeInstructions} Full body, front view, standing naturally, feet and shoes fully visible, one adult character, centered, plain light gray background, no text. ${job.input.prompt}`;
        const result=await runtime.generate({references:refs,prompt,width,height,seed:job.seed,outputDirectory,signal:controller.signal,onProgress:value=>report(job,value)});
        if(controller.signal.aborted)return;
        const asset=await localPath(result.assetPath,outputDirectory),rigPath=await localPath(result.rigPath,outputDirectory);
        const bytes=await readFile(asset);imageSize(bytes,'image/png');
        const rig=validateStudioRig(JSON.parse(await readFile(rigPath,'utf8')));
        if(asset!==join(outputDirectory,'character.png'))await copyFile(asset,join(outputDirectory,'character.png'));
        await writeFile(join(outputDirectory,'rig.json'),JSON.stringify(rig,null,2));
        job.rig=rig;job.previewUrl=`/local-studio/jobs/${job.id}/output/character.png`;
        job.warnings=Array.isArray(result.warnings)?result.warnings.filter(value=>typeof value==='string').map(value=>value.slice(0,300)).slice(0,10):[];
        for(const key of ['peakMemoryBytes','maxRssBytes'])if(Number.isFinite(result[key]) && result[key]>=0)job[key]=result[key];
      }
      await mutate(async()=>{if(controller.signal.aborted || job.status==='cancelled')return;job.status=isSetup?'imported':'preview';job.phase=isSetup?'ready':'preview';job.progress=100;job.message=isSetup?'本地生成引擎已准备好。':'生成完成，请检查人物和动画定位后导入。';job.updatedAt=new Date().toISOString();await save();});
    } catch(error) {
      await mutate(async()=>{if(job.status==='cancelled')return;job.status=controller.signal.aborted?'cancelled':'failed';job.phase=job.status;job.message=controller.signal.aborted?'任务已取消。':typeof error.message==='string'?error.message.slice(0,600):'本地生成失败，请重试。';job.updatedAt=new Date().toISOString();await save();});
    } finally {
      if(['failed','cancelled'].includes(job.status))await rm(join(directory,'jobs',job.id,'references'),{recursive:true,force:true}).catch(()=>{});
      if(active?.job===job)active=null;
    }
  };
  const launch=(job,isSetup=false)=>{const controller=new AbortController();active={job,controller,isSetup};const promise=run(job,controller,isSetup);pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});};
  const ensureIdle=()=>{if(closed)throw fail('工作室正在关闭。',503);if(active)throw fail('已有本地任务正在进行，请完成或取消后再开始。',409);};
  const setup=()=>mutate(async()=>{ensureIdle();const job={id:randomUUID(),kind:'setup',name:'准备本地生成引擎',status:'queued',phase:'queued',progress:0,message:'等待安装',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};manifest.jobs.push(job);await save();launch(job,true);return publicJob(job);});
  const createJob=input=>mutate(async()=>{
    ensureIdle();
    if(!input || !['character','outfit','fit'].includes(input.kind))throw fail('生成类型无效。');
    const name=text(input.name,'名称',60),prompt=text(input.prompt,'生成描述',2000),resolution=input.resolution || 'small';
    if(!RESOLUTIONS[resolution])throw fail('生成尺寸无效。');
    const references=input.references || [];
    if(!Array.isArray(references) || references.length>3)throw fail('最多上传 3 张参考图片。');
    const images=references.map(referenceImage);
    const available=currentCatalog();
    const base=input.baseLookId?available.looks.find(look=>look.id===input.baseLookId):null;
    const item=input.itemId?available.items.find(item=>item.id===input.itemId):null;
    if(input.kind==='character' && (!images.length || input.baseLookId || input.itemId))throw fail('新角色需要至少 1 张参考图片。');
    if(input.kind!=='character' && (!base || base.renderer!=='glam'))throw fail('请选择可用的全身人物造型。');
    if(input.kind==='outfit' && input.itemId)throw fail('整套换装不需要单品条目。');
    let slot,operation,baseSelection,selection,generationInstructions;
    const sourceUrls=[];
    if(input.kind==='fit') {
      slot=input.slot || item?.slot || 'shoes';operation=input.operation || 'equip';
      if(!GARMENT_SLOT_IDS.includes(slot))throw fail('单品分类无效。');
      if(!['equip','restore'].includes(operation))throw fail('单品操作无效。');
      if(item && item.slot!==slot)throw fail('单品不属于所选分类。');
      try {baseSelection=normalizeWardrobeSelection(input.baseSelection===undefined?{}:input.baseSelection,{strict:true,lookId:base.id,items:available.items});}
      catch(error){throw fail(error.message);}
      const current=getWardrobeCombinationFit(base.id,baseSelection,available);
      if(!current)throw fail('当前穿搭组合尚未适配，请先完成这套组合。');
      sourceUrls.push(current.asset);
      selection={...baseSelection};
      const preserve=`Keep the same adult person, face, body, pose and every detail outside the ${SLOT_DESCRIPTION[slot]} as image 1. Preserve every other selected item, including clothing, hair, nails and jewelry that is not being changed.`;
      if(operation==='restore') {
        if(input.itemId || images.length)throw fail('恢复原配不需要新单品或上传图片。');
        if(!baseSelection[slot])throw fail('当前分类没有单品替换，无需恢复原配。');
        delete selection[slot];sourceUrls.push(base.asset);
        generationInstructions=`${preserve} Restore only the ${SLOT_DESCRIPTION[slot]} from image 2 (the original outfit); image 2 is a detail reference, not a replacement person or complete outfit. Preserve all other details from image 1.`;
      } else {
        if((input.itemId && !item) || (!item && !images.length))throw fail('请选择已有单品或上传单品图片。');
        if(item) {
          selection[slot]=item.id;
          if(item.asset)sourceUrls.push(item.asset);
        }
        generationInstructions=`${preserve} Replace only the ${SLOT_DESCRIPTION[slot]} using the item reference images. ${item?.color?`Set the fingernail polish to ${item.color}, with a glossy finish. Do not recolor the skin, clothes or lips.`:''} Keep clothing opaque and retain appropriate coverage.`;
      }
      selection=normalizeWardrobeSelection(selection,{strict:true,lookId:base.id,items:available.items});
    } else {
      if(base)sourceUrls.push(base.asset);
      generationInstructions=input.kind==='character'?'Use the reference images to preserve the adult character identity and appearance.':'Keep the same adult person, face, hairstyle and body as image 1. Change only the outfit requested.';
    }
    if(images.length+sourceUrls.length>3)throw fail('人物和单品来源合计最多 3 张，请减少上传参考图。');
    const status=await runtime.info();if(!status.ready)throw fail('请先准备本地生成引擎。',503);
    const id=randomUUID(),referencePaths=[],sourceReferencePaths=[];
    const refsDirectory=join(directory,'jobs',id,'references');await mkdir(refsDirectory,{recursive:true,mode:0o700});
    for(let index=0;index<images.length;index++){const rel=join('jobs',id,'references',`${index+1}${images[index].extension}`);await writeFile(join(directory,rel),images[index].bytes,{mode:0o600});referencePaths.push(rel);}
    try {for(let index=0;index<sourceUrls.length;index++) {const source=await sourceAsset(sourceUrls[index]);const rel=join('jobs',id,'references',`source-${index+1}${extname(source)}`);await copyFile(source,join(directory,rel));sourceReferencePaths.push(rel);}}
    catch(error) {await rm(refsDirectory,{recursive:true,force:true});throw error;}
    const job={id,kind:input.kind,name,status:'queued',phase:'queued',progress:0,message:'等待本地生成',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),seed:randomInt(2147483647),referencePaths,sourceReferencePaths,generationInstructions,selection,input:{kind:input.kind,name,prompt,resolution,baseLookId:base?.id,itemId:item?.id,slot,operation,baseSelection,referenceNames:images.map(image=>image.name)}};
    manifest.jobs.push(job);await save();launch(job);return publicJob(job);
  });
  const cancelJob=id=>mutate(async()=>{if(closed)throw fail('工作室正在关闭。',503);const job=findJob(id);if(!ACTIVE.has(job.status))throw fail('这个任务已经结束。',409);job.status='cancelled';job.phase='cancelled';job.message='任务已取消，正在释放本地生成资源。';job.updatedAt=new Date().toISOString();if(active?.job===job)active.controller.abort();await save();return publicJob(job);});
  const importJob=(id,input={})=>mutate(async()=>{
    if(closed)throw fail('工作室正在关闭。',503);
    const job=findJob(id);if(job.status==='imported')throw fail('这个结果已导入。',409);if(job.status!=='preview')throw fail('请先完成生成并检查预览。',409);
    const name=input.name===undefined?job.name:text(input.name,'名称',60),rig=validateStudioRig(input.rig===undefined?job.rig:input.rig);
    const assetDirectory=join(directory,'assets',job.id);await mkdir(assetDirectory,{recursive:true});
    await copyFile(await getAsset(job.previewUrl),join(assetDirectory,'character.png'));await writeFile(join(assetDirectory,'rig.json'),JSON.stringify(rig,null,2));
    const asset=`/local-studio/assets/${job.id}/character.png`,rigUrl=`/local-studio/assets/${job.id}/rig.json`;
    if(job.kind==='fit') {
      let itemId=job.input.itemId;
      const slot=job.input.slot || 'shoes',selection={...(job.selection || job.input.baseSelection || {})};
      if(job.input.operation!=='restore') {
        if(!itemId){
          itemId=`local-item-${job.id}`;
          const source=await localPath(job.referencePaths[0]),extension=extname(source);
          const sourceLook=[...LOOKS,...manifest.catalog.looks].find(look=>look.id===job.input.baseLookId);
          await copyFile(source,join(assetDirectory,`item${extension}`));
          manifest.catalog.items.push({id:itemId,slot,name,description:job.input.prompt,asset:`/local-studio/assets/${job.id}/item${extension}`,audience:'adult',fitPolicy:'local-image-adapt',status:'source-ready',isLocal:true,
            sourceLookId:sourceLook?.id,sourceCharacterId:sourceLook?.characterId});
        }
        selection[slot]=itemId;
      } else delete selection[slot];
      const available=currentCatalog();
      const normalized=normalizeWardrobeSelection(selection,{strict:true,lookId:job.input.baseLookId,items:available.items});
      const key=wardrobeSelectionKey(normalized,{items:available.items});
      manifest.catalog.fits=manifest.catalog.fits.filter(fit=>{
        if(fit.lookId!==job.input.baseLookId)return true;
        const oldItem=available.items.find(item=>item.id===fit.itemId);
        const previous=fit.selection || (oldItem?{[oldItem.slot]:oldItem.id}:{});
        return wardrobeSelectionKey(previous,{lookId:fit.lookId,items:available.items})!==key;
      });
      manifest.catalog.fits.push({lookId:job.input.baseLookId,itemId,slot,selection:normalized,asset,rig:rigUrl,isLocal:true});
      if(itemId)job.importedItemId=itemId;
      job.importedSelection=normalized;
    } else {
      const base=job.kind==='outfit'?[...LOOKS,...manifest.catalog.looks].find(look=>look.id===job.input.baseLookId):null;
      if(job.kind==='outfit' && !base)throw fail('来源造型已不存在。',404);
      const character=base?.character || name,characterId=base?.characterId || `local-character-${job.id}`,lookId=`local-look-${job.id}`;
      manifest.catalog.looks.push({id:lookId,characterId,character,name:`${character} · ${base?name:'本地生成'}`,age:base?.age || 28,outfit:base?name:'本地生成',description:job.input.prompt,color:base?.color || '#b8a5cf',region:base?.region || null,styles:base?.styles || ['成熟'],isNew:true,isLocal:true,greetingMotion:'nod',characterDefault:!base,actions:null,baseLayer:null,aliases:[name,character],renderer:'glam',asset,thumbnail:asset,rig:rigUrl,textures:null});job.importedLookId=lookId;
    }
    job.name=name;job.rig=rig;job.previewUrl=asset;job.status='imported';job.phase='imported';job.message='已保存到本地衣橱。';job.updatedAt=new Date().toISOString();await save();publish();
    await rm(join(directory,'jobs',job.id,'references'),{recursive:true,force:true}).catch(()=>{});
    await rm(join(directory,'jobs',job.id,'output'),{recursive:true,force:true}).catch(()=>{});
    return {job:publicJob(job),catalog:catalog()};
  });
  const close=()=>{
    if(closePromise)return closePromise;
    closed=true;
    closePromise=(async()=>{try {if(active){active.controller.abort();active.job.status='cancelled';active.job.phase='cancelled';active.job.message='应用关闭，任务已取消。';active.job.updatedAt=new Date().toISOString();}await Promise.allSettled([...pending]);await operation;if(ownership.owned)await save();}finally{await ownership.release();}})();
    return closePromise;
  };
  return {info,setup,createJob,cancelJob,importJob,getAsset,close,get busy(){return Boolean(active && !active.isSetup);}};
  } catch(error) {await ownership.release();throw error;}
}
