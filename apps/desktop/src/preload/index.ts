import { contextBridge, ipcRenderer } from "electron";

const backendUrl = process.env.SENTINEL_BACKEND_URL ?? "http://127.0.0.1:4317";

const sentinelApi = {
  getBackendUrl: (): string => backendUrl,
  /** Live preview's "open in browser" — the main process validates the URL is
   * http(s) before ever calling shell.openExternal. */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("preview:open-external", url),
};

contextBridge.exposeInMainWorld("sentinel", sentinelApi);

export type SentinelApi = typeof sentinelApi;
