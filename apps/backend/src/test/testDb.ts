import { PrismaClient, type Assistant } from "@prisma/client";

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient();
}

/** There's no AssistantRepository yet (Assistants are UI-content, built in a later
 * phase), but Run.assistantId is a required FK — tests that create a Run need a real
 * row to point at. */
export async function seedAssistant(prisma: PrismaClient, name = "Test Assistant"): Promise<Assistant> {
  return prisma.assistant.create({
    data: { name, systemPrompt: "You are a QA testing assistant.", isBuiltIn: false },
  });
}

/** Deletes all rows in FK-safe order so each test file starts from a clean slate
 * without needing a fresh SQLite file per test. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.stepLog.deleteMany();
  await prisma.providerUsage.deleteMany();
  await prisma.run.deleteMany();
  await prisma.scheduledJob.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.suite.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.assistant.deleteMany();
  await prisma.providerConfig.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.project.deleteMany();
}
