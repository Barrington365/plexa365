import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";
import { BRAND_MARK, BRAND_SLOGAN, BRAND_SUITE } from "@/app/lib/brand";

export const metadata = {
  title: `Login · ${BRAND_SUITE}`,
};

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh items-center justify-center overflow-y-auto bg-[var(--background)] px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[color:var(--accent)]">{BRAND_MARK}</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[color:var(--text-primary)]">Sign in</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">{BRAND_SLOGAN}</p>
        </div>
        <section
          className="rounded-3xl border p-5 sm:p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <Suspense fallback={<p className="text-sm text-slate-500">Loading login...</p>}>
            <LoginForm />
          </Suspense>
        </section>
        <p className="text-center text-xs text-[color:var(--text-muted)]">
          First admin?{" "}
          <Link href="/setup" className="font-semibold text-[color:var(--accent)] hover:underline">
            Open setup
          </Link>
        </p>
      </div>
    </div>
  );
}
