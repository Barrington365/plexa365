/**
 * URL validation + PlanetSport / GetRace mapping for Racecard URL import (Planet Sport Studio).
 * Keeps parsing in small testable pieces; no DOM APIs (safe on server).
 */

import type { Race, RacecardSnapshot, Runner, RunnerSilks } from "@/types";

const PLANETSPORT_BASE = "https://rsapi.racingandsports.com/api/PlanetSport";

export type RacecardImportSource = "url" | "manual";

/** Intermediate runner shape before mapping to `Runner` */
export type ParsedRacecardRunner = {
  id: string;
  number?: string;
  horseName: string;
  odds?: string;
  silkUrl?: string;
  silkBg?: string;
  silkFg?: string;
  isTopPick?: boolean;
};

/** Preview / staging shape (aligned with product spec) */
export type RacecardTemplatePreview = {
  id: string;
  course: string;
  raceTime: string;
  raceTitle: string;
  runnerCount: number;
  topPicks: string[];
  runners: ParsedRacecardRunner[];
  sourceType: RacecardImportSource;
  sourceUrl?: string;
  rawSource?: unknown;
  createdAt: string;
};

export class RacecardUrlImportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "empty"
      | "invalid_url"
      | "fetch_failed"
      | "blocked"
      | "unsupported"
      | "parse_failed"
      | "missing_race"
      | "no_runners",
  ) {
    super(message);
    this.name = "RacecardUrlImportError";
  }
}

