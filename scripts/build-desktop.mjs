import { packager } from '@electron/packager';
import { access, rename, rm, readdir, readlink, unlink, symlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const output = path.join(release, '母狗张容.app');

if (process.platform !== 'darwin') throw new Error('请在 macOS 上生成母狗张容桌面应用。');
await access(path.join(root, 'dist', 'index.html')).catch(() => {
  throw new Error('请先运行 npm run build 生成界面。');
});
await access(path.join(root, '.runtime', 'ollama', 'ollama')).catch(() => {
  throw new Error('缺少本地对话引擎 .runtime/ollama/ollama，请先完成运行时下载。');
});
const modelManifests = await readdir(path.join(root, '.runtime', 'models', 'manifests'), { recursive: true, withFileTypes: true }).catch(() => []);
if (!modelManifests.some((entry) => entry.isFile())) {
  throw new Error('本地模型尚未下载完成，请等待模型准备就绪后再打包。');
}

function ignore(file) {
  if (!file) return false;
  const normalized = file.replaceAll('\\', '/');
  const parts = normalized.replace(/^\//, '').split('/');
  const first = parts[0];
  if (first === '.runtime') {
    if (parts.length === 1) return false;
    if (parts[1] === 'voice') {
      if (parts.length === 2) return false;
      return !['python', 'model', 'asr', 'reference.wav', 'profile.json', 'LICENSES.md'].includes(parts[2]) || parts.includes('.cache') || parts.includes('__pycache__');
    }
    return !['ollama', 'models'].includes(parts[1]) || /\.(?:tgz|tar|gz|zip|log|tmp)$/.test(normalized);
  }
  return !['dist', 'server', 'electron', 'package.json'].includes(first);
}

console.log('正在打包母狗张容桌面应用（包含本地模型）…');
const appPaths = await packager({
  dir: root,
  out: release,
  name: '母狗张容',
  executableName: '母狗张容',
  platform: 'darwin',
  arch: process.arch,
  ...(process.env.MUYU_ELECTRON_ZIP_DIR ? { electronZipDir: process.env.MUYU_ELECTRON_ZIP_DIR } : {}),
  asar: false,
  derefSymlinks: false,
  overwrite: true,
  prune: false,
  ignore,
  appBundleId: 'local.muyu.desktop',
  icon: path.join(root, 'electron', 'icon.icns'),
  appCategoryType: 'public.app-category.lifestyle',
  appCopyright: '母狗张容 · 本地桌面陪伴',
  extendInfo: { CFBundleDisplayName: '母狗张容', NSHumanReadableCopyright: '母狗张容 · 本地桌面陪伴' },
});

const packagedDirectory = appPaths[0];
const candidates = await readdir(packagedDirectory);
const bundle = candidates.find((name) => name.endsWith('.app'));
if (!bundle) throw new Error('打包完成但未找到 macOS 应用。');
const packagedApp = path.join(packagedDirectory, bundle);
const packagedRoot = path.join(packagedApp, 'Contents', 'Resources', 'app');
const packagedLinks = [];

// Node's copy operation can expand a preserved relative symlink into an absolute
// source path. Rebase those links before delivery so the bundle can be moved.
async function makeLinksPortable(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await makeLinksPortable(filename);
    } else if (entry.isSymbolicLink()) {
      packagedLinks.push(filename);
      const target = await readlink(filename);
      if (!path.isAbsolute(target)) continue;
      const sourceRelative = path.relative(root, target);
      if (sourceRelative.startsWith(`..${path.sep}`) || sourceRelative === '..' || path.isAbsolute(sourceRelative)) {
        throw new Error(`应用包包含外部文件链接：${filename}`);
      }
      const bundledTarget = path.join(packagedRoot, sourceRelative);
      await access(bundledTarget);
      await unlink(filename);
      await symlink(path.relative(path.dirname(filename), bundledTarget), filename);
    }
  }
}
await makeLinksPortable(packagedRoot);
for (const filename of packagedLinks) {
  const resolved = path.relative(packagedRoot, await realpath(filename));
  if (resolved === '..' || resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved)) {
    throw new Error(`应用包包含外部文件链接：${filename}`);
  }
}
await rm(output, { recursive: true, force: true });
await rename(packagedApp, output);
await rm(packagedDirectory, { recursive: true, force: true });
console.log(`桌面应用已生成：${output}`);
console.log('双击“启动母狗张容.command”或将“母狗张容.app”拖入“应用程序”。');
