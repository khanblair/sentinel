import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.js";
import { computeNextRunAt } from "./nextRun.js";

const FROM = new Date("2026-07-30T12:00:00.000Z");

describe("computeNextRunAt", () => {
  it("returns null for a one-time job — it should be deactivated, not rescheduled", () => {
    expect(computeNextRunAt({ scheduleType: "once", scheduleExpression: "", timezone: "UTC" }, FROM)).toBeNull();
  });

  it("advances an interval job by the given number of minutes", () => {
    const next = computeNextRunAt({ scheduleType: "interval", scheduleExpression: "30", timezone: "UTC" }, FROM);
    expect(next).toEqual(new Date("2026-07-30T12:30:00.000Z"));
  });

  it("rejects a non-numeric interval expression", () => {
    expect(() =>
      computeNextRunAt({ scheduleType: "interval", scheduleExpression: "not-a-number", timezone: "UTC" }, FROM),
    ).toThrow(ValidationError);
  });

  it("rejects a zero or negative interval", () => {
    expect(() => computeNextRunAt({ scheduleType: "interval", scheduleExpression: "0", timezone: "UTC" }, FROM)).toThrow(
      ValidationError,
    );
  });

  it("computes the next occurrence of a cron expression (daily at 09:00 UTC)", () => {
    const next = computeNextRunAt({ scheduleType: "cron", scheduleExpression: "0 9 * * *", timezone: "UTC" }, FROM);
    expect(next).toEqual(new Date("2026-07-31T09:00:00.000Z"));
  });

  it("rejects a malformed cron expression", () => {
    expect(() =>
      computeNextRunAt({ scheduleType: "cron", scheduleExpression: "not a cron expression", timezone: "UTC" }, FROM),
    ).toThrow(ValidationError);
  });

  it("rejects an unknown scheduleType", () => {
    expect(() =>
      computeNextRunAt({ scheduleType: "fortnightly", scheduleExpression: "x", timezone: "UTC" }, FROM),
    ).toThrow(ValidationError);
  });
});
