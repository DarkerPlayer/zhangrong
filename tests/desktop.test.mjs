import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = fileURLToPath(new URL('../electron/', import.meta.url));
const require = createRequire(import.meta.url);

// Run the real main-process handlers with an OS boundary double. The normal
// node test runner cannot create Electron windows or take over the user's app.
async function desktopHarness() {
  const handlers = new Map();
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.bounds = { x: 80, y: 60, width: options.width, height: options.height };
      this.minimum = [options.minWidth, options.minHeight];
      this.pinned = false;
      this.fullscreen = false;
      this.maximized = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        mainFrame: {}, session: { setPermissionRequestHandler() {} },
        setWindowOpenHandler() {}, send() {},
      });
      windows.push(this);
    }
    isDestroyed() { return false; }
    isAlwaysOnTop() { return this.pinned; }
    setAlwaysOnTop(value) { this.pinned = value; this.emit('always-on-top-changed'); }
    isFullScreen() { return this.fullscreen; }
    setFullScreen(value) { this.fullscreen = value; this.emit(value ? 'enter-full-screen' : 'leave-full-screen'); }
    isMaximized() { return this.maximized; }
    maximize() { this.maximized = true; }
    unmaximize() { this.maximized = false; }
    getNormalBounds() { return { ...this.bounds }; }
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...value }; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
    setMinimumSize(...value) { this.minimum = value; }
    setSize(width, height) { this.bounds = { ...this.bounds, width, height }; }
    setBackgroundColor(value) { this.background = value; }
    setHasShadow(value) { this.shadow = value; }
    setWindowButtonVisibility(value) { this.buttons = value; }
    setFullScreenable(value) { this.fullscreenable = value; }
    setIgnoreMouseEvents(value, options) { this.ignoresMouse = value; this.mouseOptions = options; }
    show() {}
    focus() {}
    async loadURL(url) { this.url = url; }
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, getPath: () => "/tmp/app-support", setPath(name, value) { if(name === "userData") assert.equal(value, "/tmp/app-support/沐语"); }, requestSingleInstanceLock: () => true, whenReady: () => new Promise(() => {}), quit() {} });
  const menu = new Map();
  const electron = {
    app, BrowserWindow: Window, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    Menu: {
      buildFromTemplate(template) {
        for (const entry of template.flatMap((group) => group.submenu)) if (entry.id) menu.set(entry.id, entry);
        return { getMenuItemById: (id) => menu.get(id) };
      },
      setApplicationMenu() {},
    },
    protocol: { registerSchemesAsPrivileged() {} },
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1600, height: 1000 } }),
      getDisplayMatching: () => ({ workArea: { x: 0, y: 24, width: 1600, height: 976 } }),
    },
  };
  const context = vm.createContext({
    require: (name) => name === 'electron' ? electron : name === './runtime.cjs' ? {} : require(name),
    __dirname: desktopDir, console, process, setTimeout, clearTimeout, setImmediate,
  });
  vm.runInContext(readFileSync(path.join(desktopDir, 'main.cjs'), 'utf8'), context);
  await vm.runInContext('createWindow();', context);
  vm.runInContext('installMenu(); installIPC();', context);
  const window = windows[0];
  const invoke = async (channel, value, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }, ...extra) => {
    assert.ok(handlers.has(channel), `Missing desktop operation: ${channel}`);
    return JSON.parse(JSON.stringify(await handlers.get(channel)(event, value, ...extra)));
  };
  return { window, windows, menu, invoke };
}

test('desktop pet roundtrip preserves compact bounds and original pin state without replacing the renderer', async () => {
  const { window, windows, menu, invoke } = await desktopHarness();
  const regularBounds = window.getBounds();
  await invoke('desktop:set-compact', true);
  const compactBounds = window.getBounds();
  const pet = await invoke('desktop:set-pet-mode', true);
  assert.equal(pet.petMode, true);
  assert.equal(pet.compact, false);
  assert.equal(pet.alwaysOnTop, true);
  assert.equal(window.options.transparent, true);
  assert.equal(window.options.frame, false);
  assert.equal(window.background, '#00000000');
  assert.equal(window.shadow, false);
  assert.equal(window.bounds.width, 360);
  assert.equal(window.bounds.height, 520);
  assert.equal(menu.get('pet-mode').checked, true);
  const restored = await invoke('desktop:set-pet-mode', false);
  assert.equal(restored.petMode, false);
  assert.equal(restored.compact, true);
  assert.equal(restored.alwaysOnTop, false);
  assert.deepEqual(window.getBounds(), compactBounds);
  await invoke('desktop:set-compact', false);
  assert.deepEqual(window.getBounds(), regularBounds);
  assert.equal(windows.length, 1);
  assert.equal(window.url, 'muyu://app/');
});

