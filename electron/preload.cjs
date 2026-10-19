const { contextBridge, ipcRenderer } = require('electron');
const methods = ['bootstrap','createProject','openProject','saveProject','importAssets','saveSettings','pickTool','openMuse','museCheck','museReport','museStart','museHistory','removeAccount','addAccount','generateText','exportPrompts','exportSrt','startRender','startUpscale','cancelJob','showProject','openExternal'];
const api = Object.fromEntries(methods.map(name => [name, (...args) => ipcRenderer.invoke(`studio:${name}`, ...args)]));
api.onJob = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('studio:job', listener); return () => ipcRenderer.removeListener('studio:job',listener); };
api.onMuse = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('studio:muse',listener); return () => ipcRenderer.removeListener('studio:muse',listener); };
contextBridge.exposeInMainWorld('studio', api);
