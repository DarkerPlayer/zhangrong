import { spawn } from 'node:child_process';
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = fileURLToPath(new URL('../scripts/', import.meta.url));
const modelRevision = '7ee1b3aa8178a1240050490072196a57da2bf2a9';
const mfluxVersion = '0.20.0';
const model = 'FLUX.2 Klein 4B · 4-bit · 本地 MLX';
const abortError = () => Object.assign(new Error('任务已取消'), { name: 'AbortError' });

function run(command, args, { signal, onProgress, offline = false } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    // A separate process group lets cancellation stop Python and its installer/calibrator children.
    const child = spawn(command, args, {
      shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1',
        HF_HUB_DISABLE_XET: '1', ...(offline ? { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } : {}) },
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let pending = '', diagnostics = '', result, killTimer;
    const stop = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1500);
      killTimer.unref();
    };
    signal?.addEventListener('abort', stop, { once: true });
    const consume = (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'progress') onProgress?.({ phase: event.phase, progress: Math.max(0, Math.min(100, Number(event.progress) || 0)), message: String(event.message || ''), ...(Number.isFinite(event.peakMemoryBytes) ? { peakMemoryBytes: event.peakMemoryBytes } : {}) });
        if (event.type === 'result') result = event;
        if (event.type === 'error') diagnostics = String(event.message || '本地生成失败');
      } catch { diagnostics = (diagnostics + '\n' + line).slice(-6000); }
    };
    child.stdout.on('data', (chunk) => {
      pending += chunk.toString();
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, end)); pending = pending.slice(end + 1);
      }
      if (pending.length > 64000) pending = pending.slice(-6000);
    });
    child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-6000); });
    const cleanup = () => { clearTimeout(killTimer); signal?.removeEventListener('abort', stop); };
    child.on('error', (error) => { cleanup(); reject(signal?.aborted ? abortError() : error); });
    child.on('close', (code, termination) => {
      cleanup(); if (pending) consume(pending);
      if (signal?.aborted) return reject(abortError());
      if (code !== 0) return reject(new Error(diagnostics.trim() || `本地任务退出 (${termination || code})`));
      resolve(result);
    });
    if (signal?.aborted) stop();
  });
}

/** Loads image weights only inside an individual worker, which exits after each request. */
export function createLocalImageRuntime({
  directory = path.join(os.homedir(), 'Library', 'Application Support', '沐语', 'local-studio'),
  pythonPath = path.join(directory, 'runtime', 'bin', 'python'),
  workerPath = path.join(scriptsDirectory, 'local-image-worker.py'),
  setupPath = path.join(scriptsDirectory, 'setup-local-image.py'),
  setupPythonPath = '/usr/bin/python3',
} = {}) {
  directory = path.resolve(directory);
  let active = null, lastError = '';

  async function info() {
    const base = { model, modelRevision, mfluxVersion, ready: false, downloadBytes: 4_620_000_000,
      resolutions: [{ width: 512, height: 768 }, { width: 768, height: 1152 }], maxReferences: 3 };
    if (active === 'setup') return { ...base, state: 'installing', message: '正在安装本地生成模型' };
    try {
      await access(pythonPath);
      await access(path.join(directory, 'runtime', 'bin', 'muyu-calibrate'));
      const manifest = JSON.parse(await readFile(path.join(directory, 'runtime-manifest.json'), 'utf8'));
      if (manifest.mfluxVersion !== mfluxVersion || manifest.modelRevision !== modelRevision || !Array.isArray(manifest.files) || manifest.files.length < 2) throw new Error('模型安装记录不完整');
      for (const file of manifest.files) {
        if (!file.path || path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) throw new Error('模型文件记录无效');
        if ((await stat(path.join(directory, 'model', file.path))).size !== file.size) throw new Error('模型下载不完整');
      }
      return { ...base, ready: true, state: 'ready', message: active ? '正在本地生成图片' : '本地模型已就绪；生成时按需加载' };
    } catch {
      return { ...base, state: lastError ? 'error' : 'missing', message: lastError || '首次使用需要下载约 4.6 GB 模型，并安装本地运行环境' };
    }
  }

  async function setup({ signal, onProgress } = {}) {
    if (active) throw new Error('本地任务正在运行，请等待或取消后重试');
    if (signal?.aborted) throw abortError();
    active = 'setup'; lastError = '';
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await run(setupPythonPath, [setupPath, '--directory', directory], { signal, onProgress });
    } catch (error) {
      if (error.name !== 'AbortError') lastError = error.message;
      throw error;
    } finally { active = null; }
    const result = await info();
    if (!result.ready) throw new Error(result.message || '本地模型安装未完成');
    return result;
  }

  async function generate({ references, prompt, width = 512, height = 768, seed = 42, outputDirectory, signal, onProgress } = {}) {
    if (active) throw new Error('本地任务正在运行，请等待或取消后重试');
    if (signal?.aborted) throw abortError();
    if (!Array.isArray(references) || references.length < 1 || references.length > 3) throw new Error('需要 1～3 张参考图片');
    if (![[512, 768], [768, 1152]].some(([w, h]) => w === width && h === height)) throw new Error('请选择 512×768 或 768×1152 尺寸');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 6000) throw new Error('请输入生成描述（最多 6000 字）');
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('随机种子无效');
    if (!outputDirectory || !path.isAbsolute(outputDirectory)) throw new Error('生成输出目录无效');
    active = 'generate';
    const requestPath = path.join(outputDirectory, 'request.json');
    try {
      for (const reference of references) {
        if (typeof reference !== 'string' || !path.isAbsolute(reference) || !(await stat(reference)).isFile()) throw new Error('参考图片不存在');
      }
      const status = await info();
      if (!status.ready) throw new Error('请先安装本地图片生成模型');
      await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
      await writeFile(requestPath, JSON.stringify({ references, prompt: prompt.trim(), width, height, seed, outputDirectory, operationDirectory: directory, modelPath: path.join(directory, 'model'), calibratorPath: path.join(directory, 'runtime', 'bin', 'muyu-calibrate') }), { mode: 0o600 });
      const result = await run(pythonPath, [workerPath, '--request', requestPath], { signal, onProgress, offline: true });
      if (!result?.assetPath || !result?.rigPath) throw new Error('生成任务没有返回有效图片');
      const managedOutput = await realpath(outputDirectory);
      for (const generated of [result.assetPath, result.rigPath]) {
        if (!path.isAbsolute(generated) || !((await realpath(generated)).startsWith(managedOutput + path.sep)) || !(await stat(generated)).isFile()) throw new Error('生成结果路径无效');
      }
      const { type, ...output } = result;
      return output;
    } finally {
      await rm(requestPath, { force: true }).catch(() => {});
      await Promise.all(references.map((_, index) => rm(path.join(outputDirectory, `reference-${index}.png`), { force: true }).catch(() => {})));
      active = null;
    }
  }
  return { info, setup, generate };
}
