const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("limitRings", {
  onSnapshot(callback) {
    ipcRenderer.on("limit-rings:snapshot", (_event, snapshot) => callback(snapshot));
  }
});
