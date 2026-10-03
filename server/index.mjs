import http from 'node:http';
import { homedir } from 'node:os';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineReply, normalizeHistory, MAX_MESSAGE_LENGTH, SCENES, AVATAR_MODES } from './dialogue.mjs';
import { listModels, modelReply, modelReplyStream } from './ollama.mjs';
import { normalizeCompanionContext } from './companion-memory.mjs';
import { createVoiceService } from './voice.mjs';
import { LOOKS, cleanRemovedLookIds, getAvailableLookId, isLookId, ORIGINAL_LOOK, setLocalLooks } from './looks.mjs';
import { setLocalWardrobe } from './wardrobe.mjs';
import { createLocalStudio, DEFAULT_STUDIO_DIRECTORY, STUDIO_BODY_LIMIT } from './local-studio.mjs';
import { normalizePersonaSnapshot, resolvePersonaProfile } from './personas.mjs';
import { createTextPackLibrary, TEXT_PACK_BODY_LIMIT } from './text-packs.mjs';
import { classifyTextEntries } from './text-classifier.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 64 * 1024;
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.wav':'audio/wav','.mp3':'audio/mpeg','.woff2':'font/woff2'};

function fail(message,status=400) { return Object.assign(new Error(message),{status}); }
function json(response, status, data) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(data));
}

async function body(request, limit=MAX_BODY) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw fail('请使用 JSON 请求。',415);
  if (Number(request.headers['content-length']) > limit) { request.resume(); throw fail('请求内容过长。',413); }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw fail('请求内容过长。',413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw fail('请输入有效内容。');
    return value;
  } catch (error) { throw fail(error.status ? error.message : 'JSON 内容格式不正确。'); }
}

function normalizePersonaMemory(value) {
  if (value == null) return { userName: '', preferences: [], relationshipFacts: [] };
  if (typeof value !== 'object' || Array.isArray(value)) throw fail('人格记忆格式无效。');
  if (value.userName != null && (typeof value.userName !== 'string' || value.userName.length > 24)) throw fail('用户称呼最多 24 字。');
  const cleanList = (items, label) => {
    if (items == null) return [];
    if (!Array.isArray(items) || items.length > 20) throw fail(`${label}列表无效。`);
    if (items.some(item => typeof item !== 'string' || !item.trim() || item.length > 120)) throw fail(`${label}内容无效。`);
    return items.map(item => item.trim());
  };
  return {
    userName: typeof value.userName === 'string' ? value.userName.trim() : '',
    preferences: cleanList(value.preferences, '用户偏好'),
    relationshipFacts: cleanList(value.relationshipFacts, '关系记忆'),
  };
}

function normalizeChatPersona(value) {
  if (value == null) return resolvePersonaProfile({
    id: 'older-sister',
    templateId: 'older-sister',
    intimacyLevel: 'mature',
  });
  if (typeof value !== 'object' || Array.isArray(value)) throw fail('人格快照格式无效。');
  try {
    return normalizePersonaSnapshot(value);
  } catch (error) {
    throw fail(error instanceof Error ? error.message : '人格快照格式无效。');
  }
}

function chatInput(value) {
  if (typeof value.message !== 'string' || !value.message.trim()) throw fail('请输入想说的话。');
  if (value.message.length > MAX_MESSAGE_LENGTH) throw fail('每条消息最多 2000 字。');
  if (value.provider && !['offline','ollama'].includes(value.provider)) throw fail('只支持离线对话或本机模型。');
  if (value.avatarMode != null && !AVATAR_MODES.includes(value.avatarMode)) throw fail('形象模式无效。');
  if (value.lookId != null && !isLookId(value.lookId)) throw fail('角色造型无效。');
  if (value.removedLookIds != null && (!Array.isArray(value.removedLookIds) || value.removedLookIds.length > LOOKS.length || value.removedLookIds.some(id => typeof id !== 'string' || !LOOKS.some(look => look.id === id)))) throw fail('已移除造型列表无效。');
  if (value.model != null && (typeof value.model !== 'string' || !/^[\w./:-]{1,100}$/.test(value.model))) throw fail('模型名称格式无效。');
  if (value.stream != null && typeof value.stream !== 'boolean') throw fail('流式参数无效。');
  let companionContext;
  try { companionContext = normalizeCompanionContext(value.companionContext); }
  catch(error) { throw fail(error.message || '陪伴记忆格式无效。'); }
  const removedLookIds = cleanRemovedLookIds(value.removedLookIds);
  const lookId = getAvailableLookId(removedLookIds, value.lookId || ORIGINAL_LOOK.id);
  return {stream:value.stream === true,companionContext,message:value.message.trim(),history:normalizeHistory(value.history),persona:normalizeChatPersona(value.persona),personaMemory:normalizePersonaMemory(value.personaMemory),scene:SCENES.includes(value.scene)?value.scene:'home',avatarMode:value.avatarMode || 'photo',lookId,removedLookIds,provider:value.provider || 'offline',model:value.model};
}

