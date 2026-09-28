const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { startLocalEngine } = require('./runtime.cjs');

app.setPath('userData', path.join(app.getPath('appData'), '沐语')); // Preserve the existing profile after rebranding.
app.setName('母狗张容');
protocol.registerSchemesAsPrivileged([
  { scheme: 'muyu', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const hasLock = app.requestSingleInstanceLock();
let mainWindow;
let service;
let engine;
let compact = false;
let petMode = false;
let petRestore;
let petBounds;
let petDrag;
let regularBounds;
let closing = false;
let disposed = false;
let backendOrigin;
let applicationMenu;
let windowTransition = Promise.resolve();

function getState() {
  return {
    isElectron: true,
    compact,
    petMode,
    alwaysOnTop: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop()),
    fullScreen: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()),
  };
}

function publishState() {
  const state = getState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:state-changed', state);
  if (applicationMenu) {
    applicationMenu.getMenuItemById('always-on-top').checked = state.alwaysOnTop;
    applicationMenu.getMenuItemById('always-on-top').enabled = !state.petMode;
    applicationMenu.getMenuItemById('compact').checked = state.compact;
    applicationMenu.getMenuItemById('pet-mode').checked = state.petMode;
  }
  return state;
}

function liveWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('桌面窗口尚未就绪。');
  return mainWindow;
}

function setAlwaysOnTop(enabled) {
  // A pet stays above the desktop; the user's previous pin choice is restored.
  if (petMode) return publishState();
  liveWindow().setAlwaysOnTop(Boolean(enabled), 'floating');
  return publishState();
}

function changeWindow(operation) {
  // Native fullscreen changes are asynchronous. Serialize mode switches so a
  // quick second click cannot replace the bounds that the first one is saving.
  const result = windowTransition.then(operation);
  windowTransition = result.catch(() => {});
  return result;
}

function setIgnoreMouseEvents(enabled) {
  const ignore = petMode && Boolean(enabled);
  liveWindow().setIgnoreMouseEvents(ignore, { forward: true });
  return getState();
}

function validateDragPoint(x, y) {
  if (![x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000000)) {
    throw new Error('桌宠拖动坐标无效。');
  }
}

function beginPetDrag(x, y) {
  validateDragPoint(x, y);
  if (!petMode) return getState();
  const window = liveWindow();
  window.setIgnoreMouseEvents(false);
  petDrag = { x, y, bounds: window.getBounds() };
  return getState();
}

function movePetDrag(x, y) {
  validateDragPoint(x, y);
  if (petMode && petDrag) {
    liveWindow().setPosition(
      Math.round(petDrag.bounds.x + x - petDrag.x),
      Math.round(petDrag.bounds.y + y - petDrag.y),
    );
  }
  return getState();
}

function endPetDrag() {
  petDrag = undefined;
  return getState();
}

function setPetMode(enabled) {
  return changeWindow(() => applyPetMode(Boolean(enabled)));
}

async function applyPetMode(next, restoreFullscreen = true) {
  const window = liveWindow();
  if (next === petMode) return publishState();
  endPetDrag();
  if (next) {
    petRestore = {
      bounds: window.getNormalBounds(),
      compact,
      alwaysOnTop: window.isAlwaysOnTop(),
      fullScreen: window.isFullScreen(),
      maximized: window.isMaximized(),
    };
    await exitFullscreen();
    if (window.isMaximized()) window.unmaximize();
    const { workArea } = screen.getDisplayMatching(petBounds || petRestore.bounds);
    const width = Math.min(petBounds?.width || 360, workArea.width);
    const height = Math.min(petBounds?.height || 520, workArea.height);
    const bounds = {
      width, height,
      x: Math.max(workArea.x, Math.min(petBounds?.x ?? workArea.x + workArea.width - width - 24, workArea.x + workArea.width - width)),
      y: Math.max(workArea.y, Math.min(petBounds?.y ?? workArea.y + workArea.height - height - 16, workArea.y + workArea.height - height)),
    };
    petMode = true;
    compact = false;
    window.setMinimumSize(280, 420);
    window.setFullScreenable(false);
    window.setBackgroundColor('#00000000');
    window.setHasShadow(false);
    if (process.platform === 'darwin') window.setWindowButtonVisibility(false);
    window.setBounds(bounds);
    window.setAlwaysOnTop(true, 'floating');
  } else {
    petBounds = window.getBounds();
    const saved = petRestore;
    petMode = false;
    compact = saved.compact;
    window.setMinimumSize(compact ? 360 : 900, compact ? 480 : 600);
    window.setBackgroundColor('#f4f1ed');
    window.setHasShadow(true);
    window.setFullScreenable(true);
    if (process.platform === 'darwin') window.setWindowButtonVisibility(true);
    window.setBounds(saved.bounds);
    window.setAlwaysOnTop(saved.alwaysOnTop, 'floating');
    if (saved.maximized) window.maximize();
    if (saved.fullScreen && restoreFullscreen) await changeFullscreen(true);
    petRestore = undefined;
  }
  setIgnoreMouseEvents(false);
  window.show();
  return publishState();
}

