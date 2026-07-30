import type { PrismaClient, ScheduledJob } from "@prisma/client";
import { dueJobs } from "./dueJobs.js";
import { computeNextRunAt } from "./nextRun.js";

export interface SchedulerLoopOptions {
  prisma: PrismaClient;
  intervalMs?: number;
  onDue: (job: ScheduledJob) => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Thin, deliberately unit-untested polling shell — the logic worth testing without
 * a real clock (dueJobs, computeNextRunAt) is pure and tested separately. This just
 * ticks on a timer, advances each due job's nextRunAt, and hands it to onDue.
 */
export function startSchedulerLoop(options: SchedulerLoopOptions): { stop: () => void } {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timer = setInterval(() => {
    void tick(options).catch((error: unknown) => {
      console.error("scheduler tick failed", error);
    });
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}

async function tick(options: SchedulerLoopOptions): Promise<void> {
  const activeJobs = await options.prisma.scheduledJob.findMany({ where: { isActive: true } });
  const now = new Date();
  const due = dueJobs(activeJobs, now);

  for (const job of due) {
    const nextRunAt = computeNextRunAt(job, now);
    await options.prisma.scheduledJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: now,
        nextRunAt: nextRunAt ?? job.nextRunAt,
        isActive: nextRunAt !== null,
      },
    });
    await options.onDue(job);
  }
}
