import { parseExpression } from "cron-parser";
import { ValidationError } from "../errors.js";

export interface ScheduleSpec {
  scheduleType: string;
  scheduleExpression: string;
  timezone: string;
}

/**
 * Computes the next run time from `from` (always injected — never `new Date()`
 * inside, so this stays pure and testable). Returns null for "once" jobs, which
 * the caller should then deactivate instead of rescheduling.
 */
export function computeNextRunAt(spec: ScheduleSpec, from: Date): Date | null {
  switch (spec.scheduleType) {
    case "once":
      return null;
    case "interval": {
      const minutes = Number(spec.scheduleExpression);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new ValidationError(
          `Invalid interval expression "${spec.scheduleExpression}" — expected a positive number of minutes`,
        );
      }
      return new Date(from.getTime() + minutes * 60_000);
    }
    case "cron": {
      try {
        const interval = parseExpression(spec.scheduleExpression, { currentDate: from, tz: spec.timezone });
        return interval.next().toDate();
      } catch (error) {
        throw new ValidationError(
          `Invalid cron expression "${spec.scheduleExpression}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    default:
      throw new ValidationError(`Unknown scheduleType "${spec.scheduleType}"`);
  }
}
