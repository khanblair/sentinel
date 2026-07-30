import { describe, expect, it } from "vitest";
import { dueJobs } from "./dueJobs.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("dueJobs", () => {
  it("includes an active job whose nextRunAt is in the past", () => {
    const job = { isActive: true, nextRunAt: new Date("2026-07-30T11:00:00.000Z") };
    expect(dueJobs([job], NOW)).toEqual([job]);
  });

  it("includes an active job whose nextRunAt is exactly now", () => {
    const job = { isActive: true, nextRunAt: new Date(NOW) };
    expect(dueJobs([job], NOW)).toEqual([job]);
  });

  it("excludes a job whose nextRunAt is in the future", () => {
    const job = { isActive: true, nextRunAt: new Date("2026-07-30T13:00:00.000Z") };
    expect(dueJobs([job], NOW)).toEqual([]);
  });

  it("excludes an inactive job even if its nextRunAt is overdue", () => {
    const job = { isActive: false, nextRunAt: new Date("2026-07-30T11:00:00.000Z") };
    expect(dueJobs([job], NOW)).toEqual([]);
  });

  it("returns only the due subset from a mixed list", () => {
    const overdue = { isActive: true, nextRunAt: new Date("2026-07-30T11:00:00.000Z") };
    const future = { isActive: true, nextRunAt: new Date("2026-07-30T13:00:00.000Z") };
    const inactive = { isActive: false, nextRunAt: new Date("2026-07-30T11:00:00.000Z") };
    expect(dueJobs([overdue, future, inactive], NOW)).toEqual([overdue]);
  });
});
