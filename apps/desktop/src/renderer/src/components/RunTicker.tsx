import { useState } from "react";
import type { Run, StepLog } from "@sentinel/shared";

export interface PendingPrompt {
  runId: string;
  requestId: string;
  prompt: string;
}

export interface RunTickerProps {
  run: Run | null;
  steps: StepLog[];
  pendingPrompt: PendingPrompt | null;
  onAnswerPrompt: (requestId: string, value: string | null) => void;
}

const VERDICT_LABEL: Record<StepLog["verdict"], string> = {
  pass: "✓ pass",
  fail: "✗ fail",
  blocked: "⏸ blocked",
};

/** The live step-by-step ticker (design §4.3): shows Run status and each StepLog as
 * it arrives over WebSocket, plus a pause-and-ask card whenever the run needs a
 * tester's answer (request_input/request_tester_action, routed through the
 * WsPromptBroker on the backend). */
export function RunTicker({ run, steps, pendingPrompt, onAnswerPrompt }: RunTickerProps): JSX.Element | null {
  const [answer, setAnswer] = useState("");

  if (!run) {
    return null;
  }

  return (
    <div>
      <h3>
        Run {run.id.slice(0, 8)} — <strong>{run.status}</strong>
      </h3>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <span>{VERDICT_LABEL[step.verdict]}</span> {step.observation}
            {step.verdict !== "pass" && (
              <div>
                <em>{step.confidenceReason}</em> (confidence {Math.round(step.confidence * 100)}%)
              </div>
            )}
          </li>
        ))}
      </ol>

      {pendingPrompt && pendingPrompt.runId === run.id && (
        <div role="alert">
          <p>{pendingPrompt.prompt}</p>
          <input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            aria-label="Answer for the running test"
            placeholder="Type your answer…"
          />
          <button
            type="button"
            onClick={() => {
              onAnswerPrompt(pendingPrompt.requestId, answer || null);
              setAnswer("");
            }}
          >
            Submit
          </button>
          <button type="button" onClick={() => onAnswerPrompt(pendingPrompt.requestId, null)}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
