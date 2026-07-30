import type { PrismaClient, TestCase } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";

export interface TestCaseView extends Omit<TestCase, "tags"> {
  tags: string[];
}

export interface CreateTestCaseInput {
  suiteId: string;
  module: string;
  subModule?: string | null;
  title: string;
  priority: string;
  urlPath: string;
  precondition?: string | null;
  preconditionType?: "auto" | "manual";
  steps: string;
  expectedResult: string;
  tags?: string[];
  owner?: string | null;
  linkedIssueUrl?: string | null;
}

export type UpdateTestCaseInput = Partial<Omit<CreateTestCaseInput, "suiteId">>;

function toView(testCase: TestCase): TestCaseView {
  let tags: string[];
  try {
    const parsed: unknown = JSON.parse(testCase.tags);
    tags = Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    tags = [];
  }
  return { ...testCase, tags };
}

export class TestCaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateTestCaseInput): Promise<TestCaseView> {
    if (!input.title.trim()) {
      throw new ValidationError("Test case title is required");
    }
    if (!input.expectedResult.trim()) {
      throw new ValidationError("Test case expected result is required");
    }
    const suite = await this.prisma.suite.findUnique({ where: { id: input.suiteId } });
    if (!suite) {
      throw new NotFoundError(`Suite ${input.suiteId} not found`);
    }

    const created = await this.prisma.testCase.create({
      data: {
        suiteId: input.suiteId,
        module: input.module,
        subModule: input.subModule ?? null,
        title: input.title.trim(),
        priority: input.priority,
        urlPath: input.urlPath,
        precondition: input.precondition ?? null,
        preconditionType: input.preconditionType ?? "auto",
        steps: input.steps,
        expectedResult: input.expectedResult,
        tags: JSON.stringify(input.tags ?? []),
        owner: input.owner ?? null,
        linkedIssueUrl: input.linkedIssueUrl ?? null,
      },
    });
    return toView(created);
  }

  async listBySuite(suiteId: string, options: { includeArchived?: boolean } = {}): Promise<TestCaseView[]> {
    const testCases = await this.prisma.testCase.findMany({
      where: { suiteId, archivedAt: options.includeArchived ? undefined : null },
      orderBy: { createdAt: "asc" },
    });
    return testCases.map(toView);
  }

  async getById(id: string): Promise<TestCaseView> {
    const testCase = await this.prisma.testCase.findUnique({ where: { id } });
    if (!testCase) {
      throw new NotFoundError(`Test case ${id} not found`);
    }
    return toView(testCase);
  }

  async update(id: string, input: UpdateTestCaseInput): Promise<TestCaseView> {
    await this.getById(id);
    if (input.title !== undefined && !input.title.trim()) {
      throw new ValidationError("Test case title cannot be empty");
    }

    const updated = await this.prisma.testCase.update({
      where: { id },
      data: {
        ...input,
        title: input.title?.trim(),
        tags: input.tags !== undefined ? JSON.stringify(input.tags) : undefined,
      },
    });
    return toView(updated);
  }

  async archive(id: string): Promise<TestCaseView> {
    await this.getById(id);
    const updated = await this.prisma.testCase.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return toView(updated);
  }

  async clone(id: string): Promise<TestCaseView> {
    const source = await this.prisma.testCase.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundError(`Test case ${id} not found`);
    }
    const cloned = await this.prisma.testCase.create({
      data: {
        suiteId: source.suiteId,
        module: source.module,
        subModule: source.subModule,
        title: `${source.title} (copy)`,
        priority: source.priority,
        urlPath: source.urlPath,
        precondition: source.precondition,
        preconditionType: source.preconditionType,
        steps: source.steps,
        expectedResult: source.expectedResult,
        tags: source.tags,
        owner: source.owner,
        linkedIssueUrl: source.linkedIssueUrl,
      },
    });
    return toView(cloned);
  }
}
