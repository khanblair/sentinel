export interface SentinelApi {
  getBackendUrl: () => string;
}

declare global {
  interface Window {
    sentinel: SentinelApi;
  }

  const __APP_VERSION__: string;
}

export {};
