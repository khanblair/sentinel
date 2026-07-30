import { useEffect, useState } from "react";
import type { Provider } from "@sentinel/shared";
import { api, type ProviderConfigSummary } from "../api/client";

const PROVIDERS: Provider[] = ["claude", "deepseek", "gemini", "openai", "openrouter"];

export function SettingsView(): JSX.Element {
  const [configs, setConfigs] = useState<ProviderConfigSummary[]>([]);
  const [provider, setProvider] = useState<Provider>("claude");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      setConfigs(await api.providerConfigs.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setError(null);
    try {
      await api.providerConfigs.create({ provider, apiKey, label: label || null });
      setApiKey("");
      setLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(null);
    try {
      await api.providerConfigs.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <h2>Settings</h2>
      <p>AI providers</p>
      {error && <p role="alert">{error}</p>}

      <ul className="item-list">
        {configs.map((config) => (
          <li key={config.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">{config.provider}</span>
              {config.label && <span className="item-subtext">{config.label}</span>}
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void handleDelete(config.id)}
              aria-label={`Remove ${config.provider}`}
            >
              Remove
            </button>
          </li>
        ))}
        {configs.length === 0 && <li className="empty-state">No providers configured yet.</li>}
      </ul>

      <h3>Add provider</h3>
      <form className="field-row" onSubmit={(event) => void handleCreate(event)}>
        <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} aria-label="Provider">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          aria-label="API key"
        />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Label" />
        <button type="submit" className="btn btn-primary">
          Add provider
        </button>
      </form>
    </section>
  );
}
