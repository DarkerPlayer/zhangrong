const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const OLLAMA_URL = 'http://127.0.0.1:11434';

async function isOllamaRunning() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1200) });
    return response.ok && Array.isArray((await response.json()).models);
  } catch {
    return false;
  }
}

async function startLocalEngine(root, { onLog = () => {} } = {}) {
  const runtime = path.join(root, '.runtime', 'ollama');
  const binary = [
    process.env.MUYU_OLLAMA_BINARY,
    path.join(runtime, 'ollama'),
    path.join(runtime, 'bin', 'ollama'),
  ].filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!binary) {
    onLog('本地对话引擎尚未安装，使用应用内的陪伴回复。');
    return { owned: false, close: async () => {} };
  }

  let engine;
  let closing = false;
  let recovery;

  async function ensureRunning() {
    if (closing || await isOllamaRunning() || closing) return;
    // Another owner can leave while this app is open. Take over using our bundled engine.
    if (engine && engine.exitCode === null && engine.signalCode === null) return;
    engine = spawn(binary, ['serve'], {
      cwd: path.dirname(binary),
      env: {
        ...process.env,
        OLLAMA_HOST: '127.0.0.1:11434',
        OLLAMA_MODELS: path.join(root, '.runtime', 'models'),
        OLLAMA_NO_CLOUD: '1',
        OLLAMA_KEEP_ALIVE: '15m',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const child = engine;
    child.stdout.on('data', (buffer) => onLog(buffer.toString().trim()));
    child.stderr.on('data', (buffer) => onLog(buffer.toString().trim()));
    let spawnError;
    child.on('error', (error) => {
      spawnError = error;
      onLog(`本地对话引擎启动失败：${error.message}`);
    });
    for (let attempt = 0; attempt < 48; attempt += 1) {
      if (closing || spawnError || child.exitCode !== null || child.signalCode !== null) break;
      if (await isOllamaRunning()) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  await ensureRunning();
  const monitor = setInterval(() => {
    if (closing || recovery) return;
    recovery = ensureRunning().catch((error) => onLog(`本地引擎恢复失败：${error.message}`)).finally(() => { recovery = null; });
  }, 2000);
  monitor.unref();

  return {
    get owned() { return Boolean(engine?.pid && engine.exitCode === null && engine.signalCode === null); },
    get pid() { return engine?.pid; },
    close: async () => {
      closing = true;
      clearInterval(monitor);
      if (recovery) await recovery;
      if (!engine?.pid || engine.exitCode !== null || engine.signalCode !== null) return;
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          engine.kill('SIGKILL');
          resolve();
        }, 2000);
        timer.unref();
        engine.once('exit', () => { clearTimeout(timer); resolve(); });
        engine.kill('SIGTERM');
      });
    },
  };
}

module.exports = { startLocalEngine, isOllamaRunning };
