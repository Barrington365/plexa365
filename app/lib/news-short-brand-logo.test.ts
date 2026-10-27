import { expect, it } from "vitest";
import { renderHtmlTemplate } from "@/app/features/render/html-templates";
import { newsShortBrandLogoSvg } from "./news-short-brand-logo";

it.each(["football365", "teamtalk"])("keeps %s logo when captions replace slide text", brandTemplateId => {
  const html = renderHtmlTemplate("news-short-intro", { brandTemplateId, sourceName:`${brandTemplateId}.com`, headline:"Hidden slide headline", editorSubtitleOverlayOnly:true, width:1920, height:1080 });
  expect(html).toContain(`<div class="ns-brand-logo">${newsShortBrandLogoSvg(brandTemplateId)}</div>`);
  expect(html).toContain(`${brandTemplateId}.com`);
  expect(html).not.toContain('<h1 class="ns-headline">');
});
it("does not invent logos for other brands", () => expect(newsShortBrandLogoSvg("unknown")).toBe(""));
