const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('desktop:set-always-on-top', Boolean(enabled)),
  setCompact: (enabled) => ipcRenderer.invoke('desktop:set-compact', Boolean(enabled)),
  setPetMode: (enabled) => ipcRenderer.invoke('desktop:set-pet-mode', Boolean(enabled)),
  setIgnoreMouseEvents: (enabled) => ipcRenderer.invoke('desktop:set-ignore-mouse-events', Boolean(enabled)),
  beginPetDrag: (screenX, screenY) => ipcRenderer.invoke('desktop:begin-pet-drag', screenX, screenY),
  movePetDrag: (screenX, screenY) => ipcRenderer.invoke('desktop:move-pet-drag', screenX, screenY),
  endPetDrag: () => ipcRenderer.invoke('desktop:end-pet-drag'),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  close: () => ipcRenderer.invoke('desktop:close'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  onStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:state-changed', listener);
    return () => ipcRenderer.removeListener('desktop:state-changed', listener);
  },
});
