import type { PreviewFrameMetadata } from "@sentinel/shared";

export interface PreviewFrame {
  dataBase64: string;
  metadata: PreviewFrameMetadata;
}

export interface PreviewPanelProps {
  active: boolean;
  frame: PreviewFrame | null;
  url: string | null;
}

/**
 * Live preview (design §5.4): watch-only screencast of whatever browser page is
 * currently executing the active run, docked to the right of the main content and
 * toggled/resized by the parent (App.tsx owns both — see its .preview-dock wrapper).
 * Deliberately just the frame + a status line in this first pass; the toolbar
 * (open-in-browser, viewport toggle, select-element) lands in later, separate passes.
 */
export function PreviewPanel({ active, frame, url }: PreviewPanelProps): JSX.Element {
  if (!active) {
    return (
      <div className="preview-panel preview-panel-empty">
        <p className="item-subtext">No run is currently executing — start one to see it live here.</p>
      </div>
    );
  }

  return (
    <div className="preview-panel">
      <div className="preview-panel-header">
        <span className="preview-url" title={url ?? ""}>
          {url ?? "Connecting…"}
        </span>
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
