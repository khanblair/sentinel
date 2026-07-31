import type { Run } from "@sentinel/shared";

/** Electron's renderer is Chromium, so the Web Notifications API already shows real
 * OS notifications — no main-process IPC needed. Guarded everywhere since the API
 * is absent in non-Electron contexts (e.g. a future web build). */
export function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

const STATUS_LABEL: Partial<Record<Run["status"], string>> = {
  passed: "passed",
  failed: "failed",
  blocked: "blocked",
};

/** Only called for a run:update that just transitioned out of "running" — see
 * App.tsx's handleMessage. Skipped while the window is focused, since the live
 * ticker already shows the same information on screen. */
export function notifyRunFinished(run: Run): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const label = STATUS_LABEL[run.status];
  if (!label) return;
  new Notification(`Run ${label}`, {
    body: `Run ${run.id.slice(0, 8)} finished: ${label}`,
  });
}
