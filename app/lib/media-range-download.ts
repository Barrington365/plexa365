const RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/** Download a video by following byte ranges so a capped 206 response still saves the whole file. */
export async function collectByteRangeBody(url: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let start = 0;
  let total: number | null = null;

  for (let hop = 0; hop < 10_000; hop += 1) {
    const res = await fetchImpl(url, { headers: { Range: `bytes=${start}-` } });
    if (res.status === 200 && start === 0) {
      const body = new Uint8Array(await res.arrayBuffer());
      const declared = Number(res.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > 0 && body.byteLength !== declared) {
        throw new Error("Download ended before the complete video arrived.");
      }
      return body;
    }
    if (res.status !== 206) {
      throw new Error(`Download failed (${res.status}).`);
    }
    const match = RANGE_RE.exec(res.headers.get("Content-Range") ?? "");
    if (!match) throw new Error("Download response did not include a byte range.");
    const rangeStart = Number(match[1]);
    const rangeEnd = Number(match[2]);
    total = Number(match[3]);
    if (rangeStart !== start) throw new Error("Download range did not continue from the last byte.");
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.byteLength !== rangeEnd - rangeStart + 1) {
      throw new Error("Download chunk was shorter than its byte range.");
    }
    chunks.push(body);
    if (rangeEnd + 1 >= total) break;
    start = rangeEnd + 1;
  }

  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total == null || size !== total) throw new Error("Downloaded file is incomplete.");
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
