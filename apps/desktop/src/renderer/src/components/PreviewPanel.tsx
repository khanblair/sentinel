import { useState } from "react";
import type { ClientMessage, PreviewFrameMetadata } from "@sentinel/shared";

export interface PreviewFrame {
  dataBase64: string;
  metadata: PreviewFrameMetadata;
}

export interface PreviewPanelProps {
  active: boolean;
  runId: string | null;
  frame: PreviewFrame | null;
  url: string | null;
  actionWarning: string | null;
  send: (message: ClientMessage) => void;
}

const VIEWPORT_PRESETS: Array<{ label: string; width: number; height: number } | { label: string; reset: true }> = [
  { label: "Desktop", width: 1440, height: 900 },
  { label: "Tablet", width: 768, height: 1024 },
  { label: "Mobile", width: 375, height: 667 },
];

/**
 * Live preview (design §5.4): watch-only screencast of whatever browser page is
 * currently executing the active run, docked to the right of the main content and
 * toggled/resized by the parent (App.tsx owns both — see its .preview-dock wrapper).
 * The device/viewport toggle and "open in browser" are real mutations/side effects,
 * so they go through the backend (preview:set-viewport) or the Electron main process
 * (openExternal) rather than being purely a renderer-side concern — see
 * ws/previewController.ts for why the viewport toggle is rejected mid-step.
 */
export function PreviewPanel({ active, runId, frame, url, actionWarning, send }: PreviewPanelProps): JSX.Element {
  const [openingExternal, setOpeningExternal] = useState(false);

  if (!active) {
    return (
      <div className="preview-panel preview-panel-empty">
        <p className="item-subtext">No run is currently executing — start one to see it live here.</p>
      </div>
    );
  }

  function handleSetViewport(width: number, height: number): void {
    if (!runId) return;
    send({ type: "preview:set-viewport", runId, width, height });
  }

  function handleOpenExternal(): void {
    if (!url) return;
    setOpeningExternal(true);
    window.sentinel
      .openExternal(url)
      .catch((err: unknown) => console.error("Failed to open in browser:", err))
      .finally(() => setOpeningExternal(false));
  }

  return (
    <div className="preview-panel">
      <div className="preview-panel-header">
        <div className="preview-panel-toolbar">
          <select
            className="preview-viewport-select"
            aria-label="Preview viewport size"
            defaultValue=""
            onChange={(e) => {
              const preset = VIEWPORT_PRESETS[Number(e.target.value)];
              if (preset && "width" in preset) handleSetViewport(preset.width, preset.height);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Viewport…
            </option>
            {VIEWPORT_PRESETS.map((preset, index) =>
              "width" in preset ? (
                <option key={preset.label} value={index}>
                  {preset.label} ({preset.width}×{preset.height})
                </option>
              ) : null,
            )}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleOpenExternal}
            disabled={!url || openingExternal}
            aria-label="Open current page in your default browser"
            title="Open in browser"
          >
            ↗
          </button>
        </div>
        <span className="preview-url" title={url ?? ""}>
          {url ?? "Connecting…"}
        </span>
        {actionWarning && <span className="preview-action-warning">{actionWarning}</span>}
      </div>
      <div className="preview-frame-wrap">
        {frame ? (
          <img
            className="preview-frame-image"
            src={`data:image/jpeg;base64,${frame.dataBase64}`}
            alt="Live preview of the browser executing this run"
          />
        ) : (
          <p className="item-subtext preview-frame-placeholder">Waiting for the first frame…</p>
        )}
      </div>
    </div>
  );
}
