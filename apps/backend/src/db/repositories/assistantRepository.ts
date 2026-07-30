import type { Assistant, PrismaClient } from "@prisma/client";

export interface AssistantView extends Omit<Assistant, "defaultSkills"> {
  defaultSkills: string[];
}

function toView(assistant: Assistant): AssistantView {
  let defaultSkills: string[];
  try {
    const parsed: unknown = JSON.parse(assistant.defaultSkills);
    defaultSkills = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    defaultSkills = [];
  }
  return { ...assistant, defaultSkills };
}

/**
 * Read-only for now — only the built-in Assistants seeded by seedAssistants.ts
 * exist today. Full custom-Assistant CRUD (the markdown-file mechanism, design
 * §11) is unbuilt; this repository exists so the run-trigger UI has something
 * real to list and select instead of requiring a hand-typed id.
 */
export class AssistantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<AssistantView[]> {
    const rows = await this.prisma.assistant.findMany({ orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }] });
    return rows.map(toView);
  }
}
