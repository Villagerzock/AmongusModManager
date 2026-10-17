const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('manager', Object.freeze({
  load: () => ipcRenderer.invoke('state:load'),
  save: state => ipcRenderer.invoke('state:save', state),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  prepare: id => ipcRenderer.invoke('profile:prepare', id),
  launch: id => ipcRenderer.invoke('profile:launch', id),
  openFolder: id => ipcRenderer.invoke('profile:open', id),
  modCatalog: () => ipcRenderer.invoke('mods:catalog'),
  modStatus: id => ipcRenderer.invoke('mods:status', id),
  modPlan: (id,modId,version) => ipcRenderer.invoke('mods:plan', id,modId,version),
  installMods: (id,planId) => ipcRenderer.invoke('mods:install', id,planId),
  onModProgress: callback => {
    const listener = (_event,message) => callback(message);
    ipcRenderer.on('mods:progress',listener);
    return () => ipcRenderer.removeListener('mods:progress',listener);
  }
}));
