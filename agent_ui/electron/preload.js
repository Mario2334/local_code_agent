const { contextBridge } = require('electron');

// Expose a minimal API to the renderer if needed later.
contextBridge.exposeInMainWorld('electronAPI', {
  // Placeholder for future native integrations.
});
