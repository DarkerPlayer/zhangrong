import { capabilityReply, createMessages, offlineReply } from './dialogue.mjs';

const BASE = 'http://127.0.0.1:11434';
const MODEL = 'qwen2.5:1.5b';

async function requestJson(path, { timeout = 1000, signal, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(`${BASE}${path}`, {...options, signal:controller.signal});
    if (!response.ok) throw new Error(`本地模型服务返回 ${response.status}`);
    const text = await response.text();
    if (text.length > 1000000) throw new Error('本地模型回复超出长度限制');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function listModels() {
  try {
    const data = await requestJson('/api/tags');
    if (!Array.isArray(data.models)) throw new Error('模型列表格式无效');
    const models = data.models.filter(model => typeof model.name === 'string' && !model.remote_host && !model.remote_model && !/(?:-cloud|:cloud)$/.test(model.name))
      .map(model => ({name:model.name,size:Number(model.size) || 0}));
    return {available:true,models,defaultModel:models.find(x=>x.name===MODEL)?.name || models[0]?.name || null};
  } catch {
    return {available:false,models:[],defaultModel:null,error:'本地模型未启动，仍可使用离线场景对话。'};
  }
}

export async function modelReply(input, { signal } = {}) {
  const fallback = offlineReply(input);
  // Known app capabilities are answered deterministically, with their real source.
  if (fallback.petAction || fallback.lookAction || capabilityReply(input.message, input.avatarMode, input.lookId)) return fallback;
  try {
    const status = await listModels();
    const model = input.model || status.defaultModel;
    if (!status.available) throw new Error('本地模型未启动');
    if (!model || !status.models.some(item => item.name === model)) throw new Error('所选本地模型尚未安装');
    const data = await requestJson('/api/chat', {timeout:90000,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      model, messages:createMessages(input), stream:false, keep_alive:'10m',
      options:{temperature:0.8,top_p:0.9,num_predict:220,num_ctx:4096},
    })});
    if (data.error || typeof data.message?.content !== 'string') throw new Error('本地模型返回了无效回复');
    const reply = data.message.content.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
    if (!reply || reply.length > 4000) throw new Error('本地模型没有返回可用文字');
    return {...fallback,reply,provider:'ollama'};
  } catch (error) {
    if (signal?.aborted) throw error;
    return {...fallback,error:`${error.name === 'AbortError' ? '本地模型响应超时' : error.message || '本地模型暂不可用'}，本次使用离线场景回应。`};
  }
}
