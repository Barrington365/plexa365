import { describe, it, expect } from "vitest";
import { styleTimedNewsShortCaptions } from "./news-short-timed-caption-style";
import { buildNewsShortAss } from "@/app/features/content/news-short-ass";
import { getNewsShortBrandTemplateDefinition } from "@/app/features/news-shorts/news-shorts-brand-templates";

describe("timed brand captions", () => {
  it.each([["teamtalk", "&H00c0f52a&"], ["football365", "&H00f0e800&"]])("retains white and %s accent without changing speech timing", (brand, accent) => {
    const cues = styleTimedNewsShortCaptions([{startSec:1.23,endSec:3.45,text:"Reports suggest Chelsea may allow a"}], [{startSec:0,endSec:5,headline:"",subline:"",highlightWords:["Chelsea"]}]);
    expect(cues[0].highlightWords).toContain("Chelsea");
    expect(cues[0].startSec).toBe(1.23);
    expect(cues[0].endSec).toBe(3.45);
    const ass = buildNewsShortAss(cues, {...getNewsShortBrandTemplateDefinition(brand)!.buildTemplate().style,playResX:1920,playResY:1080});
    expect(ass).toContain(`{\\c${accent}}CHELSEA`);
    expect(ass).toContain("{\\c&H00ffffff&}MAY");
    expect(ass).toContain("0:00:01.23,0:00:03.45");
    expect(ass).toContain(brand === "teamtalk" ? "&H00262322&" : "&H38000000&");
  });
  it("uses only the overlapping scene's editor keywords", () => {
    const cues = styleTimedNewsShortCaptions([{startSec:6,endSec:7,text:"Chelsea could play Paris today"}], [
      {startSec:0,endSec:5,headline:"",subline:"",highlightWords:["today"]},
      {startSec:5,endSec:9,headline:"",subline:"",highlightWords:["Paris"]},
    ]);
    expect(cues[0].highlightWords[0]).toBe("Paris");
  });
});
