import { describe, expect, it } from "vitest";
import { landscapeStatus } from "@/app/lib/video-search/candidates";
import { authorisedClipFfmpegArgs, parseClipSelection } from "@/app/lib/video-search/clip";
import { importAuthorisedClip, type FootageRightsRecord } from "@/app/lib/video-search/rights";
import { selectStoryCandidates } from "@/app/lib/video-search/stories";
import type { VideoCandidate } from "@/app/lib/video-search/candidates";

const approved: FootageRightsRecord = {
  videoId: "abcdefghijk",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "Owned training clip",
  creator: "Planet Sport",
  status: "approved",
  evidence: "Written licence PSF-2026-11 covers this file.",
  source: "Planet Sport rights desk",
  scope: "Commercial news use, editing and distribution on Planet Sport players.",
  commercialUse: true,
  editingRights: true,
  distributionRights: true,
  sourceFileRef: "video/owned.mp4",
  expiresAt: "2027-01-01",
  approvedBy: "Rights editor",
  brand: "TEAMtalk",
  article: "January striker",
  projectId: "hollywoodbets-live",
  subjects: ["Manchester United"],
  updatedAt: "2026-11-07T13:00:00.000Z",
};

describe("video search rights", () => {
  it("rejects a pending record and a checkbox-sized note", () => {
    expect(importAuthorisedClip({ record: { ...approved, status: "pending" }, authorisedFileRel: "video/owned.mp4" }).allowed).toBe(false);
    expect(importAuthorisedClip({ record: { ...approved, evidence: "yes" }, authorisedFileRel: "video/owned.mp4" }).allowed).toBe(false);
  });

  it("rejects approved YouTube footage that has no library file", () => {
    const result = importAuthorisedClip({ record: { ...approved, sourceFileRef: "" }, now: "2026-11-07T00:00:00.000Z" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/not downloaded/);
  });

  it("rejects approval when commercial, editing, or distribution rights are not recorded", () => {
    expect(importAuthorisedClip({ record: { ...approved, commercialUse: false }, authorisedFileRel: "video/owned.mp4", now: "2026-11-07T00:00:00.000Z" }).allowed).toBe(false);
    expect(importAuthorisedClip({ record: { ...approved, editingRights: false }, authorisedFileRel: "video/owned.mp4", now: "2026-11-07T00:00:00.000Z" }).allowed).toBe(false);
    expect(importAuthorisedClip({ record: { ...approved, distributionRights: false }, authorisedFileRel: "video/owned.mp4", now: "2026-11-07T00:00:00.000Z" }).allowed).toBe(false);
  });

  it("allows an approved library file whose scope covers commercial editing and distribution", () => {
    expect(importAuthorisedClip({ record: approved, authorisedFileRel: "video/owned.mp4", now: "2026-11-07T00:00:00.000Z" }).allowed).toBe(true);
  });

  it("rejects an expired licence and a rejected record", () => {
    expect(importAuthorisedClip({ record: { ...approved, expiresAt: "2026-01-01" }, authorisedFileRel: "video/owned.mp4", now: "2026-11-07T00:00:00.000Z" }).allowed).toBe(false);
    expect(importAuthorisedClip({ record: { ...approved, status: "rejected" }, authorisedFileRel: "video/owned.mp4" }).allowed).toBe(false);
  });
});

describe("story candidates", () => {
  const row = (title: string, videoId: string): VideoCandidate => ({
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    creator: "Sky Sports",
    durationLabel: "3:10",
    landscape: "unverified",
    landscapeLabel: "Landscape not verified",
    rightsStatus: "pending",
    discovery: "youtube",
  });

  it("keeps named people and drops an unrelated club video", () => {
    const picked = selectStoryCandidates([
      row("Manchester United training", "aaaaaaaaaaa"),
      row("Fabrizio Romano on the January striker", "bbbbbbbbbbb"),
      row("Luke Shaw interview", "ccccccccccc"),
    ], ["romano", "shaw", "striker"], 5);
    expect(picked.map((item) => item.videoId)).toEqual(["bbbbbbbbbbb", "ccccccccccc"]);
  });
});

describe("landscape", () => {
  it("does not treat a standard YouTube watch URL as verified landscape", () => {
    expect(landscapeStatus({ url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Press conference" })).toBe("unverified");
    expect(landscapeStatus({ url: "https://www.youtube.com/shorts/abcdefghijk", title: "Vertical clip" })).toBe("vertical");
  });
});

describe("clip selection", () => {
  it("prepares a 10 second 1920x1080 mp4 plan without fetching a URL", () => {
    const parsed = parseClipSelection(15, 25);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.clip).toMatchObject({ durationSeconds: 10, width: 1920, height: 1080, format: "mp4" });
    expect(authorisedClipFfmpegArgs({ file: "video/owned.mp4", clip: parsed.clip, output: "video/clip.mp4" })).toContain("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2");
  });
});
