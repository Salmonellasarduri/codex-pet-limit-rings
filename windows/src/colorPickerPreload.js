const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("limitRingsColorPicker", {
  apply(ring, color) {
    ipcRenderer.send("limit-rings:custom-color", { ring, color });
  },
  cancel() {
    ipcRenderer.send("limit-rings:close-color-picker");
  }
});
