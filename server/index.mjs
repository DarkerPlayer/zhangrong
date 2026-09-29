import http from 'node:http';
import { homedir } from 'node:os';
import { readFile, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineReply, normalizeHistory, MAX_MESSAGE_LENGTH, SCENES, AVATAR_MODES } from './dialogue.mjs';
import { listModels, modelReply } from './ollama.mjs';
import { createVoiceService } from './voice.mjs';
import { LOOKS, cleanRemovedLookIds, getAvailableLookId, isLookId, ORIGINAL_LOOK } from './looks.mjs';
import { normalizePersonaSnapshot, resolvePersonaProfile } from './personas.mjs';

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
  const removedLookIds = cleanRemovedLookIds(value.removedLookIds);
  const lookId = getAvailableLookId(removedLookIds, value.lookId || ORIGINAL_LOOK.id);
  return {message:value.message.trim(),history:normalizeHistory(value.history),persona:normalizeChatPersona(value.persona),personaMemory:normalizePersonaMemory(value.personaMemory),scene:SCENES.includes(value.scene)?value.scene:'home',avatarMode:value.avatarMode || 'photo',lookId,removedLookIds,provider:value.provider || 'offline',model:value.model};
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
    response.end(request.method==='HEAD' ? undefined : await readFile(actual));
  } catch(error) { if(error.status) throw error; throw fail('文件不存在。',404); }
}

export async function startServer({port=4317,host='127.0.0.1',staticDir,prewarm=true,voiceDirectory=join(homedir(),'Library/Application Support/沐语/voice-library')}={}) {
  if (!['127.0.0.1','localhost','::1'].includes(host)) throw new Error('沐语只允许监听本机地址。');
  const selected=resolve(staticDir || (existsSync(join(ROOT,'dist','index.html'))?join(ROOT,'dist'):join(ROOT,'public')));
  const staticRoot=await realpath(selected).catch(()=>selected);
  const controllers = new Set();
  const voiceService=createVoiceService({libraryDirectory:voiceDirectory});
  const server=http.createServer(async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const controller=new AbortController();
    controllers.add(controller);
    response.on('close',()=>{if(!response.writableEnded)controller.abort();controllers.delete(controller);});
    try {
      if(!allowedRequest(request,server.address().port)) throw fail('仅允许此应用的本机请求。',403);
      const pathname=(request.url || '/').split('?')[0];
      if(pathname==='/api/health' && request.method==='GET') {
        const [models,voice]=await Promise.all([listModels(),voiceService.info()]);
        return json(response,200,{ok:true,app:'muyu-local',mode:models.defaultModel?'ollama':'offline',model:models.defaultModel,voice:voice.available,voiceProfile:voice});
      }
      if(pathname==='/api/models' && request.method==='GET') return json(response,200,await listModels());
      if(pathname==='/api/chat' && request.method==='POST') {
        const input=chatInput(await body(request));
        const result=input.provider==='ollama'?await modelReply(input,{signal:controller.signal}):offlineReply(input);
        return json(response,200,result);
      }
      if(pathname==='/api/voices' && request.method==='GET') return json(response,200,await voiceService.library.list());
      if(pathname==='/api/voices' && request.method==='POST') {
        const input=await body(request,1400000);
        const voice=await voiceService.library.add(input,{signal:controller.signal});
        return json(response,201,{voice,...await voiceService.library.list()});
      }
      if(['/api/voices/select','/api/voices/rename','/api/voices/delete'].includes(pathname) && request.method==='POST') {
        const input=await body(request);
        const operation=pathname.split('/').pop();
        const result=operation==='select'?await voiceService.library.select(input.id):operation==='rename'?await voiceService.library.rename(input.id,input.name):await voiceService.library.remove(input.id);
        voiceService.reset();
        void voiceService.warmup().catch(()=>{});
        return json(response,200,result);
      }
      if(pathname==='/api/tts' && request.method==='POST') {
        const input=await body(request);
        if(typeof input.text!=='string' || !input.text.trim() || input.text.length>1500) throw fail('朗读内容需要为 1 至 1500 字。');
        if(input.stream === true) {
          response.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          response.flushHeaders();
          try {
            await voiceService.synthesize(input.text.trim(),{signal:controller.signal,onChunk:audio=>{if(!response.destroyed)response.write(JSON.stringify({audio:audio.toString('base64')})+'\n')}});
            if(!response.destroyed)response.end(JSON.stringify({done:true})+'\n');
          } catch(error) {if(!response.destroyed)response.end(JSON.stringify({error:error.status?error.message:'声音生成中断，请重试。'})+'\n');}
          return;
        }
        const audio=await voiceService.synthesize(input.text.trim(),{signal:controller.signal});
        if(response.destroyed) return;
        response.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length,'Cache-Control':'no-store'});
        return response.end(audio);
      }
      if(pathname.startsWith('/api/')) throw fail('接口不存在或请求方法不支持。',404);
      if(!['GET','HEAD'].includes(request.method)) throw fail('请求方法不支持。',405);
      await serveStatic(request,response,staticRoot);
    } catch(error) {
      if(!response.headersSent) json(response,error.status || 500,{error:error.status?error.message:'本地服务暂时遇到问题，请稍后重试。'});
      else if(!response.writableEnded) response.end();
    }
  });
  server.requestTimeout=100000;
  server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
  if (prewarm) void voiceService.warmup().catch(()=>{});
  return {server,port:server.address().port,close:()=>new Promise((resolve,reject)=>{
    for(const controller of controllers)controller.abort();
    voiceService.close();
    server.close(error=>error?reject(error):resolve());
    server.closeIdleConnections?.();
  })};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await startServer({port:Number(process.env.PORT)||4317});
  console.log(`沐语已在本机启动：http://127.0.0.1:${app.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().finally(()=>process.exit(0));});
}
