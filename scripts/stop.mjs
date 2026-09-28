import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateFile = path.join(root, '.runtime', 'desktop-server.json');
const execFileAsync = promisify(execFile);

try {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  if (!Number.isInteger(state.pid) || state.pid <= 1) throw new Error('本地服务记录无效。');
  let command;
  try {
    ({ stdout: command } = await execFileAsync('ps', ['-p', String(state.pid), '-o', 'command=']));
  } catch {
    await unlink(stateFile).catch(() => {});
    console.log('沐语本地服务已停止。');
    process.exit(0);
  }
  const expectedScript = path.join(root, 'scripts', 'launch.mjs');
  if (!command.includes(expectedScript) || !command.includes('--serve')) {
    await unlink(stateFile).catch(() => {});
    console.log('沐语的服务已结束；没有关闭其他应用。');
    process.exit(0);
  }
  process.kill(state.pid, 'SIGTERM');
  console.log('正在关闭沐语本地服务与它启动的对话引擎。');
} catch (error) {
  if (error.code === 'ENOENT') console.log('没有由启动脚本运行的沐语服务。桌面版请在应用菜单中退出。');
  else { console.error(error.message); process.exitCode = 1; }
}
