import { useEffect, useState } from "react";
import type { Provider, Rule, Skill } from "@sentinel/shared";
import { api, type ProviderConfigSummary } from "../api/client";

const PROVIDERS: Provider[] = ["claude", "deepseek", "gemini", "openai", "openrouter"];

type TestResult = { ok: boolean; message: string } | { pending: true };

export function SettingsView(): JSX.Element {
  const [configs, setConfigs] = useState<ProviderConfigSummary[]>([]);
  const [provider, setProvider] = useState<Provider>("claude");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleText, setRuleText] = useState("");

  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillName, setSkillName] = useState("");
  const [skillDefinition, setSkillDefinition] = useState("");

  async function refresh(): Promise<void> {
    try {
      const [providerConfigs, globalRules, allSkills] = await Promise.all([
        api.providerConfigs.list(),
        api.rules.listGlobal(),
        api.skills.list(),
      ]);
      setConfigs(providerConfigs);
      setRules(globalRules);
      setSkills(allSkills);
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

  async function handleTest(id: string): Promise<void> {
    setTestResults((prev) => ({ ...prev, [id]: { pending: true } }));
    try {
      const result = await api.providerConfigs.test(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function handleAddRule(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!ruleText.trim()) return;
    setError(null);
    try {
      await api.rules.create({ scope: "global", text: ruleText });
      setRuleText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteRule(id: string): Promise<void> {
    try {
      await api.rules.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddSkill(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!skillName.trim() || !skillDefinition.trim()) return;
    setError(null);
    try {
      await api.skills.create({ name: skillName, definition: skillDefinition });
      setSkillName("");
      setSkillDefinition("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteSkill(id: string): Promise<void> {
    try {
      await api.skills.remove(id);
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
        {configs.map((config) => {
          const result = testResults[config.id];
          return (
            <li key={config.id} className="item-row">
              <div className="item-row-main">
                <span className="item-title-btn item-title-static">{config.provider}</span>
                {config.label && <span className="item-subtext">{config.label}</span>}
                {result && !("pending" in result) && (
                  <span className={result.ok ? "item-subtext test-result-ok" : "item-subtext test-result-fail"}>
                    {result.message}
                  </span>
                )}
              </div>
              <div className="field-row">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handleTest(config.id)}
                  disabled={result !== undefined && "pending" in result}
                  aria-label={`Test ${config.provider} connection`}
                >
                  {result !== undefined && "pending" in result ? "Testing…" : "Test connection"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void handleDelete(config.id)}
                  aria-label={`Remove ${config.provider}`}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
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

      <h3>Global rules</h3>
      <p className="item-subtext">Standing instructions applied to every session, regardless of project.</p>
      <ul className="item-list">
        {rules.map((rule) => (
          <li key={rule.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">{rule.text}</span>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void handleDeleteRule(rule.id)}
              aria-label={`Remove rule: ${rule.text}`}
            >
              Remove
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="empty-state">No global rules yet.</li>}
      </ul>
      <form className="field-row" onSubmit={(event) => void handleAddRule(event)}>
        <input
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          placeholder="e.g. Never submit real payment forms"
          aria-label="New global rule"
        />
        <button type="submit" className="btn btn-primary">
          Add rule
        </button>
      </form>

      <h3>Skills</h3>
      <p className="item-subtext">Toggleable capability packs an Assistant can enable by default.</p>
      <ul className="item-list">
        {skills.map((skill) => (
          <li key={skill.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">
                {skill.name} {skill.isBuiltIn && <span className="badge badge-neutral">built-in</span>}
              </span>
              <span className="item-subtext">{skill.definition}</span>
            </div>
            {!skill.isBuiltIn && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void handleDeleteSkill(skill.id)}
                aria-label={`Remove skill ${skill.name}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {skills.length === 0 && <li className="empty-state">No skills yet.</li>}
      </ul>
      <form className="field-stack" onSubmit={(event) => void handleAddSkill(event)}>
        <input
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          placeholder="Skill name"
          aria-label="New skill name"
        />
        <textarea
          value={skillDefinition}
          onChange={(e) => setSkillDefinition(e.target.value)}
          placeholder="What this skill checks for"
          aria-label="New skill definition"
        />
        <button type="submit" className="btn btn-primary">
          Add skill
        </button>
      </form>
    </section>
  );
}
