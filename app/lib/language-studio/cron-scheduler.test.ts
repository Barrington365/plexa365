import { describe, expect, it } from "vitest";
import { isCronDue, nextRunAt, normaliseFrequency, normaliseTimezone } from "./cron-scheduler";
import type { LanguageCronJob } from "./types";

// Pure scheduling only: never import the runner, stores, providers or server routes.
function job(patch: Partial<LanguageCronJob> = {}): LanguageCronJob {
  return {
    id: "offline", name: "Offline schedule", active: true, clientIds: [],
    sourceBrand: "PlanetF1", sourceLanguage: "en", sourceUrl: "",
    parserType: "xml", frequency: "daily", timezone: "Europe/London",
    hour: 9, minute: 0, processImages: false, importFullArticles: false,
    notifyOnFailure: false, consecutiveFailures: 0,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}
const next = (patch: Partial<LanguageCronJob>, after: string) => nextRunAt(job(patch), new Date(after));

describe("supported frequencies", () => {
  it.each(["minutes", "hourly", "daily", "weekly"])("retains %s", frequency => {
    expect(normaliseFrequency(frequency)).toBe(frequency);
  });
  it("does not advertise monthly scheduling: unsupported values normalize to hourly", () => {
    expect(normaliseFrequency("monthly")).toBe("hourly");
  });
  it("uses elapsed minutes across a DST jump without mutating the input date", () => {
    const after = new Date("2026-03-29T00:50:12.123Z");
    expect(nextRunAt(job({ frequency: "minutes", intervalMinutes: 20 }), after)).toBe("2026-03-29T01:10:12.123Z");
    expect(after.toISOString()).toBe("2026-03-29T00:50:12.123Z");
  });
  it.each([1, 2000])("bounds minute interval %s", intervalMinutes => {
    const result = next({ frequency: "minutes", intervalMinutes }, "2026-01-01T00:00:00Z");
    expect(result).toBe(intervalMinutes === 1 ? "2026-01-01T00:05:00.000Z" : "2026-01-02T00:00:00.000Z");
  });
  it("advances an hourly run at the exact scheduled instant", () => {
    expect(next({ frequency: "hourly", minute: 30 }, "2026-01-01T10:30:00Z")).toBe("2026-01-01T11:30:00.000Z");
  });
  it("keeps a future hourly minute in the current hour eligible", () => {
    expect(next({ frequency: "hourly", minute: 30 }, "2026-01-01T10:10:00Z")).toBe("2026-01-01T10:30:00.000Z");
  });
  it("aligns a two-hour interval to UTC hours across midnight", () => {
    expect(next({ frequency: "hourly", intervalMinutes: 120, minute: 15 }, "2026-01-01T23:20:00Z")).toBe("2026-01-02T00:15:00.000Z");
  });
});

describe("daily and weekly wall-clock scheduling", () => {
  it.each([
    ["2026-03-28T09:00:00Z", "2026-03-29T08:00:00.000Z"],
    ["2026-10-24T08:00:00Z", "2026-10-25T09:00:00.000Z"],
  ])("keeps London 09:00 across DST after %s", (after, expected) => {
    expect(next({}, after)).toBe(expected);
  });
  it("skips a nonexistent spring-forward daily time", () => {
    expect(next({ hour: 1, minute: 30 }, "2026-03-29T00:59:00Z")).toBe("2026-03-30T00:30:00.000Z");
  });
  it("currently permits both occurrences of an autumn repeated local time", () => {
    expect(next({ hour: 1, minute: 30 }, "2026-10-24T23:00:00Z")).toBe("2026-10-25T00:30:00.000Z");
    expect(next({ hour: 1, minute: 30 }, "2026-10-25T00:30:00Z")).toBe("2026-10-25T01:30:00.000Z");
  });
  it("uses local weekdays across the spring DST change", () => {
    expect(next({ frequency: "weekly", weekdays: [1] }, "2026-03-27T10:00:00Z")).toBe("2026-03-30T08:00:00.000Z");
  });
  it("skips a nonexistent weekly time until the following eligible Sunday", () => {
    expect(next({ frequency: "weekly", weekdays: [0], hour: 1, minute: 30 }, "2026-03-29T00:59:00Z")).toBe("2026-04-05T00:30:00.000Z");
  });
  it("uses the next selected weekday after an exact weekly slot", () => {
    expect(next({ frequency: "weekly", weekdays: [1, 3] }, "2026-03-30T08:00:00Z")).toBe("2026-04-01T08:00:00.000Z");
  });
  it("handles a non-whole-hour timezone and year rollover", () => {
    expect(next({ timezone: "Asia/Kolkata", hour: 0, minute: 15 }, "2026-12-31T18:45:00Z")).toBe("2027-01-01T18:45:00.000Z");
  });
  it("falls back to London for invalid timezones", () => {
    expect(normaliseTimezone("not/a-zone")).toBe("Europe/London");
    expect(next({ timezone: "not/a-zone" }, "2026-07-01T07:00:00Z")).toBe("2026-07-01T08:00:00.000Z");
  });
});

describe("due checks", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it.each([
    ["2026-10-28T11:59:59Z", true],
    ["2026-10-28T12:00:00Z", true],
    ["2026-10-28T12:00:00.001Z", false],
    ["invalid", false],
  ])("checks nextRunAt %s", (nextRunAt, expected) => {
    expect(isCronDue(job({ nextRunAt }), now)).toBe(expected);
  });
  it("allows an unscheduled active job and retry after failure", () => {
    expect(isCronDue(job(), now)).toBe(true);
    expect(isCronDue(job({ lastRunStatus: "failed", nextRunAt: now.toISOString() }), now)).toBe(true);
  });
  it("excludes inactive and running jobs even when overdue", () => {
    expect(isCronDue(job({ active: false }), now)).toBe(false);
    expect(isCronDue(job({ lastRunStatus: "running", nextRunAt: "2026-01-01T00:00:00Z" }), now)).toBe(false);
  });
  it("does not mutate job state or freshness timestamps", () => {
    const input = job({ nextRunAt: now.toISOString(), lastSuccessAt: "2026-10-27T12:00:00Z" });
    const snapshot = structuredClone(input);
    isCronDue(input, now);
    nextRunAt(input, now);
    expect(input).toEqual(snapshot);
  });
});
