import { useState } from "react";
import type { ClientMessage, ElementSummary, PreviewFrameMetadata } from "@sentinel/shared";

export interface PreviewFrame {
  dataBase64: string;
  metadata: PreviewFrameMetadata;
}

export interface SelectedElementResult {
  element: ElementSummary | null;
  reason?: string;
}

export interface PreviewPanelProps {
  active: boolean;
  runId: string | null;
  frame: PreviewFrame | null;
  url: string | null;
  actionWarning: string | null;
  selectedElement: SelectedElementResult | null;
  onClearSelectedElement: () => void;
  send: (message: ClientMessage) => void;
}

const VIEWPORT_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: "Desktop", width: 1440, height: 900 },
  { label: "Tablet", width: 768, height: 1024 },
  { label: "Mobile", width: 375, height: 667 },
];

/**
 * Live preview (design §5.4): watch-only screencast of whatever browser page is
 * currently executing the active run, docked to the right of the main content and
 * toggled/resized by the parent (App.tsx owns both — see its .preview-dock wrapper).
 * The device/viewport toggle, select-element, and "open in browser" are real
 * mutations/side effects, so they go through the backend (preview:set-viewport,
 * preview:select-element) or the Electron main process (openExternal) rather than
 * being purely a renderer-side concern — see ws/previewController.ts for why the
 * mutating ones are rejected mid-step.
 */
export function PreviewPanel({
  active,
  runId,
  frame,
  url,
  actionWarning,
  selectedElement,
  onClearSelectedElement,
  send,
}: PreviewPanelProps): JSX.Element {
  const [openingExternal, setOpeningExternal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

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

  function handleFrameClick(event: React.MouseEvent<HTMLImageElement>): void {
    if (!selectMode || !runId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    send({ type: "preview:select-element", runId, ratioX, ratioY });
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
              if (preset) handleSetViewport(preset.width, preset.height);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Viewport…
            </option>
            {VIEWPORT_PRESETS.map((preset, index) => (
              <option key={preset.label} value={index}>
                {preset.label} ({preset.width}×{preset.height})
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`btn btn-sm${selectMode ? " active" : ""}`}
            onClick={() => {
              setSelectMode((prev) => !prev);
              onClearSelectedElement();
            }}
            aria-label={selectMode ? "Stop selecting elements" : "Select an element"}
            aria-pressed={selectMode}
            title="Select element"
          >
            ⛶
          </button>
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
            className={`preview-frame-image${selectMode ? " preview-frame-image-selectable" : ""}`}
            src={`data:image/jpeg;base64,${frame.dataBase64}`}
            alt="Live preview of the browser executing this run"
            onClick={handleFrameClick}
          />
        ) : (
          <p className="item-subtext preview-frame-placeholder">Waiting for the first frame…</p>
        )}
      </div>
      {selectMode && (
        <div className="preview-selected-element">
          {!selectedElement && <span className="item-subtext">Click anywhere on the preview to inspect it.</span>}
          {selectedElement?.reason && <span className="item-subtext">{selectedElement.reason}</span>}
          {selectedElement?.element && (
            <dl className="preview-element-summary">
              <dt>Tag / role</dt>
              <dd>{selectedElement.element.role}</dd>
              {selectedElement.element.text && (
                <>
                  <dt>Text</dt>
                  <dd>{selectedElement.element.text}</dd>
                </>
              )}
              {selectedElement.element.ariaLabel && (
                <>
                  <dt>Aria label</dt>
                  <dd>{selectedElement.element.ariaLabel}</dd>
                </>
              )}
              <dt>Selector</dt>
              <dd>
                <code>{selectedElement.element.selector}</code>
              </dd>
            </dl>
          )}
          {selectedElement && !selectedElement.element && !selectedElement.reason && (
            <span className="item-subtext">No element found at that point.</span>
          )}
        </div>
      )}
    </div>
  );
}