function allowedRequest(request, port) {
  const validHosts = new Set([`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]);
  if (!validHosts.has(request.headers.host)) return false;
  if (!request.headers.origin) return true;
  return [...validHosts].some(host => request.headers.origin === `http://${host}`);
}

async function serveStatic(request,response,staticDir) {
  let pathname;
  try { pathname=decodeURIComponent((request.url || '/').split('?')[0]); } catch { throw fail('路径格式无效。'); }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part=>part==='..' || part.startsWith('.'))) throw fail('禁止访问此路径。',403);
  const candidate = resolve(staticDir, `.${pathname === '/' ? '/index.html' : pathname}`);
  const inside = path => {const rel=relative(staticDir,path);return rel==='' || (!rel.startsWith(`..${sep}`) && rel!=='..' && !isAbsolute(rel));};
  if (!inside(candidate)) throw fail('禁止访问此路径。',403);
  try {
    const actual = await realpath(candidate);
    if (!inside(actual)) throw fail('禁止访问此路径。',403);
    const details=await stat(actual);
    if (!details.isFile()) throw fail('文件不存在。',404);
    response.writeHead(200,{'Content-Type':TYPES[extname(actual).toLowerCase()] || 'application/octet-stream','Content-Length':details.size,'Cache-Control':'no-cache'});
    if(request.method==='HEAD') response.end();
    else await pipeline(createReadStream(actual),response);
  } catch(error) { if(error.status) throw error; throw fail('文件不存在。',404); }
}

