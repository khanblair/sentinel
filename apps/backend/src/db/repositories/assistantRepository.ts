import type { Assistant, PrismaClient } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface AssistantView extends Omit<Assistant, "defaultSkills"> {
  defaultSkills: string[];
}

export interface CreateAssistantInput {
  name: string;
  systemPrompt: string;
  defaultSkills?: string[];
  projectId?: string | null;
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
 * The 5 seeded built-ins (seedAssistants.ts) are immutable through this API —
 * only custom Assistants can be created or deleted here. The markdown-file
 * import mechanism described in design §11 is a separate, unbuilt path.
 */
export class AssistantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<AssistantView[]> {
    const rows = await this.prisma.assistant.findMany({ orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }] });
    return rows.map(toView);
  }

  async create(input: CreateAssistantInput): Promise<AssistantView> {
    if (!input.name.trim()) {
      throw new ValidationError("Assistant name is required");
    }
    if (!input.systemPrompt.trim()) {
      throw new ValidationError("Assistant system prompt is required");
    }
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) {
        throw new NotFoundError(`Project ${input.projectId} not found`);
      }
    }
    const created = await this.prisma.assistant.create({
      data: {
        name: input.name.trim(),
        systemPrompt: input.systemPrompt.trim(),
        defaultSkills: JSON.stringify(input.defaultSkills ?? []),
        projectId: input.projectId ?? null,
        isBuiltIn: false,
      },
    });
    return toView(created);
  }

  async delete(id: string): Promise<void> {
    const assistant = await this.prisma.assistant.findUnique({ where: { id } });
    if (!assistant) {
      throw new NotFoundError(`Assistant ${id} not found`);
    }
    if (assistant.isBuiltIn) {
      throw new ValidationError(`"${assistant.name}" is a built-in assistant and cannot be deleted`);
    }
    await this.prisma.assistant.delete({ where: { id } });
  }
}
