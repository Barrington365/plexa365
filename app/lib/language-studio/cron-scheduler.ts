import type { LanguageCronFrequency, LanguageCronJob } from "@/app/lib/language-studio/types";

const DEFAULT_TIMEZONE = "Europe/London";
const DEFAULT_INTERVAL_MINUTES = 60;

type ZonedParts = {
  weekday: number;
  hour: number;
  minute: number;
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function normaliseFrequency(value: unknown): LanguageCronFrequency {
  return value === "minutes" || value === "hourly" || value === "daily" || value === "weekly" ? value : "hourly";
}

export function normaliseIntervalMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(1440, Math.max(5, Math.round(parsed)));
}

export function normaliseClockValue(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, Math.round(parsed)));
}

export function normaliseWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1];
  const days = [...new Set(value.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length ? days : [1];
}

export function normaliseTimezone(value: unknown): string {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function zonedParts(date: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: weekdayMap[get("weekday")] ?? 0,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function nextHourlyRun(job: LanguageCronJob, after: Date): Date {
  const interval = Math.max(1, Math.round((job.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES) / 60));
  const next = new Date(after);
  next.setUTCMinutes(job.minute ?? 0, 0, 0);
  if (next.getTime() <= after.getTime()) next.setUTCHours(next.getUTCHours() + 1);
  const offset = next.getUTCHours() % interval;
  if (offset !== 0) next.setUTCHours(next.getUTCHours() + interval - offset);
  return next;
}

function nextWallClockRun(job: LanguageCronJob, after: Date): Date {
  const timezone = normaliseTimezone(job.timezone);
  const targetHour = normaliseClockValue(job.hour, 23);
  const targetMinute = normaliseClockValue(job.minute, 59);
  const weekdays = new Set(job.frequency === "weekly" ? normaliseWeekdays(job.weekdays) : [0, 1, 2, 3, 4, 5, 6]);
  let cursor = addMinutes(after, 1);
  cursor.setUTCSeconds(0, 0);
  for (let i = 0; i < 12 * 24 * 60; i += 1) {
    const parts = zonedParts(cursor, timezone);
    if (weekdays.has(parts.weekday) && parts.hour === targetHour && parts.minute === targetMinute) return cursor;
    cursor = addMinutes(cursor, 1);
  }
  return addMinutes(after, DEFAULT_INTERVAL_MINUTES);
}

export function nextRunAt(job: LanguageCronJob, after = new Date()): string {
  if (job.frequency === "minutes") return addMinutes(after, normaliseIntervalMinutes(job.intervalMinutes)).toISOString();
  if (job.frequency === "hourly") return nextHourlyRun(job, after).toISOString();
  return nextWallClockRun(job, after).toISOString();
}

export function isCronDue(job: LanguageCronJob, now = new Date()): boolean {
  if (!job.active || job.lastRunStatus === "running") return false;
  if (!job.nextRunAt) return true;
  return new Date(job.nextRunAt).getTime() <= now.getTime();
}
