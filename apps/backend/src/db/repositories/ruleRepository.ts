import type { PrismaClient, Rule } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export type RuleScope = "global" | "project";

export interface CreateRuleInput {
  scope: RuleScope;
  projectId?: string | null;
  text: string;
}

/** Standing instructions folded into the system prompt underneath whichever
 * Assistant is active (design §5.7) — Global Rules apply everywhere, Project
 * Rules only within their project. */
export class RuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRuleInput): Promise<Rule> {
    if (!input.text.trim()) {
      throw new ValidationError("Rule text is required");
    }
    if (input.scope === "project") {
      if (!input.projectId) {
        throw new ValidationError("A project-scoped rule requires a projectId");
      }
      const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
      if (!project) {
        throw new NotFoundError(`Project ${input.projectId} not found`);
      }
    } else if (input.projectId) {
      throw new ValidationError("A global rule must not have a projectId");
    }

    return this.prisma.rule.create({
      data: { scope: input.scope, projectId: input.projectId ?? null, text: input.text.trim() },
    });
  }

  async listGlobal(): Promise<Rule[]> {
    return this.prisma.rule.findMany({
      where: { scope: "global" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async listByProject(projectId: string): Promise<Rule[]> {
    return this.prisma.rule.findMany({
      where: { scope: "project", projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async delete(id: string): Promise<void> {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundError(`Rule ${id} not found`);
    }
    await this.prisma.rule.delete({ where: { id } });
  }
}
