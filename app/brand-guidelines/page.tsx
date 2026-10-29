import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_SUITE } from "@/app/lib/brand";
import { BrandGuidelinesTab } from "@/app/prompts/BrandGuidelinesTab";

export const metadata: Metadata = {
  title: `Brand guidelines · ${BRAND_SUITE}`,
  description:
    "Per-brand guideline text for AI-assisted scripts and Runway prompts. Edit Planet Sport Studio, Racing365, TEAMtalk, PlanetF1, and F365.",
};

export default function BrandGuidelinesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white">Brand guidelines</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Per-brand text appended to relevant AI calls. Custom prompt strings live under{" "}
          <Link href="/prompts" className="font-semibold text-[#22c55e] hover:underline">
            Prompts
          </Link>
          .
        </p>
      </div>
      <p><Link href="/brand-kits" className="font-semibold underline">Open visual Brand Kits — logos, colours, typography and voices</Link></p><BrandGuidelinesTab />
    </div>
  );
}