async function exitFullscreen() {
  const window = liveWindow();
  if (!window.isFullScreen()) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2200);
    window.once('leave-full-screen', () => { clearTimeout(timer); resolve(); });
    window.setFullScreen(false);
  });
}

function setCompact(enabled) {
  return changeWindow(() => applyCompact(Boolean(enabled)));
}

async function applyCompact(enabled) {
  const window = liveWindow();
  if (petMode) await applyPetMode(false, false);
  const next = Boolean(enabled);
  if (next === compact) return publishState();
  await exitFullscreen();
  if (next) {
    regularBounds = window.getNormalBounds();
    if (window.isMaximized()) window.unmaximize();
    const { workArea } = screen.getDisplayMatching(regularBounds);
    const height = Math.min(660, workArea.height);
    const width = Math.min(430, workArea.width);
    window.setMinimumSize(360, 480);
    window.setBounds({ x: workArea.x + workArea.width - width - 24, y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)), width, height });
  } else {
    window.setMinimumSize(900, 600);
    if (regularBounds) window.setBounds(regularBounds);
    else window.setSize(1440, 900);
  }
  compact = next;
  return publishState();
}

function toggleFullscreen() {
  return changeWindow(async () => {
    if (petMode) await applyPetMode(false, false);
    const next = !liveWindow().isFullScreen();
    if (next && compact) await applyCompact(false);
    await changeFullscreen(next);
    return publishState();
  });
}

async function changeFullscreen(next) {
  const window = liveWindow();
  if (window.isFullScreen() === next) return;
  await new Promise((resolve) => {
    const eventName = next ? 'enter-full-screen' : 'leave-full-screen';
    const timer = setTimeout(resolve, 2200);
    window.once(eventName, () => { clearTimeout(timer); resolve(); });
    window.setFullScreen(next);
  });
}

function installMenu() {
  applicationMenu = Menu.buildFromTemplate([
    { label: '母狗张容', submenu: [
      { role: 'about', label: '关于母狗张容' },
      { type: 'separator' },
      { role: 'hide', label: '隐藏母狗张容' },
      { role: 'hideOthers', label: '隐藏其他应用' },
      { role: 'unhide', label: '显示全部' },
      { type: 'separator' },
      { role: 'quit', label: '退出母狗张容' },
    ] },
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
    ] },
    { label: '陪伴', submenu: [
      { id: 'always-on-top', label: '窗口置顶', type: 'checkbox', accelerator: 'CmdOrCtrl+Shift+T', click: (item) => setAlwaysOnTop(item.checked) },
      { id: 'compact', label: '陪伴小窗', type: 'checkbox', accelerator: 'CmdOrCtrl+Shift+M', click: (item) => void setCompact(item.checked) },
      { id: 'pet-mode', label: '桌面小沐', type: 'checkbox', accelerator: 'CmdOrCtrl+Shift+P', click: (item) => void setPetMode(item.checked) },
      { label: '切换全屏', accelerator: 'Ctrl+Command+F', click: () => void toggleFullscreen() },
      { type: 'separator' },
      { role: 'minimize', label: '最小化' },
    ] },
  ]);
  Menu.setApplicationMenu(applicationMenu);
}

