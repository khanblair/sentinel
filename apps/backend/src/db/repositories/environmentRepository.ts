import type { Environment, PrismaClient } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface CreateEnvironmentInput {
  projectId: string;
  name: string;
  baseUrl: string;
  credentialsProfile?: Record<string, string> | null;
}

export type UpdateEnvironmentInput = Partial<Omit<CreateEnvironmentInput, "projectId">>;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export class EnvironmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateEnvironmentInput): Promise<Environment> {
    if (!input.name.trim()) {
      throw new ValidationError("Environment name is required");
    }
    if (!isValidUrl(input.baseUrl)) {
      throw new ValidationError(`Environment baseUrl "${input.baseUrl}" is not a valid URL`);
    }
    const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) {
      throw new NotFoundError(`Project ${input.projectId} not found`);
    }

    return this.prisma.environment.create({
      data: {
        projectId: input.projectId,
        name: input.name.trim(),
        baseUrl: input.baseUrl,
        credentialsProfile: input.credentialsProfile ? JSON.stringify(input.credentialsProfile) : null,
      },
    });
  }

  async listByProject(projectId: string): Promise<Environment[]> {
    return this.prisma.environment.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async getById(id: string): Promise<Environment> {
    const environment = await this.prisma.environment.findUnique({ where: { id } });
    if (!environment) {
      throw new NotFoundError(`Environment ${id} not found`);
    }
    return environment;
  }

  async update(id: string, input: UpdateEnvironmentInput): Promise<Environment> {
    await this.getById(id);
    if (input.baseUrl !== undefined && !isValidUrl(input.baseUrl)) {
      throw new ValidationError(`Environment baseUrl "${input.baseUrl}" is not a valid URL`);
    }
    return this.prisma.environment.update({
      where: { id },
      data: {
        ...input,
        name: input.name?.trim(),
        credentialsProfile:
          input.credentialsProfile !== undefined
            ? JSON.stringify(input.credentialsProfile)
            : undefined,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.environment.delete({ where: { id } });
  }
}
