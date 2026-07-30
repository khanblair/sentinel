export interface SentinelApi {
  getBackendUrl: () => string;
}

declare global {
  interface Window {
    sentinel: SentinelApi;
  }
}

export {};