export async function startServer({port=4317,host='127.0.0.1',staticDir,prewarm=false,voiceDirectory=join(homedir(),'Library/Application Support/沐语/voice-library'),studioDirectory=DEFAULT_STUDIO_DIRECTORY,imageRuntime,textPackDirectory}={}) {
  if (!['127.0.0.1','localhost','::1'].includes(host)) throw new Error('沐语只允许监听本机地址。');
  const selected=resolve(staticDir || (existsSync(join(ROOT,'dist','index.html'))?join(ROOT,'dist'):join(ROOT,'public')));
  const staticRoot=await realpath(selected).catch(()=>selected);
  const controllers = new Set();
  const inferenceRequests = new Set();
  const ownedChatModels = new Set();
  const textClassifiers = new Set();
  const textLibrary=await createTextPackLibrary({directory:textPackDirectory || join(dirname(voiceDirectory),'text-library')});
  const voiceService=createVoiceService({libraryDirectory:voiceDirectory});
  const studio=await createLocalStudio({directory:studioDirectory,staticRoot,runtime:imageRuntime,onCatalogChange:catalog=>{setLocalLooks(catalog.looks);setLocalWardrobe(catalog);},onGenerateStart:async({signal})=>{
    const requests=[...inferenceRequests];
    for(const request of requests)request.controller.abort();
    voiceService.reset();
    if(requests.length) {
      let timer;
      try {await Promise.race([Promise.allSettled(requests.map(request=>request.done)),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally {clearTimeout(timer);}
    }
    if(signal.aborted)return;
    voiceService.reset();
    // Only release models used by this app instance, leaving unrelated Ollama work alone.
    for(const model of ownedChatModels) {
      if(signal.aborted)return;
      try {await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,keep_alive:0}),signal:AbortSignal.timeout(2000)});}catch{}
    }
  }});
  const server=http.createServer(async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const controller=new AbortController();
    let finishRequest;
    const inference={controller,done:new Promise(resolve=>{finishRequest=resolve;})};
    controllers.add(controller);
    response.on('close',()=>{if(!response.writableEnded)controller.abort();controllers.delete(controller);});
    try {
      if(!allowedRequest(request,server.address().port)) throw fail('仅允许此应用的本机请求。',403);
      const pathname=(request.url || '/').split('?')[0];
      const classifying=/^\/api\/text-packs\/[a-zA-Z0-9_-]+\/classify$/.test(pathname) && request.method==='POST';
      inference.kind=classifying?'classification':pathname;
      if(pathname==='/api/chat' || pathname==='/api/tts' || (pathname==='/api/voices' && request.method==='POST') || classifying)inferenceRequests.add(inference);
      const ensureInference=()=>{if(studio.busy || controller.signal.aborted)throw fail('本地图片生成中，已暂停聊天和朗读以释放内存，请稍后再试。',503);};
      if(pathname==='/api/text-packs' && request.method==='GET')return json(response,200,await textLibrary.list());
      if(pathname==='/api/text-packs/extract' && request.method==='POST')return json(response,201,await textLibrary.extract(await body(request,TEXT_PACK_BODY_LIMIT),{signal:controller.signal}));
      const textPackRoute=/^\/api\/text-packs\/([a-zA-Z0-9_-]+)(?:\/(save|select|classify|labels|delete|export))?$/.exec(pathname);
      if(textPackRoute){
        const [,id,operation]=textPackRoute;
        if(!operation && request.method==='GET'){
          const query=new URL(request.url,'http://127.0.0.1').searchParams;
          return json(response,200,await textLibrary.page(id,{offset:Number(query.get('offset') || 0),limit:Number(query.get('limit') || 25),query:query.get('query') || '',kind:query.get('kind') || ''}));
        }
        if(operation==='export' && request.method==='GET'){
          const format=new URL(request.url,'http://127.0.0.1').searchParams.get('format') || 'json';
          const download=await textLibrary.export(id,format);
          response.writeHead(200,{'Content-Type':download.contentType,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="text-pack.${format==='txt'?'txt':'json'}"; filename*=UTF-8''${encodeURIComponent(download.filename)}`});
          if(typeof download.body==='string' || Buffer.isBuffer(download.body))response.end(download.body);
          else await pipeline(download.body,response);
          return;
        }
        if(request.method==='POST'){
          const input=await body(request);
          if(operation==='save')return json(response,200,await textLibrary.save(id,input));
          if(operation==='select')return json(response,200,await textLibrary.select(id,input));
          if(operation==='labels')return json(response,200,await textLibrary.applyLabels(id,input.labels));
          if(operation==='delete')return json(response,200,await textLibrary.remove(id));
          if(operation==='classify'){
            ensureInference();
            if(textClassifiers.size || [...inferenceRequests].some(item=>item!==inference))throw fail('请等当前对话或朗读结束，再整理语料。',409);
            if(!Array.isArray(input.ids) || !input.ids.length || input.ids.length>8)throw fail('每批请选择 1 至 8 条进行本地分类。');
            textClassifiers.add(controller);
            try{
              const {entries}=await textLibrary.select(id,{ids:input.ids});
              const classified=await classifyTextEntries(entries,{model:input.model,signal:controller.signal,onModel:model=>ownedChatModels.add(model)});
              ensureInference();
              return json(response,200,{...await textLibrary.applyLabels(id,classified.entries),model:classified.model});
            }catch(error){
              if(controller.signal.aborted)throw fail(typeof controller.signal.reason==='string'?controller.signal.reason:'本地分类已停止，已完成的条目会保留。',409);
              throw error;
            }finally{textClassifiers.delete(controller);}
          }
        }
      }
      if(pathname==='/api/studio' && request.method==='GET')return json(response,200,await studio.info());
      if(pathname==='/api/studio/setup' && request.method==='POST') {await body(request);return json(response,202,{job:await studio.setup()});}
      if(pathname==='/api/studio/jobs' && request.method==='POST')return json(response,202,{job:await studio.createJob(await body(request,STUDIO_BODY_LIMIT))});
      const studioJob=/^\/api\/studio\/jobs\/([\w-]+)\/(cancel|import)$/.exec(pathname);
      if(studioJob && request.method==='POST') {const input=await body(request);return json(response,200,studioJob[2]==='cancel'?{job:await studio.cancelJob(studioJob[1])}:await studio.importJob(studioJob[1],input));}
      if(pathname==='/api/health' && request.method==='GET') {
        const [models,voice]=await Promise.all([listModels(),voiceService.info()]);
        return json(response,200,{ok:true,app:'muyu-local',mode:models.defaultModel?'ollama':'offline',model:models.defaultModel,voice:voice.available,voiceProfile:voice});
      }
      if(pathname==='/api/models' && request.method==='GET') return json(response,200,await listModels());
      if(pathname==='/api/chat' && request.method==='POST') {
        ensureInference();
        const input=chatInput(await body(request));
        // Interactive dialogue takes priority over optional book classification.
        for(const pending of textClassifiers)pending.abort('对话已开始，语料分类已暂停。可以在对话结束后继续分类。');
        ensureInference();
        if(input.provider==='ollama') {const model=input.model || (await listModels()).defaultModel;ensureInference();if(model)ownedChatModels.add(model);}
        if (input.stream) {
          response.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          response.flushHeaders();
          const onDelta = async delta => {
            if(controller.signal.aborted || response.destroyed) throw new Error('生成已取消。');
            if(!response.write(JSON.stringify({delta})+'\n')) await new Promise((resolve,reject)=>{
              const cleanup=()=>{response.off('drain',drain);response.off('close',close);};
              const drain=()=>{cleanup();resolve();};
              const close=()=>{cleanup();reject(new Error('连接已关闭。'));};
              response.once('drain',drain);response.once('close',close);
            });
          };
          try {
            const result=input.provider==='ollama'?await modelReplyStream(input,{signal:controller.signal,onDelta}):offlineReply(input);
            if(input.provider!=='ollama') await onDelta(result.reply);
            if(!response.destroyed) response.end(JSON.stringify({done:true,result})+'\n');
          } catch(error) {
            if(!response.destroyed) response.end(JSON.stringify({error:controller.signal.aborted?'生成已取消。':'本地回复中断，请重试。'})+'\n');
          }
          return;
        }
        const result=input.provider==='ollama'?await modelReply(input,{signal:controller.signal}):offlineReply(input);
        return json(response,200,result);
      }
      if(pathname==='/api/voices' && request.method==='GET') return json(response,200,await voiceService.library.list());
      if(pathname==='/api/voices' && request.method==='POST') {
        ensureInference();
        const input=await body(request,1400000);
        ensureInference();
        const voice=await voiceService.library.add(input,{signal:controller.signal});
        return json(response,201,{voice,...await voiceService.library.list()});
      }
      if(['/api/voices/select','/api/voices/rename','/api/voices/delete'].includes(pathname) && request.method==='POST') {
        const input=await body(request);
        const operation=pathname.split('/').pop();
        const result=operation==='select'?await voiceService.library.select(input.id):operation==='rename'?await voiceService.library.rename(input.id,input.name):await voiceService.library.remove(input.id);
        if(operation==='delete') voiceService.invalidateVoice(input.id);
        return json(response,200,result);
      }
      if(pathname==='/api/tts' && request.method==='POST') {
        ensureInference();
        const input=await body(request);
        ensureInference();
        if(typeof input.text!=='string' || !input.text.trim() || input.text.length>1500) throw fail('朗读内容需要为 1 至 1500 字。');
        if(input.voiceProfileId != null) {
          if(typeof input.voiceProfileId !== 'string') throw fail('音色 ID 格式无效。');
          await voiceService.library.resolve(input.voiceProfileId);
        }
        ensureInference();
        if(input.stream === true) {
          response.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          response.flushHeaders();
          try {
            await voiceService.synthesize(input.text.trim(),{voiceProfileId:input.voiceProfileId,signal:controller.signal,onChunk:audio=>{if(!response.destroyed)response.write(JSON.stringify({audio:audio.toString('base64')})+'\n')}});
            if(!response.destroyed)response.end(JSON.stringify({done:true})+'\n');
          } catch(error) {if(!response.destroyed)response.end(JSON.stringify({error:error.status?error.message:'声音生成中断，请重试。'})+'\n');}
          return;
        }
        const audio=await voiceService.synthesize(input.text.trim(),{voiceProfileId:input.voiceProfileId,signal:controller.signal});
        if(response.destroyed) return;
        response.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length,'Cache-Control':'no-store'});
        return response.end(audio);
      }
      if(pathname.startsWith('/api/')) throw fail('接口不存在或请求方法不支持。',404);
      if(!['GET','HEAD'].includes(request.method)) throw fail('请求方法不支持。',405);
      if(pathname.startsWith('/local-studio/')) {
        const asset=await studio.getAsset(pathname),details=await stat(asset);
        response.writeHead(200,{'Content-Type':TYPES[extname(asset).toLowerCase()] || 'application/octet-stream','Content-Length':details.size,'Cache-Control':'no-cache'});
        if(request.method==='HEAD') response.end();
        else await pipeline(createReadStream(asset),response);
        return;
      }
      await serveStatic(request,response,staticRoot);
    } catch(error) {
      if(!response.headersSent) json(response,error.status || 500,{error:error.status?error.message:'本地服务暂时遇到问题，请稍后重试。'});
      else if(!response.writableEnded) response.end();
    } finally {
      inferenceRequests.delete(inference);finishRequest();
    }
  });
  server.requestTimeout=100000;
  server.headersTimeout=10000;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
  } catch(error) {
    voiceService.close();
    await studio.close();
    await textLibrary.close();
    throw error;
  }
  if (prewarm) void voiceService.warmup().catch(()=>{});
  return {server,port:server.address().port,close:async()=>{
    for(const controller of controllers)controller.abort();
    voiceService.close();
    await studio.close();
    await textLibrary.close();
    return new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections?.();});
  }};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await startServer({port:Number(process.env.PORT)||4317});
  console.log(`沐语已在本机启动：http://127.0.0.1:${app.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().finally(()=>process.exit(0));});
}
