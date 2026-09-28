import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, access, open as openFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
const stateFile = path.join(runtime, 'desktop-server.json');
const logFile = path.join(runtime, 'desktop-server.log');
const scriptFile = fileURLToPath(import.meta.url);
const noOpen = process.argv.includes('--no-open');
const require = createRequire(import.meta.url);
const { startLocalEngine } = require('../electron/runtime.cjs');

async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    return response.ok && body.app === 'muyu-local';
  } catch {
    return false;
  }
}

async function readState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch { return null; }
}

async function showApp(port) {
  const url = `http://127.0.0.1:${port}`;
  if (!noOpen) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    await execFileAsync(command, [url]);
  }
  console.log(`沐语已就绪：${url}`);
  console.log('关闭本地服务：npm run stop');
}

async function serve() {
  const { startServer } = await import('../server/index.mjs');
  let engine;
  let service;
  let stopping = false;
  async function close(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([service?.close?.(), engine?.close?.()]);
    const state = await readState();
    if (state?.pid === process.pid) await unlink(stateFile).catch(() => {});
    process.exit(exitCode);
  }
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  try {
    engine = await startLocalEngine(root, { onLog: (line) => console.log(line) });
    try {
      service = await startServer({ port: 4317, host: '127.0.0.1', staticDir: path.join(root, 'dist') });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (await health(4317)) {
        await engine?.close?.();
        process.exit(0);
      }
      service = await startServer({ port: 0, host: '127.0.0.1', staticDir: path.join(root, 'dist') });
    }
    await writeFile(stateFile, JSON.stringify({ pid: process.pid, port: service.port, startedAt: new Date().toISOString(), script: scriptFile }, null, 2), { mode: 0o600 });
    console.log(`沐语本地服务 http://127.0.0.1:${service.port}`);
  } catch (error) {
    console.error(error);
    await close(1);
  }
}

async function launch() {
  await access(path.join(root, 'dist', 'index.html'), constants.R_OK).catch(() => {
    throw new Error('尚未生成界面文件。请在此文件夹运行 npm install 和 npm run build。');
  });
  await mkdir(runtime, { recursive: true });
  const state = await readState();
  if (Number.isInteger(state?.port) && await health(state.port)) return showApp(state.port);
  if (await health(4317)) return showApp(4317);
  const output = await openFile(logFile, 'a', 0o600);
  let childError;
  const child = spawn(process.execPath, [scriptFile, '--serve'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', output.fd, output.fd],
    env: process.env,
  });
  child.on('error', (error) => { childError = error; });
  child.unref();
  await output.close();
  console.log('正在唤醒沐语的本地对话引擎…');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (childError) throw childError;
    const next = await readState();
    if (Number.isInteger(next?.port) && await health(next.port)) return showApp(next.port);
    if (await health(4317)) return showApp(4317);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`启动未完成。请查看日志：${logFile}`);
}

try {
  if (process.argv.includes('--serve')) await serve();
  else await launch();
} catch (error) {
  console.error(`沐语：${error.message}`);
  process.exitCode = 1;
}
