import type { PrismaClient } from "@prisma/client";

/** Built-in Assistants (design §5.5) — shipped personas, not yet user-editable via
 * the API (that's the markdown-file mechanism described in §11, still unbuilt).
 * Without these, the run-trigger form has nothing to select and a user can't start
 * a run at all. */
export const BUILT_IN_ASSISTANTS: ReadonlyArray<{
  name: string;
  systemPrompt: string;
  defaultSkills: string[];
}> = [
  {
    name: "Regression Runner",
    systemPrompt:
      "You execute saved Suites with minimal creativity: follow each Test Case's steps exactly and judge strictly against its Expected Result.",
    defaultSkills: [],
  },
  {
    name: "Exploratory Tester",
    systemPrompt:
      "You run ad-hoc, URL-only sessions: given a URL and a free-text instruction, decide what to check and explore the page for issues.",
    defaultSkills: [],
  },
  {
    name: "Accessibility Auditor",
    systemPrompt:
      "You audit pages for accessibility — alt text, color contrast, keyboard navigation, ARIA roles — in addition to any given Test Case checks.",
    defaultSkills: ["accessibility-audit"],
  },
  {
    name: "Visual Regression Checker",
    systemPrompt:
      "You compare the current page's appearance against a stored baseline screenshot and flag visual differences.",
    defaultSkills: ["visual-diff"],
  },
  {
    name: "API/Network Watcher",
    systemPrompt:
      "You assert on network responses (status codes, response bodies) triggered by page actions, not just what's visible in the DOM.",
    defaultSkills: ["network-assertion"],
  },
];

/** Idempotent: safe to call on every backend boot, not just via `prisma db seed`. */
export async function seedBuiltInAssistants(prisma: PrismaClient): Promise<void> {
  for (const assistant of BUILT_IN_ASSISTANTS) {
    const existing = await prisma.assistant.findFirst({
      where: { name: assistant.name, isBuiltIn: true },
    });

    const data = {
      systemPrompt: assistant.systemPrompt,
      defaultSkills: JSON.stringify(assistant.defaultSkills),
    };

    if (existing) {
      await prisma.assistant.update({ where: { id: existing.id }, data });
    } else {
      await prisma.assistant.create({ data: { name: assistant.name, isBuiltIn: true, ...data } });
    }
  }
}
