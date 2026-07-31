export interface SentinelApi {
  getBackendUrl: () => string;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    sentinel: SentinelApi;
  }

  const __APP_VERSION__: string;
}

export {};
