import type { PrismaClient, ScheduledJob } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";
import { computeNextRunAt } from "../../scheduler/nextRun.js";

export interface CreateScheduledJobInput {
  suiteId: string;
  scheduleType: "cron" | "interval" | "once";
  scheduleExpression: string;
  timezone?: string;
  mode?: "interactive" | "full_auto";
  assistantId: string;
  providerConfigId: string;
  model: string;
  environmentId?: string | null;
}

export class ScheduledJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateScheduledJobInput): Promise<ScheduledJob> {
    const suite = await this.prisma.suite.findUnique({ where: { id: input.suiteId } });
    if (!suite) {
      throw new NotFoundError(`Suite ${input.suiteId} not found`);
    }

    const timezone = input.timezone ?? "UTC";
    const now = new Date();
    // "once" jobs fire at the timestamp given as scheduleExpression itself, since
    // computeNextRunAt() returns null for "once" (nothing to advance *to*).
    const nextRunAt =
      input.scheduleType === "once"
        ? parseOnceTimestamp(input.scheduleExpression)
        : computeNextRunAt({ scheduleType: input.scheduleType, scheduleExpression: input.scheduleExpression, timezone }, now);

    if (!nextRunAt) {
      throw new ValidationError("Could not compute a next run time for this schedule");
    }

    return this.prisma.scheduledJob.create({
      data: {
        suiteId: input.suiteId,
        scheduleType: input.scheduleType,
        scheduleExpression: input.scheduleExpression,
        timezone,
        mode: input.mode ?? "full_auto",
        nextRunAt,
        assistantId: input.assistantId,
        providerConfigId: input.providerConfigId,
        model: input.model,
        environmentId: input.environmentId ?? null,
      },
    });
  }

  async listBySuite(suiteId: string): Promise<ScheduledJob[]> {
    return this.prisma.scheduledJob.findMany({ where: { suiteId }, orderBy: { nextRunAt: "asc" } });
  }

  async setActive(id: string, isActive: boolean): Promise<ScheduledJob> {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundError(`ScheduledJob ${id} not found`);
    }
    return this.prisma.scheduledJob.update({ where: { id }, data: { isActive } });
  }

  async delete(id: string): Promise<void> {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundError(`ScheduledJob ${id} not found`);
    }
    await this.prisma.scheduledJob.delete({ where: { id } });
  }
}

function parseOnceTimestamp(expression: string): Date | null {
  const date = new Date(expression);
  return Number.isNaN(date.getTime()) ? null : date;
}
