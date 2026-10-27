import { describe, expect, it } from "vitest";
import { newsShortRenderedImageRef } from "@/app/lib/news-shorts-build-sources";

describe("newsShortRenderedImageRef", () => {
  it("uses the library blob path from a finished render", () => {
    expect(
      newsShortRenderedImageRef({
        path: "/tmp/lambda/output/images/abc/slide-1.png",
        rel: "images/library/abc/render-slide-1.png",
      }),
    ).toBe("images/library/abc/render-slide-1.png");
  });

  it("keeps a local path when no library rel was saved", () => {
    expect(newsShortRenderedImageRef({ path: "/tmp/slide.png" })).toBe("/tmp/slide.png");
  });

  it("rejects a library path that tries to leave the folder", () => {
    expect(
      newsShortRenderedImageRef({
        path: "/tmp/slide.png",
        rel: "images/library/../secret.png",
      }),
    ).toBe("/tmp/slide.png");
  });
});
