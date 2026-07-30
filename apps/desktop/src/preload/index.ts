import { contextBridge } from "electron";

const backendUrl = process.env.SENTINEL_BACKEND_URL ?? "http://127.0.0.1:4317";

const sentinelApi = {
  getBackendUrl: (): string => backendUrl,
};

contextBridge.exposeInMainWorld("sentinel", sentinelApi);

export type SentinelApi = typeof sentinelApi;
