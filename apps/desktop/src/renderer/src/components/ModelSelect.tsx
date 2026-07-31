import { useEffect, useState } from "react";
import type { ModelInfo } from "@sentinel/shared";
import { api } from "../api/client";

export interface ModelSelectProps {
  providerConfigId: string;
  value: string;
  onChange: (model: string) => void;
}

const CUSTOM_VALUE = "__custom__";

function formatModelLabel(model: ModelInfo): string {
  const name = model.label && model.label !== model.id ? `${model.label} (${model.id})` : model.id;
  const extras: string[] = [];
  if (model.contextWindow) extras.push(`${Math.round(model.contextWindow / 1000)}k ctx`);
  if (model.supportsTools === false) extras.push("no tool support");
  return extras.length > 0 ? `${name} — ${extras.join(", ")}` : name;
}

/**
 * Model picker backed by the provider's own live model list (never a hardcoded one —
 * see backend/src/providers/listModels.ts). Always falls back to a plain text input:
 * if there's no provider selected yet, the list is still loading, or the live fetch
 * failed, the user can still type a model id manually rather than being blocked.
 */
export function ModelSelect({ providerConfigId, value, onChange }: ModelSelectProps): JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    setModels([]);
    setError(null);
    setCustomMode(false);
    if (!providerConfigId) return;
    let cancelled = false;
    setLoading(true);
    api.providerConfigs
      .listModels(providerConfigId)
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerConfigId]);

  if (!providerConfigId) {
    return <input value="" disabled placeholder="Select a provider first" aria-label="Model" />;
  }
  if (loading) {
    return <input value="" disabled placeholder="Loading models…" aria-label="Model" />;
  }
  if (error || models.length === 0 || customMode) {
    return (
      <div className="field-stack-inline">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Model" aria-label="Model" />
        {error && (
          <span className="item-subtext">Couldn't load the model list ({error}) — type the model id manually.</span>
        )}
        {!error && models.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setCustomMode(false)}>
            Choose from list
          </button>
        )}
      </div>
    );
  }

  const selectedModel = models.find((m) => m.id === value);
  const hasUnknownValue = Boolean(value) && !selectedModel;

  return (
    <div className="field-stack-inline">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_VALUE) {
            setCustomMode(true);
            return;
          }
          onChange(e.target.value);
        }}
        aria-label="Model"
      >
        <option value="" disabled>
          Select a model…
        </option>
        {hasUnknownValue && <option value={value}>{value} (custom)</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {formatModelLabel(m)}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Other (type manually)…</option>
      </select>
      {selectedModel?.description && <span className="item-subtext">{selectedModel.description}</span>}
    </div>
  );
}