function installIPC() {
  const methods = {
    'desktop:get-state': () => getState(),
    'desktop:set-always-on-top': (enabled) => setAlwaysOnTop(enabled),
    'desktop:set-compact': (enabled) => setCompact(enabled),
    'desktop:set-pet-mode': (enabled) => setPetMode(enabled),
    'desktop:set-ignore-mouse-events': (enabled) => setIgnoreMouseEvents(enabled),
    'desktop:begin-pet-drag': (x, y) => beginPetDrag(x, y),
    'desktop:move-pet-drag': (x, y) => movePetDrag(x, y),
    'desktop:end-pet-drag': () => endPetDrag(),
    'desktop:toggle-fullscreen': () => toggleFullscreen(),
    'desktop:minimize': () => { liveWindow().minimize(); return getState(); },
    'desktop:close': () => { setImmediate(() => app.quit()); return getState(); },
  };
  for (const [channel, handler] of Object.entries(methods)) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
        throw new Error('无法访问此桌面操作。');
      }
      return handler(...args);
    });
  }
}

async function startBackend(root) {
  const { startServer } = await import(pathToFileURL(path.join(root, 'server', 'index.mjs')).href);
  try {
    service = await startServer({ port: 4317, host: '127.0.0.1', staticDir: path.join(root, 'dist'), voiceDirectory: path.join(app.getPath('userData'), 'voice-library') });
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    service = await startServer({ port: 0, host: '127.0.0.1', staticDir: path.join(root, 'dist'), voiceDirectory: path.join(app.getPath('userData'), 'voice-library') });
  }
  return `http://127.0.0.1:${service.port}`;
}

function registerAppProtocol() {
  protocol.handle('muyu', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
    try {
      const headers = new Headers(request.headers);
      headers.delete('host');
      if (headers.has('origin')) headers.set('origin', backendOrigin);
      const options = { method: request.method, headers, signal: request.signal, redirect: 'error' };
      if (!['GET', 'HEAD'].includes(request.method)) {
        options.body = Buffer.from(await request.arrayBuffer());
      }
      return await net.fetch(`${backendOrigin}${url.pathname}${url.search}`, options);
    } catch (error) {
      console.error('Local request failed:', error.message);
      return new Response('本地服务暂时不可用，请重新打开母狗张容。', { status: 503 });
    }
  });
}

async function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    title: '母狗张容 · 桌面陪伴',
    width: Math.min(1440, workAreaSize.width),
    height: Math.min(900, workAreaSize.height),
    minWidth: 900,
    minHeight: 600,
    // One transparent-capable window keeps the live chat, requests, media and
    // stable muyu://app storage intact while the UI switches to desktop pet.
    frame: false,
    transparent: true,
    acceptFirstMouse: true,
    backgroundColor: '#f4f1ed',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(true);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('muyu://app/')) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on('did-finish-load', () => setIgnoreMouseEvents(false));
  mainWindow.webContents.on('render-process-gone', () => setIgnoreMouseEvents(false));
  mainWindow.on('blur', endPetDrag);
  mainWindow.on('enter-full-screen', publishState);
  mainWindow.on('leave-full-screen', publishState);
  mainWindow.on('always-on-top-changed', publishState);
  mainWindow.once('ready-to-show', () => { mainWindow.show(); publishState(); });
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL('muyu://app/');
}

async function cleanup() {
  if (disposed) return;
  disposed = true;
  await Promise.allSettled([service?.close?.(), engine?.close?.()]);
}

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      setIgnoreMouseEvents(false);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('before-quit', (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    void cleanup().finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    const root = app.getAppPath();
    if (app.dock && fs.existsSync(path.join(__dirname, 'icon.png'))) app.dock.setIcon(path.join(__dirname, 'icon.png'));
    app.setAboutPanelOptions({ applicationName: '母狗张容 · 桌面陪伴', applicationVersion: app.getVersion(), copyright: '小小的桌面，刚刚好的陪伴。' });
    if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('尚未生成界面文件。请先运行 npm run build。');
    engine = await startLocalEngine(root, { onLog: (line) => console.log(`[沐语] ${line}`) });
    backendOrigin = await startBackend(root);
    registerAppProtocol();
    installIPC();
    installMenu();
    await createWindow();
  }).catch(async (error) => {
    console.error(error);
    dialog.showErrorBox('母狗张容暂时无法启动', error.message);
    await cleanup();
    app.quit();
  });
}
