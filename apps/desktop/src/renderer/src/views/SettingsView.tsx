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
      <h2>Settings — AI providers</h2>
      {error && <p role="alert">{error}</p>}

      <ul>
        {configs.map((config) => (
          <li key={config.id}>
            {config.provider} {config.label ? `(${config.label})` : ""}
            <button type="button" onClick={() => void handleDelete(config.id)} aria-label={`Remove ${config.provider}`}>
              Remove
            </button>
          </li>
        ))}
        {configs.length === 0 && <li>No providers configured yet.</li>}
      </ul>

      <form onSubmit={(event) => void handleCreate(event)}>
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
        <button type="submit">Add provider</button>
      </form>
    </section>
  );
}
