import { football365LogoHorizontalSvg } from "./football365-brand";
import { teamtalkLogoHorizontalSvg } from "./teamtalk-brand";

/** Existing Studio brand artwork, shared by preview and rendered frames. */
export function newsShortBrandLogoSvg(brandId: string): string {
  if (brandId === "football365") return football365LogoHorizontalSvg();
  if (brandId === "teamtalk") return teamtalkLogoHorizontalSvg();
  return "";
}

export const NEWS_SHORT_BRAND_LOGO_CSS = "position:absolute;left:4%;top:6%;width:26%;max-width:400px;padding:10px 14px;background:rgba(15,18,23,0.86);border-radius:8px;z-index:6;line-height:0;";
