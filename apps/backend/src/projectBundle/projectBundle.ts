import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../errors.js";

export const BUNDLE_VERSION = 1;

/**
 * A project bundle is a portable snapshot for backup/transfer between machines
 * (design's "project export/import" ask). It deliberately excludes Runs, StepLogs,
 * and ScheduledJobs: those reference assistantId/providerConfigId, which are
 * machine-local (a ProviderConfig holds an encrypted API key that only decrypts
 * under the exporting machine's encryption key) and would import as dangling
 * foreign keys on a different machine. Everything else is self-contained project
 * configuration and re-creates cleanly with fresh IDs.
 */
const testCaseBundleSchema = z.object({
  module: z.string().min(1),
  subModule: z.string().nullable(),
  title: z.string().min(1),
  priority: z.string().min(1),
  urlPath: z.string(),
  precondition: z.string().nullable(),
  preconditionType: z.string(),
  steps: z.string(),
  expectedResult: z.string(),
  tags: z.array(z.string()),
  owner: z.string().nullable(),
  linkedIssueUrl: z.string().nullable(),
  archived: z.boolean(),
});

const suiteBundleSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  archived: z.boolean(),
  testCases: z.array(testCaseBundleSchema),
});

const environmentBundleSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  credentialsProfile: z.string().nullable(),
});

const ruleBundleSchema = z.object({ text: z.string().min(1) });

const assistantBundleSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  defaultSkills: z.array(z.string()),
});

export const projectBundleSchema = z.object({
  version: z.literal(BUNDLE_VERSION),
  exportedAt: z.string(),
  project: z.object({ name: z.string().min(1), description: z.string().nullable() }),
  environments: z.array(environmentBundleSchema),
  rules: z.array(ruleBundleSchema),
  assistants: z.array(assistantBundleSchema),
  suites: z.array(suiteBundleSchema),
});

export type ProjectBundle = z.infer<typeof projectBundleSchema>;

export async function exportProjectBundle(prisma: PrismaClient, projectId: string): Promise<ProjectBundle> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }

  const [environments, rules, assistants, suites] = await Promise.all([
    prisma.environment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.rule.findMany({ where: { scope: "project", projectId }, orderBy: { createdAt: "asc" } }),
    prisma.assistant.findMany({ where: { projectId, isBuiltIn: false }, orderBy: { name: "asc" } }),
    prisma.suite.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { testCases: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: project.name, description: project.description },
    environments: environments.map((env) => ({
      name: env.name,
      baseUrl: env.baseUrl,
      credentialsProfile: env.credentialsProfile,
    })),
    rules: rules.map((rule) => ({ text: rule.text })),
    assistants: assistants.map((assistant) => ({
      name: assistant.name,
      systemPrompt: assistant.systemPrompt,
      defaultSkills: JSON.parse(assistant.defaultSkills) as string[],
    })),
    suites: suites.map((suite) => ({
      name: suite.name,
      description: suite.description,
      archived: suite.archivedAt !== null,
      testCases: suite.testCases.map((tc) => ({
        module: tc.module,
        subModule: tc.subModule,
        title: tc.title,
        priority: tc.priority,
        urlPath: tc.urlPath,
        precondition: tc.precondition,
        preconditionType: tc.preconditionType,
        steps: tc.steps,
        expectedResult: tc.expectedResult,
        tags: JSON.parse(tc.tags) as string[],
        owner: tc.owner,
        linkedIssueUrl: tc.linkedIssueUrl,
        archived: tc.archivedAt !== null,
      })),
    })),
  };
}

export interface ImportedProjectSummary {
  projectId: string;
  projectName: string;
  suiteCount: number;
  testCaseCount: number;
  environmentCount: number;
  ruleCount: number;
  assistantCount: number;
}

/** Always creates a brand-new Project with fresh IDs throughout — an import never
 * merges into or overwrites an existing project, so re-importing the same bundle
 * twice is safe (just produces two projects). */
export async function importProjectBundle(prisma: PrismaClient, raw: unknown): Promise<ImportedProjectSummary> {
  const parsed = projectBundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid project bundle: ${parsed.error.message}`);
  }
  const bundle = parsed.data;
  const now = new Date();

  const project = await prisma.project.create({
    data: { name: bundle.project.name, description: bundle.project.description },
  });

  for (const env of bundle.environments) {
    await prisma.environment.create({
      data: { projectId: project.id, name: env.name, baseUrl: env.baseUrl, credentialsProfile: env.credentialsProfile },
    });
  }

  for (const rule of bundle.rules) {
    await prisma.rule.create({ data: { scope: "project", projectId: project.id, text: rule.text } });
  }

  for (const assistant of bundle.assistants) {
    await prisma.assistant.create({
      data: {
        projectId: project.id,
        name: assistant.name,
        systemPrompt: assistant.systemPrompt,
        defaultSkills: JSON.stringify(assistant.defaultSkills),
        isBuiltIn: false,
      },
    });
  }

  let testCaseCount = 0;
  for (const suite of bundle.suites) {
    const createdSuite = await prisma.suite.create({
      data: {
        projectId: project.id,
        name: suite.name,
        description: suite.description,
        archivedAt: suite.archived ? now : null,
      },
    });
    for (const tc of suite.testCases) {
      await prisma.testCase.create({
        data: {
          suiteId: createdSuite.id,
          module: tc.module,
          subModule: tc.subModule,
          title: tc.title,
          priority: tc.priority,
          urlPath: tc.urlPath,
          precondition: tc.precondition,
          preconditionType: tc.preconditionType,
          steps: tc.steps,
          expectedResult: tc.expectedResult,
          tags: JSON.stringify(tc.tags),
          owner: tc.owner,
          linkedIssueUrl: tc.linkedIssueUrl,
          archivedAt: tc.archived ? now : null,
        },
      });
      testCaseCount += 1;
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    suiteCount: bundle.suites.length,
    testCaseCount,
    environmentCount: bundle.environments.length,
    ruleCount: bundle.rules.length,
    assistantCount: bundle.assistants.length,
  };
}
