import type { PrismaClient, Project } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  defaultAssistantId?: string | null;
}

export class ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const name = input.name.trim();
    if (!name) {
      throw new ValidationError("Project name is required");
    }
    return this.prisma.project.create({
      data: { name, description: input.description ?? null },
    });
  }

  async list(): Promise<Project[]> {
    // Secondary sort on id (cuid, monotonic within this process) so two rows created
    // within the same millisecond still return in a stable, deterministic order.
    return this.prisma.project.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }

  async getById(id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError(`Project ${id} not found`);
    }
    return project;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    await this.getById(id);
    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError("Project name cannot be empty");
    }
    return this.prisma.project.update({
      where: { id },
      data: { ...input, name: input.name?.trim() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.project.delete({ where: { id } });
  }
}
