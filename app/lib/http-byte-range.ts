/** Keep each video response under the hosted function body cap (~6MB). */
export const VIDEO_RANGE_CHUNK_BYTES = 4 * 1024 * 1024;
/** A complete response is safe only while the file itself fits under that cap. */
export const VIDEO_FULL_BODY_MAX_BYTES = 5_500_000;

export type VideoByteRangePlan =
  | { ok: true; status: 200 | 206; start: number; end: number; total: number }
  | { ok: false; status: 416; total: number };

function cappedEnd(start: number, requestedEnd: number, total: number, chunkBytes: number): number {
  return Math.min(requestedEnd, total - 1, start + chunkBytes - 1);
}

/**
 * Plan a video response. Open-ended `bytes=0-` on a file that fits is the whole file.
 * Larger files, and every other range, stay inside one chunk so the host cannot truncate them.
 */
export function planVideoByteRange(
  rangeHeader: string | null | undefined,
  total: number,
  options?: { chunkBytes?: number; fullBodyMax?: number },
): VideoByteRangePlan {
  const chunkBytes = Math.max(1, options?.chunkBytes ?? VIDEO_RANGE_CHUNK_BYTES);
  const fullBodyMax = Math.max(chunkBytes, options?.fullBodyMax ?? VIDEO_FULL_BODY_MAX_BYTES);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, status: 416, total: 0 };

  const header = rangeHeader?.trim() ?? "";
  if (!header) {
    if (total <= fullBodyMax) return { ok: true, status: 200, start: 0, end: total - 1, total };
    return { ok: true, status: 206, start: 0, end: chunkBytes - 1, total };
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (match[1] === "" && match[2] === "")) return { ok: false, status: 416, total };

  let start: number;
  let requestedEnd: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { ok: false, status: 416, total };
    start = Math.max(0, total - suffix);
    requestedEnd = total - 1;
  } else {
    start = Number(match[1]);
    requestedEnd = match[2] === "" ? total - 1 : Number(match[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start < 0 || start >= total || requestedEnd < start) {
    return { ok: false, status: 416, total };
  }

  const wholeFile =
    start === 0 && requestedEnd >= total - 1 && total <= fullBodyMax;
  if (wholeFile) return { ok: true, status: 200, start: 0, end: total - 1, total };

  const end = cappedEnd(start, requestedEnd, total, chunkBytes);
  return { ok: true, status: 206, start, end, total };
}

export function videoByteRangeHeaders(
  plan: Extract<VideoByteRangePlan, { ok: true }>,
  contentType: string,
  filename?: string,
  download?: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(plan.end - plan.start + 1),
  };
  if (plan.status === 206) {
    headers["Content-Range"] = `bytes ${plan.start}-${plan.end}/${plan.total}`;
  }
  if (filename) {
    headers["Content-Disposition"] = `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`;
  }
  return headers;
}