export function validateRacecardUrl(raw: string): URL {
  const t = raw.trim();
  if (!t) throw new RacecardUrlImportError("Please enter a valid URL", "empty");
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new RacecardUrlImportError("Please enter a valid URL", "invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new RacecardUrlImportError("Please enter a valid URL", "invalid_url");
  }
  return u;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

/** Extract numeric race id from common Racing365 / Planet Sport Studio style URLs and HTML snippets */
export function extractPlanetSportRaceIdFromUrl(url: URL): number | null {
  const q = url.searchParams.get("raceId") ?? url.searchParams.get("RaceID");
  if (q) {
    const n = Number(String(q).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const resultPath = url.pathname.match(/\/results\/[^/]+\/\d{3,4}\/(\d+)\/?$/i);
  if (resultPath) {
    const n = Number(resultPath[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const slugRace = url.pathname.match(/-race-\d+-(\d+)\/?$/i);
  if (slugRace) {
    const n = Number(slugRace[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const m = url.pathname.match(/(?:race|Race)[_-]?(\d{5,})/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// --- Racing365 SPA URLs: `/uk-horse-racing/results/carlisle/1600` (time = HHMM → 16:00), same for `/race/...` ---

export type Racing365PathKind = "results" | "race";

/** Same slug rules as Racing365 `ede()` (course segment in URLs). */
export function slugifyRacing365CourseSegment(courseName: string): string {
  return courseName
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `1600` → `16:00`, `1350` → `13:50` (aligned with Racing365 `B2t`). */
export function normalizeRacing365TimeSlug(segment: string): string | null {
  if (!segment) return null;
  const digits = segment.replace(":", "").trim();
  if (!/^\d{3,4}$/.test(digits)) return null;
  return digits.length === 4
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : `${digits.slice(0, 1).padStart(2, "0")}:${digits.slice(1).padStart(2, "0")}`;
}

/**
 * `/…/results/carlisle/1600`, `/…/race/randwick/1350` (prefix segments before `results`/`race` are ignored).
 */
export function parseRacing365MeetingTimeFromPath(pathname: string): {
  kind: Racing365PathKind;
  meetingSlug: string;
  timeSlug: string;
} | null {
  const m = pathname.match(/\/(results|race)\/([^/]+)\/([^/?#]+)\/?$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() === "results" ? "results" : "race";
  const meetingSlug = m[2].toLowerCase();
  const timeSlug = m[3];
  if (!meetingSlug || !timeSlug) return null;
  return { kind, meetingSlug, timeSlug };
}

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type FlatMeetingRace = {
  dayDate: string;
  courseName: string;
  raceTime: string;
  raceUtcTime: string;
  preRaceId: number;
  postRaceId: number | null;
};

/** Flatten one `GetMeetings?date=` response block (same nesting as rsapi). Skips greyhound rows (`Discipline === "G"`). */
export function flattenPlanetSportMeetingsForDate(raw: unknown, dayDate: string): FlatMeetingRace[] {
  const out: FlatMeetingRace[] = [];
  if (!Array.isArray(raw)) return out;
  for (const block of raw) {
    if (!block || typeof block !== "object") continue;
    const states = (block as { States?: unknown[] }).States;
    if (!Array.isArray(states)) continue;
    for (const st of states) {
      if (!st || typeof st !== "object") continue;
      const courses = (st as { Courses?: unknown[] }).Courses;
      if (!Array.isArray(courses)) continue;
      for (const c of courses) {
        if (!c || typeof c !== "object") continue;
        const courseName = str((c as { Course?: unknown }).Course);
        const races = (c as { Races?: unknown[] }).Races;
        if (!courseName || !Array.isArray(races)) continue;
        for (const r of races) {
          if (!r || typeof r !== "object") continue;
          const discipline = str((r as { Discipline?: unknown }).Discipline).toUpperCase();
          if (discipline === "G") continue;
          const pre = positiveInt((r as { PreRaceID?: unknown }).PreRaceID);
          if (!pre) continue;
          const post = positiveInt((r as { PostRaceID?: unknown }).PostRaceID);
          const raceTime = str((r as { RaceTime?: unknown }).RaceTime);
          if (!raceTime) continue;
          out.push({
            dayDate,
            courseName,
            raceTime,
            raceUtcTime: str((r as { RaceUTCTime?: unknown }).RaceUTCTime),
            preRaceId: pre,
            postRaceId: post,
          });
        }
      }
    }
  }
  return out;
}

function londonMeetingsDateWindowTriple(): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = (ms: number) => formatter.format(new Date(ms));
  const now = Date.now();
  const dayMs = 86_400_000;
  return [ymd(now), ymd(now + dayMs), ymd(now - dayMs)];
}

function londonTimeFromUtc(utcIso: string): string | null {
  if (!utcIso) return null;
  const date = new Date(utcIso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

async function fetchPlanetSportMeetingsForDate(dateIso: string): Promise<unknown> {
  const url = `${PLANETSPORT_BASE}/GetMeetings?date=${encodeURIComponent(dateIso)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new RacecardUrlImportError("We could not fetch data from this page", "blocked");
    }
    throw new RacecardUrlImportError("We could not fetch data from this page", "fetch_failed");
  }
  return res.json();
}

async function resolveRacing365CourseTimeToFetchId(
  kind: Racing365PathKind,
  meetingSlug: string,
  raceTimeHhMm: string,
): Promise<number> {
  const dates = londonMeetingsDateWindowTriple();
  const matches: FlatMeetingRace[] = [];
  for (const d of dates) {
    let raw: unknown;
    try {
      raw = await fetchPlanetSportMeetingsForDate(d);
    } catch (e) {
      if (e instanceof RacecardUrlImportError) throw e;
      continue;
    }
    const rows = flattenPlanetSportMeetingsForDate(raw, d).filter((row) => {
      if (slugifyRacing365CourseSegment(row.courseName) !== meetingSlug) return false;
      return row.raceTime === raceTimeHhMm || londonTimeFromUtc(row.raceUtcTime) === raceTimeHhMm;
    });
    matches.push(...rows);
  }
  if (matches.length > 0) {
    if (kind === "results") {
      const officialResult = matches.find((row) => row.postRaceId);
      return officialResult?.postRaceId ?? matches[0]!.preRaceId;
    }
    return matches[0]!.preRaceId;
  }
  throw new RacecardUrlImportError(
    "We could not match this Racing365 course and time in recent meeting data. Try again after the card is published, or use a URL that includes a race id.",
    "unsupported",
  );
}

/** Pre-race id bundled on `GetResults` so clients can link back to the card (casing varies). */
function preRaceIdFromPlanetSportResults(results: PlanetSportRacePayload): number | null {
  const o = results as Record<string, unknown>;
  return positiveInt(o.preraceID) ?? positiveInt(o.PreRaceID) ?? positiveInt(o.preRaceId);
}

const RUNNER_SILK_FIELD_KEYS = [
  "Silk",
  "silk",
  "SILK",
  "Silks",
  "silks",
  "SilkUrl",
  "silkUrl",
  "SilksUrl",
  "JockeySilk",
  "jockeySilk",
  "JockeySilkUrl",
  "jockeySilkUrl",
  "RunnerSilk",
  "ClothUrl",
  "ColoursUrl",
  "ColoursURL",
  "WSilk",
  "wSilk",
  "ImageSilk",
  "SilkImage",
  "SilkPNG",
] as const;

/**
 * `GetResults` often drops `SilksStrip`, meeting ids, and per-runner `Silk` even though `GetRace` has them.
 * Merge pre-race metadata + runner silk fields so import / placings resolve image URLs.
 */
export function mergePlanetSportResultsWithPreRaceApi(
  results: PlanetSportRacePayload,
  pre: PlanetSportRacePayload,
): void {
  const res = results as Record<string, unknown>;
  const preObj = pre as Record<string, unknown>;

  const preStrip = str(preObj.SilksStrip);
  if (preStrip && !str(res.SilksStrip)) res.SilksStrip = preStrip;

  for (const k of ["MeetingID", "MeetingId", "CrsMeetingID", "SilkMeetingId", "SilksMeetingId"] as const) {
    const v = preObj[k];
    if (v != null && str(v) && !str(res[k] as unknown)) res[k] = v;
  }

  const rRows = res.Runners;
  const pRows = preObj.Runners;
  if (!Array.isArray(rRows) || !Array.isArray(pRows)) return;

  const byHorse = new Map<string, PlanetSportRunnerRow>();
  for (const row of pRows) {
    const pr = row as PlanetSportRunnerRow;
    const hid = runnerHorseIdString(pr);
    if (hid) byHorse.set(hid, pr);
  }

  for (const row of rRows) {
    const r = row as PlanetSportRunnerRow & Record<string, unknown>;
    const hid = runnerHorseIdString(r);
    if (!hid) continue;
    const preRow = byHorse.get(hid);
    if (!preRow) continue;

    for (const k of RUNNER_SILK_FIELD_KEYS) {
      const existing = str(r[k]);
      if (existing && looksLikeSilkAssetUrl(existing)) continue;
      const v = (preRow as Record<string, unknown>)[k];
      const vs = str(v);
      if (vs && looksLikeSilkAssetUrl(vs)) r[k] = v;
    }
    if (!r.Silks && preRow.Silks) r.Silks = preRow.Silks;
  }
}

async function enrichPlanetSportGetResultsWithPreRaceMetadata(
  results: PlanetSportRacePayload,
  headers: Record<string, string>,
): Promise<PlanetSportRacePayload> {
  const preId = preRaceIdFromPlanetSportResults(results);
  if (!preId) return results;

  const preRes = await fetch(`${PLANETSPORT_BASE}/GetRace/${preId}`, {
    headers,
    next: { revalidate: 0 },
  });
  if (!preRes.ok) return results;
  let pre: unknown;
  try {
    pre = await preRes.json();
  } catch {
    return results;
  }
  if (!pre || typeof pre !== "object") return results;
  const prePayload = pre as PlanetSportRacePayload;
  mergePlanetSportResultsWithPreRaceApi(results, prePayload);
  return results;
}

/** Try `GetRace` first (pre-race / full card); fall back to `GetResults` (post-race id only) — matches Racing365 behaviour. */
export async function fetchPlanetSportRacePayloadFlexible(raceId: number): Promise<PlanetSportRacePayload> {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  const tryRace = await fetch(`${PLANETSPORT_BASE}/GetRace/${raceId}`, {
    headers,
    next: { revalidate: 0 },
  });
  if (tryRace.ok) {
    let data: unknown;
    try {
      data = await tryRace.json();
    } catch {
      throw new RacecardUrlImportError("We found the page but could not parse a racecard", "parse_failed");
    }
    const runners = data && typeof data === "object" ? (data as PlanetSportRacePayload).Runners : null;
    if (Array.isArray(runners) && runners.length > 0) {
      return data as PlanetSportRacePayload;
    }
  } else if (tryRace.status === 403 || tryRace.status === 401) {
    throw new RacecardUrlImportError("We could not fetch data from this page", "blocked");
  }

  const tryRes = await fetch(`${PLANETSPORT_BASE}/GetResults/${raceId}`, {
    headers,
    next: { revalidate: 0 },
  });
  if (!tryRes.ok) {
    if (tryRes.status === 403 || tryRes.status === 401) {
      throw new RacecardUrlImportError("We could not fetch data from this page", "blocked");
    }
    throw new RacecardUrlImportError("We could not fetch data from this page", "fetch_failed");
  }
  let data2: unknown;
  try {
    data2 = await tryRes.json();
  } catch {
    throw new RacecardUrlImportError("We found the page but could not parse a racecard", "parse_failed");
  }
  const runners2 = data2 && typeof data2 === "object" ? (data2 as PlanetSportRacePayload).Runners : null;
  if (!Array.isArray(runners2) || runners2.length === 0) {
    throw new RacecardUrlImportError("We found the page but could not parse a racecard", "unsupported");
  }
  return enrichPlanetSportGetResultsWithPreRaceMetadata(data2 as PlanetSportRacePayload, headers);
}

export function extractPlanetSportRaceIdFromHtml(html: string): number | null {
  const patterns = [
    /"RaceID"\s*:\s*(\d{4,})/,
    /raceId\\?"?\s*[:=]\s*\\?"?(\d{4,})/i,
    /"identifier"\s*:\s*"(\d{4,})"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function jsonObjectAfterMarker(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const slice = html.slice(idx, idx + 300_000);
  const brace = slice.indexOf("{");
  if (brace < 0) return null;
  let fragment = slice.slice(brace);
  if (fragment.includes('\\"')) fragment = fragment.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(fragment.slice(0, end)) as unknown;
  } catch {
    return null;
  }
}

function publishedRacing365Text(value: unknown): string {
  const text = str(value);
  return text && text !== "$undefined" && text !== "$null" ? text : "";
}

function payloadFromRacing365Result(root: Record<string, unknown>): PlanetSportRacePayload | null {
  const raceId = positiveInt(root.raceId);
  const rows = root.rows;
  if (!raceId || !Array.isArray(rows) || rows.length === 0) return null;
  const mapped = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const runner = row as Record<string, unknown>;
    const horse = str(runner.horse);
    const number = positiveInt(runner.cardNumber) ?? positiveInt(runner.posSort);
    if (!horse || !number) return [];
    const place = positiveInt(runner.posSort) ?? positiveInt(runner.pos);
    const odds = publishedRacing365Text(runner.sp);
    return [{
      HorseName: horse,
      RunnerTab: number,
      FinishingPosition: place ?? undefined,
      SP: odds,
      Silk: str(runner.silksUrl),
      JockeyName: str(runner.jockey),
      TrainerName: str(runner.trainer),
      Scratched: "N",
    }];
  });
  if (!mapped.length) return null;
  return {
    RaceID: raceId,
    Course: str(root.courseName),
    Time: str(root.displayTime),
    RaceName: str(root.raceName),
    DisplayDistance: str(root.distance),
    RaceSOT: str(root.going),
    Date: str(root.utcDate),
    Selections: "",
    Runners: mapped,
  };
}

/** Racing365 pages embed the card or result when the legacy feed has no row yet. */
export function planetSportPayloadFromRacing365Html(html: string): PlanetSportRacePayload | null {
  const result = jsonObjectAfterMarker(html, "liveResult");
  if (result && typeof result === "object") {
    const mapped = payloadFromRacing365Result(result as Record<string, unknown>);
    if (mapped) return mapped;
  }
  const card = jsonObjectAfterMarker(html, "liveRaceCard");
  if (!card || typeof card !== "object") return null;
  const root = card as Record<string, unknown>;
  const race = root.race;
  if (!race || typeof race !== "object") return null;
  const raceRow = race as Record<string, unknown>;
  const raceId = positiveInt(root.raceId);
  const runners = raceRow.raceRunners;
  if (!raceId || !Array.isArray(runners) || runners.length === 0) return null;
  const mapped = runners.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const runner = row as Record<string, unknown>;
    const horse = str(runner.name);
    const number = positiveInt(runner.number);
    if (!horse || !number) return [];
    const published = (value: unknown) => {
      const text = str(value);
      return text && text !== "$undefined" && text !== "$null" ? text : "";
    };
    const odds = published(runner.bestOdds) || published(runner.openingOdds) || published(runner.startingPrice);
    const silk = str(runner.silksUrl);
    return [{
      HorseName: horse,
      RunnerTab: number,
      WinOdds: odds,
      Silk: silk,
      JockeyName: str(runner.jockey),
      TrainerName: str(runner.trainer),
      Scratched: "N",
    }];
  });
  if (!mapped.length) return null;
  return {
    RaceID: raceId,
    Course: str(root.meetingName) || str(raceRow.meeting),
    Time: str(raceRow.time),
    RaceName: str(raceRow.raceName),
    DisplayDistance: str(raceRow.distance),
    RaceSOT: str(raceRow.going),
    Date: str(raceRow.raceDateIso) || str(root.utcDate),
    Selections: "",
    Runners: mapped,
  };
}

/** First-stage HTML inspection: embedded ids / JSON hints (no full DOM parse). */
export function parseRacecardFromHtml(
  html: string,
): { raceId: number | null; hints: string[] } {
  const hints: string[] = [];
  const raceId = extractPlanetSportRaceIdFromHtml(html);
  if (raceId) hints.push("planetSportRaceId");
  return { raceId, hints };
}

export const normalizeRacecardData = normalizePlanetSportGetRace;
export const validateRacecardTemplate = validateRacecardTemplateForImport;

export type PlanetSportRunnerRow = Record<string, unknown>;
export type PlanetSportRacePayload = Record<string, unknown>;

function pickRunnerStr(r: PlanetSportRunnerRow, keys: string[]): string {
  const o = r as Record<string, unknown>;
  for (const k of keys) {
    const s = str(o[k]);
    if (s) return s;
  }
  return "";
}

const SILK_MONTH: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function looksLikeSilkAssetUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/\/jockey\/silks\//i.test(t)) return true;
  if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(t)) return true;
  if (/^\/\//.test(t) && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(t)) return true;
  return false;
}

function normalizeSilkUrlString(s: string): string {
  const t = s.trim();
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

/** `…/jockey/silks/YYYY/MM/DD/{meetingId}/…` or `…/jockey/silks/19-apr-2026/{meetingId}/R4.png` (SilksStrip). */
function parseSilksStripContext(strip: string): { y: string; m: string; d: string; meetingId: string } | null {
  const s = strip.trim();
  if (!s) return null;
  const iso = /\/jockey\/silks\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\//i.exec(s);
  if (iso) {
    return { y: iso[1]!, m: iso[2]!, d: iso[3]!, meetingId: iso[4]! };
  }
  const dmy = /\/jockey\/silks\/(\d{1,2})-([a-z]{3,9})-(\d{4})\/(\d+)\//i.exec(s);
  if (dmy) {
    const day = dmy[1]!.padStart(2, "0");
    const monKey = dmy[2]!.toLowerCase().slice(0, 3);
    const mm = SILK_MONTH[monKey];
    if (!mm) return null;
    return { y: dmy[3]!, m: mm, d: day, meetingId: dmy[4]! };
  }
  return null;
}

function silkFromNestedSilksObject(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  return pickRunnerStr(v as PlanetSportRunnerRow, [
    "Url",
    "url",
    "URL",
    "ImageUrl",
    "imageUrl",
    "FullUrl",
    "Src",
    "src",
    "PNG",
    "Path",
    "path",
  ]);
}

function silkFromFormArray(r: PlanetSportRunnerRow): string {
  const form = (r as Record<string, unknown>).Form;
  if (!Array.isArray(form)) return "";
  for (const entry of form) {
    if (!entry || typeof entry !== "object") continue;
    const su = str((entry as Record<string, unknown>).Silk);
    if (su && looksLikeSilkAssetUrl(su)) return su;
  }
  return "";
}

function runnerHorseIdString(r: PlanetSportRunnerRow): string {
  const o = r as Record<string, unknown>;
  const v = o.HorseId ?? o.horseId ?? o.HORSEID ?? o.HorseID;
  if (v == null) return "";
  const s = typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : str(v);
  return /^\d+$/.test(s) ? s : "";
}

function silkCdnBaseFromApi(api: PlanetSportRacePayload): string {
  const fromUrl = (u: string) => {
    const m = /^(https?:\/\/[^/]+)/i.exec(u.trim());
    return m ? m[1]! : "";
  };
  const strip = str((api as Record<string, unknown>).SilksStrip);
  const b0 = fromUrl(strip);
  if (b0) return b0;
  const raw = (api as Record<string, unknown>).Runners;
  if (!Array.isArray(raw)) return "https://resource3.s3-ap-southeast-2.amazonaws.com";
  for (const row of raw) {
    const su = pickRunnerStr(row as PlanetSportRunnerRow, [
      "Silk",
      "silk",
      "Silks",
      "SilkUrl",
      "silkUrl",
      "JockeySilk",
      "JockeySilkUrl",
    ]);
    const b = fromUrl(su);
    if (b) return b;
  }
  return "https://resource3.s3-ap-southeast-2.amazonaws.com";
}

function inferSilkMeetingPathFromPeers(
  api: PlanetSportRacePayload,
  excludeRow: PlanetSportRunnerRow,
): { y: string; m: string; d: string; meetingId: string } | null {
  const raw = (api as Record<string, unknown>).Runners;
  if (!Array.isArray(raw)) return null;
  for (const row of raw) {
    if (row === excludeRow) continue;
    const su = pickRunnerStr(row as PlanetSportRunnerRow, [
      "Silk",
      "silk",
      "Silks",
      "SilkUrl",
      "silkUrl",
      "JockeySilk",
      "JockeySilkUrl",
    ]);
    const m = /\/jockey\/silks\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\/\d+\./i.exec(su);
    if (m) return { y: m[1]!, m: m[2]!, d: m[3]!, meetingId: m[4]! };
  }
  return null;
}

/**
 * Jockey silks image for a PlanetSport `Runners[]` row (`GetRace` / `GetResults`).
 * Tries direct URL fields, nested `Silks`, `Form[].Silk`, then synthesizes
 * `{cdn}/jockey/silks/YYYY/MM/DD/{meeting}/{horseId}.png` from `SilksStrip`, race `Date`, and `HorseId`
 * (Racing365 CDN layout).
 */
export function silkUrlFromPlanetSportRunner(
  r: PlanetSportRunnerRow,
  api?: PlanetSportRacePayload,
): string {
  const direct = pickRunnerStr(r, [
    "Silk",
    "silk",
    "SILK",
    "Silks",
    "silks",
    "SilkUrl",
    "silkUrl",
    "SilksUrl",
    "JockeySilk",
    "jockeySilk",
    "JockeySilkUrl",
    "jockeySilkUrl",
    "RunnerSilk",
    "ClothUrl",
    "ColoursUrl",
    "ColoursURL",
    "WSilk",
    "wSilk",
    "ImageSilk",
    "SilkImage",
    "SilkPNG",
  ]);
  if (direct && looksLikeSilkAssetUrl(direct)) return normalizeSilkUrlString(direct);

  const nested = silkFromNestedSilksObject((r as Record<string, unknown>).Silks);
  if (nested && looksLikeSilkAssetUrl(nested)) return normalizeSilkUrlString(nested);

  const fromForm = silkFromFormArray(r);
  if (fromForm) return normalizeSilkUrlString(fromForm);

  if (!api) return "";

  const horseId = runnerHorseIdString(r);
  if (!horseId) return "";

  let y = "";
  let m = "";
  let d = "";
  let meetingId = "";

  const stripCtx = parseSilksStripContext(str((api as Record<string, unknown>).SilksStrip));
  if (stripCtx) {
    ({ y, m, d, meetingId } = stripCtx);
  } else {
    const dateStr = str((api as Record<string, unknown>).Date);
    const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (dm) {
      y = dm[1]!;
      m = dm[2]!;
      d = dm[3]!;
    }
    meetingId =
      str((api as Record<string, unknown>).MeetingID) ||
      str((api as Record<string, unknown>).MeetingId) ||
      str((api as Record<string, unknown>).CrsMeetingID) ||
      str((api as Record<string, unknown>).SilkMeetingId) ||
      str((api as Record<string, unknown>).SilksMeetingId) ||
      "";
    const peer = inferSilkMeetingPathFromPeers(api, r);
    if (peer) {
      if (!y) ({ y, m, d } = peer);
      if (!meetingId) meetingId = peer.meetingId;
    }
  }

  if (!y || !m || !d || !meetingId) return "";

  const base = silkCdnBaseFromApi(api);
  return `${base}/jockey/silks/${y}/${m}/${d}/${meetingId}/${horseId}.png`;
}

/** Map runner tab / cloth number → raw API row (for silk + odds fallbacks). */
export function planetSportRunnersByTab(api: PlanetSportRacePayload | undefined): Map<string, PlanetSportRunnerRow> {
  const m = new Map<string, PlanetSportRunnerRow>();
  if (!api) return m;
  const raw = api.Runners;
  if (!Array.isArray(raw)) return m;
  for (const row of raw) {
    const r = row as PlanetSportRunnerRow;
    const tab = r.RunnerTab ?? r.Tab;
    const key =
      typeof tab === "number" && Number.isFinite(tab) ? String(Math.trunc(tab)) : str(tab);
    if (key) m.set(key, r);
  }
  return m;
}

export function planetSportRunnerByHorseName(
  api: PlanetSportRacePayload | undefined,
  horseName: string,
): PlanetSportRunnerRow | undefined {
  if (!api || !horseName.trim()) return undefined;
  const raw = api.Runners;
  if (!Array.isArray(raw)) return undefined;
  const target = horseName.trim().toLowerCase();
  for (const row of raw) {
    const r = row as PlanetSportRunnerRow;
    if (str(r.HorseName).toLowerCase() === target) return r;
  }
  return undefined;
}

/**
 * Final silk URL for a parsed preview runner: use `silkUrl` if set, else resolve from raw `Runners[]`
 * (alternate fields, SilksStrip + HorseId, etc.).
 */
export function resolvedSilkUrlForParsedRunner(
  pr: ParsedRacecardRunner,
  api: PlanetSportRacePayload | undefined,
  byTab?: Map<string, PlanetSportRunnerRow>,
): string {
  const u = pr.silkUrl?.trim();
  if (u) return u;
  if (!api) return "";
  const tabMap = byTab ?? planetSportRunnersByTab(api);
  const raw =
    (pr.number ? tabMap.get(pr.number) : undefined) ?? planetSportRunnerByHorseName(api, pr.horseName);
  return raw ? silkUrlFromPlanetSportRunner(raw, api) : "";
}

function oddsFromNestedPriceObject(price: unknown): string {
  if (!price || typeof price !== "object") return "";
  const p = price as Record<string, unknown>;
  const keys = [
    "WSP",
    "wsp",
    "SP",
    "Sp",
    "sp",
    "StartingPrice",
    "startingPrice",
    "Decimal",
    "DecimalOdds",
    "Win",
    "WinOdds",
    "FinalOdds",
  ];
  for (const k of keys) {
    const s = str(p[k]);
    if (s) return s;
  }
  return "";
}

/**
 * Display odds / starting price for a PlanetSport `Runners[]` row (`GetRace` or `GetResults`).
 * **GetResults** returns fractional SP as **WSP** (e.g. `150/1`); pre-race **GetRace** uses WinOdds / SP / etc.
 */
export function oddsFromPlanetSportRunner(r: PlanetSportRunnerRow): string {
  const o = r as Record<string, unknown>;

  const spFirst = pickRunnerStr(r, [
    "WSP",
    "wsp",
    "SP",
    "Sp",
    "sp",
    "StartingPrice",
    "startingPrice",
    "STARTING_PRICE",
    "Starting_Price",
    "WinSP",
    "winSP",
    "WIN_SP",
    "FinalSP",
    "finalSP",
    "FinalOdds",
    "finalOdds",
    "DecimalSP",
    "decimalSP",
    "DecimalOdds",
    "BSP",
    "BetfairSP",
    "Betfair_SP",
    "IndustrySP",
    "Industry_SP",
  ]);
  if (spFirst) return spFirst;

  const nested = oddsFromNestedPriceObject(o.Price) || oddsFromNestedPriceObject(o.Odds);
  if (nested) return nested;

  const preRace = pickRunnerStr(r, ["WinOdds", "FixOdds", "MorningLine", "winOdds", "fixOdds", "morningLine"]);
  if (preRace) return preRace;

  const form = o.Form;
  if (Array.isArray(form) && form.length > 0) {
    const last = form[0] as Record<string, unknown>;
    const wsp = str(last.WSP);
    if (wsp) return wsp;
  }
  return "—";
}

function oddsFromRunner(r: PlanetSportRunnerRow): string {
  return oddsFromPlanetSportRunner(r);
}

function scratched(r: PlanetSportRunnerRow): boolean {
  const s = str(r.Scratched).toUpperCase();
  return s === "Y" || s === "TRUE";
}

function mapToRunners(
  rows: PlanetSportRunnerRow[],
  topTabs: Set<string>,
  api?: PlanetSportRacePayload,
): ParsedRacecardRunner[] {
  const out: ParsedRacecardRunner[] = [];
  let i = 0;
  for (const r of rows) {
    if (scratched(r)) continue;
    const horseName = str(r.HorseName);
    if (!horseName) continue;
    /** GetResults rows use `Tab`; GetRace often uses `RunnerTab`. */
    const tab = r.RunnerTab ?? r.Tab;
    const num =
      typeof tab === "number" && Number.isFinite(tab)
        ? String(tab)
        : str(tab) || String(++i);
    const silk = silkUrlFromPlanetSportRunner(r, api);
    const silkUrl = silk || undefined;
    out.push({
      id: `r-${num}-${horseName}`.replace(/\s+/g, "-").slice(0, 80),
      number: num,
      horseName,
      odds: oddsFromRunner(r),
      silkUrl,
      isTopPick: topTabs.has(num),
    });
    i += 1;
  }
  return out;
}

function topPickTabsFromSelections(selections: string): Set<string> {
  const s = new Set<string>();
  for (const part of selections.split(/[\s,-]+/)) {
    const t = part.trim();
    if (/^\d+$/.test(t)) s.add(t);
  }
  return s;
}

function topPickHorseNames(
  runners: ParsedRacecardRunner[],
  selections: string,
): string[] {
  if (!selections.trim()) return [];
  const byNum = new Map(runners.filter((x) => x.number).map((x) => [x.number!, x.horseName]));
  const names: string[] = [];
  for (const t of selections.split(/[-]/)) {
    const tab = t.trim();
    if (!/^\d+$/.test(tab)) continue;
    const name = byNum.get(tab);
    if (name) names.push(name);
  }
  return names;
}

/** Map PlanetSport `GetRace/{id}` JSON → preview template */
export function normalizePlanetSportGetRace(
  api: PlanetSportRacePayload,
  sourceUrl: string,
): RacecardTemplatePreview {
  const raceId = Number(api.RaceID);
  if (!Number.isFinite(raceId) || raceId <= 0) {
    throw new RacecardUrlImportError("The racecard is missing key data", "missing_race");
  }
  const rawRunners = api.Runners;
  if (!Array.isArray(rawRunners) || rawRunners.length === 0) {
    throw new RacecardUrlImportError("No valid runners were found", "no_runners");
  }
  const selections = str(api.Selections);
  const topTabs = topPickTabsFromSelections(selections);
  const runners = mapToRunners(rawRunners as PlanetSportRunnerRow[], topTabs, api);
  if (runners.length === 0) {
    throw new RacecardUrlImportError("No valid runners were found", "no_runners");
  }
  const course = str(api.Course) || "Unknown course";
  const raceTime = str(api.Time) || "—";
  const raceTitle = str(api.RaceName) || "Race";
  let topPicks = topPickHorseNames(runners, selections);
  if (topPicks.length === 0 && runners.length >= 2) {
    topPicks = [runners[0]!.horseName, runners[1]!.horseName];
  } else if (topPicks.length === 0 && runners.length === 1) {
    topPicks = [runners[0]!.horseName];
  }

  return {
    id: `import-${raceId}-${Date.now()}`,
    course,
    raceTime,
    raceTitle,
    runnerCount: runners.length,
    topPicks,
    runners,
    sourceType: "url",
    sourceUrl,
    rawSource: api,
    createdAt: new Date().toISOString(),
  };
}

/** Convert preview → `RacecardSnapshot` for editor / disk (caller sets `id`) */
export function racecardTemplatePreviewToSnapshot(
  preview: RacecardTemplatePreview,
  tplId: string,
): RacecardSnapshot {
  const api = preview.rawSource as PlanetSportRacePayload | undefined;
  const byTab = planetSportRunnersByTab(api);
  const runners: Runner[] = preview.runners.map((r, idx) => {
    const n = Number(r.number);
    const number = Number.isFinite(n) && n > 0 ? n : idx + 1;
    const silkUrl = resolvedSilkUrlForParsedRunner(r, api, byTab);
    const silks: RunnerSilks | undefined = silkUrl
      ? { imageUrl: silkUrl, provider: "import" }
      : undefined;
    return {
      number,
      horse: r.horseName,
      odds: r.odds && r.odds !== "—" ? r.odds : "—",
      silks,
    };
  });

  const race: Race = {
    id: String((preview.rawSource as PlanetSportRacePayload)?.RaceID ?? tplId),
    course: preview.course,
    raceTime: preview.raceTime,
    title: preview.raceTitle,
    distance: str((preview.rawSource as PlanetSportRacePayload)?.DisplayDistance) || "",
    going: str((preview.rawSource as PlanetSportRacePayload)?.RaceSOT) || "",
    runnersCount: runners.length,
    raceDate: str((preview.rawSource as PlanetSportRacePayload)?.Date) || undefined,
  };

  return {
    id: tplId,
    race,
    runners,
    topPicks: preview.topPicks.length ? preview.topPicks : runners.slice(0, 3).map((x) => x.horse),
    boardRunnersPerPage: 11,
    importSource: "url",
    sourceUrl: preview.sourceUrl,
    rawImport: preview.rawSource,
  };
}

export function validateRacecardTemplateForImport(preview: RacecardTemplatePreview): void {
  if (!preview.course?.trim()) {
    throw new RacecardUrlImportError("The racecard is missing key data", "missing_race");
  }
  if (!preview.raceTime?.trim()) {
    throw new RacecardUrlImportError("The racecard is missing key data", "missing_race");
  }
  if (!preview.raceTitle?.trim()) {
    throw new RacecardUrlImportError("The racecard is missing key data", "missing_race");
  }
  if (!preview.runners?.length) {
    throw new RacecardUrlImportError("No valid runners were found", "no_runners");
  }
  if (!preview.runners.some((r) => r.horseName?.trim())) {
    throw new RacecardUrlImportError("No valid runners were found", "no_runners");
  }
}

export async function fetchPlanetSportRaceJson(raceId: number): Promise<PlanetSportRacePayload> {
  const url = `${PLANETSPORT_BASE}/GetRace/${raceId}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new RacecardUrlImportError("We could not fetch data from this page", "blocked");
    }
    throw new RacecardUrlImportError("We could not fetch data from this page", "fetch_failed");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new RacecardUrlImportError("We found the page but could not parse a racecard", "parse_failed");
  }
  if (!data || typeof data !== "object") {
    throw new RacecardUrlImportError("We found the page but could not parse a racecard", "unsupported");
  }
  return data as PlanetSportRacePayload;
}

/** Fetch HTML (SPA shell) and resolve race id when query param missing */
export async function fetchRacecardSource(url: string): Promise<{ html: string; finalUrl: string }> {
  const u = validateRacecardUrl(url);
  const res = await fetch(u.toString(), {
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "PlanetSportStudioRacecardImport/1.0" },
    redirect: "follow",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new RacecardUrlImportError("We could not fetch data from this page", "fetch_failed");
  }
  const html = await res.text();
  return { html, finalUrl: res.url || u.toString() };
}

/** Resolve a display URL → PlanetSport `GetRace/{id}` JSON (shared by racecard + Next off / Fast results import). */
export async function fetchPlanetSportRacePayloadFromUrl(
  url: string,
): Promise<{ api: PlanetSportRacePayload; sourceUrl: string }> {
  const u = validateRacecardUrl(url);
  let raceId = extractPlanetSportRaceIdFromUrl(u);
  if (!raceId) {
    const pathInfo = parseRacing365MeetingTimeFromPath(u.pathname);
    if (pathInfo) {
      const hhmm = normalizeRacing365TimeSlug(pathInfo.timeSlug);
      if (hhmm) {
        try {
          raceId = await resolveRacing365CourseTimeToFetchId(pathInfo.kind, pathInfo.meetingSlug, hhmm);
        } catch (e) {
          if (e instanceof RacecardUrlImportError) throw e;
          raceId = null;
        }
      }
    }
  }
  let pageHtml = "";
  if (!raceId) {
    try {
      const { html } = await fetchRacecardSource(u.toString());
      pageHtml = html;
      const embedded = planetSportPayloadFromRacing365Html(html);
      if (embedded) return { api: embedded, sourceUrl: u.toString() };
      raceId = extractPlanetSportRaceIdFromHtml(html);
    } catch (e) {
      if (e instanceof RacecardUrlImportError) throw e;
      throw new RacecardUrlImportError("We could not fetch data from this page", "fetch_failed");
    }
  }
  if (!raceId) {
    throw new RacecardUrlImportError("We found the page but could not parse a racecard", "unsupported");
  }
  try {
    const api = await fetchPlanetSportRacePayloadFlexible(raceId);
    return { api, sourceUrl: u.toString() };
  } catch (e) {
    if (!(e instanceof RacecardUrlImportError) || (e.code !== "fetch_failed" && e.code !== "blocked")) throw e;
    if (!pageHtml) {
      const { html } = await fetchRacecardSource(u.toString());
      pageHtml = html;
    }
    const embedded = planetSportPayloadFromRacing365Html(pageHtml);
    if (!embedded) throw e;
    return { api: embedded, sourceUrl: u.toString() };
  }
}

/**
 * End-to-end: validate URL → fetch PlanetSport JSON (via raceId from URL or HTML) → preview.
 */
export async function parseRacecardFromUrl(url: string): Promise<RacecardTemplatePreview> {
  const { api, sourceUrl } = await fetchPlanetSportRacePayloadFromUrl(url);
  const preview = normalizePlanetSportGetRace(api, sourceUrl);
  validateRacecardTemplateForImport(preview);
  return preview;
}
