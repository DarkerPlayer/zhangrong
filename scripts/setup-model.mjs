#!/usr/bin/env node
// Optional one-time bootstrap. All inference remains on this computer.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const RUNTIME=join(ROOT,'.runtime');
const VERSION='v0.34.4';
const MODEL='qwen2.5:1.5b';
const exec=promisify(execFile);

if(process.argv.includes('--help')) {
  console.log('用法：node scripts/setup-model.mjs\n在本项目 .runtime 安装 Ollama 和 qwen2.5:1.5b。首次需要联网，下载约 1.15 GB；之后对话完全本地运行。');
  process.exit(0);
}
if(process.platform!=='darwin') throw new Error('此便携安装脚本适用于 macOS。其他平台请安装 Ollama 后运行 ollama pull qwen2.5:1.5b。');
const binary=join(RUNTIME,'ollama','ollama');
const models=join(RUNTIME,'models');
const downloads=join(RUNTIME,'downloads');
await Promise.all([mkdir(join(RUNTIME,'ollama'),{recursive:true}),mkdir(models,{recursive:true}),mkdir(downloads,{recursive:true})]);
let ownedServer;
let logStream;
async function available() {
  try {const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1000)});return response.ok;} catch{return false;}
}
try {
  if(!await access(binary).then(()=>true,()=>false)) {
    console.log('下载官方 Ollama 运行器并验证校验和…');
    const archive=join(downloads,'ollama-darwin.tgz');
    const checksum=join(downloads,'sha256sum.txt');
    const base=`https://github.com/ollama/ollama/releases/download/${VERSION}`;
    await exec('/usr/bin/curl',['-fL','--retry','2','--connect-timeout','20',`${base}/ollama-darwin.tgz`,'-o',archive],{maxBuffer:2e6});
    await exec('/usr/bin/curl',['-fsSL',`${base}/sha256sum.txt`,'-o',checksum],{maxBuffer:1e6});
    const expected=(await readFile(checksum,'utf8')).split('\n').find(x=>x.endsWith('ollama-darwin.tgz'))?.split(/\s+/)[0];
    const actual=createHash('sha256').update(await readFile(archive)).digest('hex');
    if(!expected || actual!==expected) throw new Error('运行器校验和不匹配，已停止安装。');
    await exec('/usr/bin/tar',['-xzf',archive,'-C',join(RUNTIME,'ollama')]);
  }
  const env={...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_MODELS:models,OLLAMA_NO_CLOUD:'1'};
  if(!await available()) {
    const {open}=await import('node:fs/promises');
    logStream=await open(join(RUNTIME,'ollama-setup.log'),'a');
    ownedServer=spawn(binary,['serve'],{env,cwd:ROOT,stdio:['ignore',logStream.fd,logStream.fd]});
    ownedServer.on('error',error=>console.error('本地模型服务启动失败：',error.message));
    let ready=false;
    for(let attempt=0;attempt<60;attempt++) {
      if(await available()){ready=true;break;}
      if(ownedServer.exitCode!==null)break;
      await new Promise(r=>setTimeout(r,500));
    }
    if(!ready)throw new Error('本地模型服务没有启动。请查看 .runtime/ollama-setup.log。');
  }
  console.log('下载中文模型 qwen2.5:1.5b（约 986 MB，可断点续传）…');
  await new Promise((resolve,reject)=>{
    const child=spawn(binary,['pull',MODEL],{env,cwd:ROOT,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(`模型下载未完成，退出码 ${code}；重新运行此脚本可继续。`)));
  });
  const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:'请用中文简短地说一句晚上好。'}],stream:false,options:{num_predict:40,num_ctx:1024}}),signal:AbortSignal.timeout(120000)});
  const result=await response.json();
  if(!response.ok || typeof result.message?.content!=='string' || !result.message.content.trim())throw new Error('模型下载完成，但首次对话验证失败。');
  await writeFile(join(RUNTIME,'model-ready.json'),JSON.stringify({model:MODEL,version:VERSION,verifiedAt:new Date().toISOString()},null,2)+'\n');
  console.log(`本地模型已就绪：${result.message.content.trim()}\n现在双击“启动沐语.command”或打开沐语.app 即可。`);
} finally {
  if(ownedServer && ownedServer.exitCode===null)ownedServer.kill('SIGTERM');
  await logStream?.close();
}
