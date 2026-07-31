export interface OnboardingModalProps {
  onGoToSettings: () => void;
  onDismiss: () => void;
}

/** Shown once on first launch (design §4.1: "Add at least one provider API key in
 * Settings. Optionally set Global Rules and review the built-in Assistants/Skills
 * before doing anything else."). Dismissal is tracked in localStorage by the caller. */
export function OnboardingModal({ onGoToSettings, onDismiss }: OnboardingModalProps): JSX.Element {
  return (
    <div className="command-palette-backdrop" onClick={onDismiss}>
      <div className="onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-brand-mark" />
        <h2>Welcome to Sentinel</h2>
        <p>Before your first run, a few things are worth setting up:</p>
        <ol className="onboarding-steps">
          <li>Add at least one AI provider API key in Settings.</li>
          <li>Optionally set Global Rules — standing instructions applied to every session.</li>
          <li>Review the built-in Assistants and Skills so you know what's already available.</li>
        </ol>
        <div className="field-row">
          <button type="button" className="btn btn-primary" onClick={onGoToSettings}>
            Go to Settings
          </button>
          <button type="button" className="btn" onClick={onDismiss}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