test('rapid desktop pet toggles restore fullscreen, bounds, and pinning in request order', async () => {
  const { window, invoke } = await desktopHarness();
  const regularBounds = window.getBounds();
  await invoke('desktop:set-always-on-top', true);
  await invoke('desktop:toggle-fullscreen');
  await Promise.all([invoke('desktop:set-pet-mode', true), invoke('desktop:set-pet-mode', false)]);
  const state = await invoke('desktop:get-state');
  assert.equal(state.petMode, false);
  assert.equal(state.fullScreen, true);
  assert.equal(state.alwaysOnTop, true);
  assert.deepEqual(window.getBounds(), regularBounds);
});

test('click-through is limited to desktop pet mode and resets when returning to the app', async () => {
  const { window, invoke } = await desktopHarness();
  await invoke('desktop:set-ignore-mouse-events', true);
  assert.equal(window.ignoresMouse, false);
  await invoke('desktop:set-pet-mode', true);
  await invoke('desktop:set-ignore-mouse-events', true);
  assert.equal(window.ignoresMouse, true);
  assert.equal(window.mouseOptions.forward, true);
  await invoke('desktop:set-pet-mode', false);
  assert.equal(window.ignoresMouse, false);
});

test('desktop pet IPC rejects other renderer frames', async () => {
  const { window, invoke } = await desktopHarness();
  await assert.rejects(invoke('desktop:set-pet-mode', true, { sender: window.webContents, senderFrame: {} }), /无法访问/);
  assert.equal((await invoke('desktop:get-state')).petMode, false);
});

test('explicit pet dragging follows screen deltas and stops on release, blur, and mode exit', async () => {
  const { window, invoke } = await desktopHarness();
  const drag = (channel, x, y) => invoke(channel, x, undefined, y);
  const regular = window.getBounds();
  await drag('desktop:begin-pet-drag', 100, 200);
  await drag('desktop:move-pet-drag', 130, 250);
  assert.deepEqual(window.getBounds(), regular);
  await invoke('desktop:set-pet-mode', true);
  const start = window.getBounds();
  await drag('desktop:begin-pet-drag', 100, 200);
  await drag('desktop:move-pet-drag', 130, 250);
  assert.deepEqual(window.getBounds(), { ...start, x: start.x + 30, y: start.y + 50 });
  await drag('desktop:move-pet-drag', 80, 190);
  assert.deepEqual(window.getBounds(), { ...start, x: start.x - 20, y: start.y - 10 });
  await invoke('desktop:end-pet-drag');
  const released = window.getBounds();
  await drag('desktop:move-pet-drag', 400, 500);
  assert.deepEqual(window.getBounds(), released);
  await drag('desktop:begin-pet-drag', 100, 200);
  window.emit('blur');
  await drag('desktop:move-pet-drag', 400, 500);
  assert.deepEqual(window.getBounds(), released);
  await drag('desktop:begin-pet-drag', 100, 200);
  await invoke('desktop:set-pet-mode', false);
  await drag('desktop:move-pet-drag', 400, 500);
  assert.deepEqual(window.getBounds(), regular);
});

test('pet drag operations reject invalid coordinates and foreign frames', async () => {
  const { window, invoke } = await desktopHarness();
  await invoke('desktop:set-pet-mode', true);
  const start = window.getBounds();
  await assert.rejects(invoke('desktop:begin-pet-drag', NaN, undefined, 20), /拖动坐标/);
  await assert.rejects(invoke('desktop:begin-pet-drag', 10, undefined, Infinity), /拖动坐标/);
  await assert.rejects(invoke('desktop:move-pet-drag', '10', undefined, 20), /拖动坐标/);
  await assert.rejects(invoke('desktop:begin-pet-drag', 10, {sender:window.webContents,senderFrame:{}}, 20), /无法访问/);
  assert.deepEqual(window.getBounds(), start);
});
