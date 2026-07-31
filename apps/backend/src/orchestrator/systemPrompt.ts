/** Persona (who's testing) + standing Rules (constraints the persona must obey),
 * composed once per run and prepended to each call site's own task-specific
 * framing — most general to most specific, so a Rule can flavor behavior but
 * never override the task schema that comes after it. */
export function composePersonaAndRules(personaPrompt: string, ruleTexts: readonly string[]): string {
  const parts = [personaPrompt.trim()];
  if (ruleTexts.length > 0) {
    parts.push(`Rules you must follow:\n${ruleTexts.map((text) => `- ${text}`).join("\n")}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Prepends the composed persona+rules prefix to a call site's task-specific system
 * prompt. Returns `taskPrompt` unchanged when there's no prefix, so existing
 * hardcoded prompts stay identical for ad-hoc paths that don't have an Assistant yet. */
export function withPersonaPrefix(prefix: string | undefined, taskPrompt: string): string {
  return prefix ? `${prefix}\n\n${taskPrompt}` : taskPrompt;
}
