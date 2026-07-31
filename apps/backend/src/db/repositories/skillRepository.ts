import type { PrismaClient, Skill } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface CreateSkillInput {
  name: string;
  definition: string;
}

/** Toggleable capability packs (design §5.6) referenced by name from
 * Assistant.defaultSkills — built-ins (network-assertion, accessibility-audit,
 * visual-diff) are seeded once and cannot be deleted from here. */
export class SkillRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSkillInput): Promise<Skill> {
    if (!input.name.trim()) {
      throw new ValidationError("Skill name is required");
    }
    if (!input.definition.trim()) {
      throw new ValidationError("Skill definition is required");
    }
    const existing = await this.prisma.skill.findUnique({ where: { name: input.name.trim() } });
    if (existing) {
      throw new ValidationError(`A skill named "${input.name.trim()}" already exists`);
    }
    return this.prisma.skill.create({
      data: { name: input.name.trim(), definition: input.definition.trim(), isBuiltIn: false },
    });
  }

  async list(): Promise<Skill[]> {
    return this.prisma.skill.findMany({ orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }] });
  }

  async delete(id: string): Promise<void> {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) {
      throw new NotFoundError(`Skill ${id} not found`);
    }
    if (skill.isBuiltIn) {
      throw new ValidationError(`"${skill.name}" is a built-in skill and cannot be deleted`);
    }
    await this.prisma.skill.delete({ where: { id } });
  }
}
