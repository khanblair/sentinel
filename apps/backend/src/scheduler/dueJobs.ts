export interface DueJobCandidate {
  isActive: boolean;
  nextRunAt: Date;
}

/**
 * Pure filter, no clock reads — `now` is always injected. This is the whole reason
 * the scheduler is testable without a real timer: dueJobs(jobs, fixedDate) is
 * deterministic, unlike a setInterval loop.
 */
export function dueJobs<T extends DueJobCandidate>(jobs: readonly T[], now: Date): T[] {
  return jobs.filter((job) => job.isActive && job.nextRunAt.getTime() <= now.getTime());
}
