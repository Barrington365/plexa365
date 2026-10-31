import Link from "next/link";
import { Montserrat } from "next/font/google";
import { BRAND_MARK, BRAND_SLOGAN } from "@/app/lib/brand";
import { AuthControls } from "@/app/components/AuthControls";
import { AppNavLink } from "@/app/components/AppNavLink";
import { StudiosNavMenu } from "@/app/components/StudiosNavMenu";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { PlexaAssistant } from "@/app/components/PlexaAssistant";

/** Geometric sans aligned with the logo wordmark style (see /brand/plexa-logo.png). */
const plexaFont = Montserrat({
  subsets: ["latin"],
  weight: ["600", "800"],
  display: "swap",
});

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/#studios", label: "Studios", scroll: true },
  { href: "/match-report-builder/reports", label: "Reports" },
  { href: "/configure", label: "Configure" },
  { href: "/library", label: "Library" },
  { href: "/editing-studio", label: "Schedule" },
  { href: "/tools", label: "Tools" },
  { href: "/admin/reports", label: "R&D" },
  { href: "/admin", label: "Admin" },
];

const footerLinks = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/match-report-builder/reports", label: "Match Reports" },
  { href: "/configure", label: "Configure" },
  { href: "/tools", label: "Tools" },
  { href: "/admin/provider-keys-and-platform-services", label: "Integrations" },
  { href: "/editing-studio", label: "Schedule Studio" },
  { href: "/live", label: "Live Control" },
  { href: "/prompts", label: "Prompts" },
  { href: "/brand-guidelines", label: "Brand Guidelines" },
  { href: "/guard-rails", label: "Guard Rails" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/use-policy", label: "Use Policy" },
  { href: "/docs/news-shorts-manual", label: "News Shorts manual" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[color:var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[color:var(--accent-foreground)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
      >
        Skip to main content
      </a>
      <header
        className="app-shell-header border-b backdrop-blur sticky top-0 z-50"
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <div className="flex min-w-0 flex-col gap-1 leading-tight">
              <span
                className={`${plexaFont.className} text-lg font-extrabold tracking-[0.08em] sm:text-xl lg:text-2xl`}
                style={{ color: "var(--heading-brand)" }}
              >
                {BRAND_MARK}
              </span>
              <span
                className={`${plexaFont.className} hidden text-[11px] font-semibold tracking-[0.04em] sm:block`}
                style={{ color: "var(--text-muted)" }}
              >
                {BRAND_SLOGAN}
              </span>
            </div>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <nav className="hidden flex-wrap items-center gap-1 rounded-full border bg-[color:var(--surface-muted)] p-1 text-sm md:flex" style={{ borderColor: "var(--border)" }} aria-label="Primary">
              <AppNavLink
                href="/"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Dashboard
              </AppNavLink>
              <StudiosNavMenu />
              <AppNavLink
                href="/match-report-builder/reports"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Match Reports
              </AppNavLink>
              <PlexaAssistant triggerLabel="Ask Plexa" />
              <AppNavLink
                href="/configure"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Configure
              </AppNavLink>
              <AppNavLink
                href="/library"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Library
              </AppNavLink>
              <AppNavLink
                href="/editing-studio"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Schedule
              </AppNavLink>
              <AppNavLink
                href="/tools"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Tools
              </AppNavLink>
              <AppNavLink
                href="/admin/reports"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                R&D
              </AppNavLink>
              <AppNavLink
                href="/admin"
                className="app-nav-link rounded-full px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                Admin
              </AppNavLink>
            </nav>
            <div className="hidden xl:block">
              <ThemeToggle />
            </div>
            <AuthControls />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 pb-32 outline-none sm:px-6 sm:py-8 lg:px-8 lg:pb-8"
      >
        {children}
      </main>
      <nav className="mobile-tab-bar fixed inset-x-0 bottom-0 z-50 border-t px-2 py-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {nav.map((n) =>
            "scroll" in n && n.scroll ? (
              <Link
                key={n.href}
                href={n.href}
                className="app-nav-link rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {n.label}
              </Link>
            ) : (
              <AppNavLink
                key={n.href}
                href={n.href}
                className="app-nav-link rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {n.label}
              </AppNavLink>
            ),
          )}
          <PlexaAssistant
            triggerLabel="Ask Plexa"
            triggerClassName="app-nav-link rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px]"
          />
        </div>
      </nav>
      <footer className="hidden border-t md:block" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <nav className="flex flex-wrap gap-2 text-sm">
            {footerLinks.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="app-nav-link rounded-md px-3 py-2 transition"
                style={{ color: "var(--text-secondary)" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Theme
            </span>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
