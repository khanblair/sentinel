import type { PrismaClient, Suite } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface CreateSuiteInput {
  projectId: string;
  name: string;
  description?: string | null;
}

export interface UpdateSuiteInput {
  name?: string;
  description?: string | null;
}

export class SuiteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSuiteInput): Promise<Suite> {
    const name = input.name.trim();
    if (!name) {
      throw new ValidationError("Suite name is required");
    }
    const project = await this.prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) {
      throw new NotFoundError(`Project ${input.projectId} not found`);
    }
    return this.prisma.suite.create({
      data: { projectId: input.projectId, name, description: input.description ?? null },
    });
  }

  async listByProject(projectId: string, options: { includeArchived?: boolean } = {}): Promise<Suite[]> {
    return this.prisma.suite.findMany({
      where: {
        projectId,
        archivedAt: options.includeArchived ? undefined : null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string): Promise<Suite> {
    const suite = await this.prisma.suite.findUnique({ where: { id } });
    if (!suite) {
      throw new NotFoundError(`Suite ${id} not found`);
    }
    return suite;
  }

  async update(id: string, input: UpdateSuiteInput): Promise<Suite> {
    await this.getById(id);
    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError("Suite name cannot be empty");
    }
    return this.prisma.suite.update({
      where: { id },
      data: { ...input, name: input.name?.trim() },
    });
  }

  async archive(id: string): Promise<Suite> {
    await this.getById(id);
    return this.prisma.suite.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async clone(id: string): Promise<Suite> {
    const source = await this.getById(id);
    const testCases = await this.prisma.testCase.findMany({ where: { suiteId: id } });

    return this.prisma.suite.create({
      data: {
        projectId: source.projectId,
        name: `${source.name} (copy)`,
        description: source.description,
        testCases: {
          create: testCases.map((testCase) => ({
            module: testCase.module,
            subModule: testCase.subModule,
            title: testCase.title,
            priority: testCase.priority,
            urlPath: testCase.urlPath,
            precondition: testCase.precondition,
            preconditionType: testCase.preconditionType,
            steps: testCase.steps,
            expectedResult: testCase.expectedResult,
            tags: testCase.tags,
            owner: testCase.owner,
            linkedIssueUrl: testCase.linkedIssueUrl,
          })),
        },
      },
    });
  }
}
