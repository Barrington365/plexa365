"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { R365Button } from "@/app/components/R365Button";
import { plexaAuthApiUrl } from "@/app/lib/auth/client-api-url";

const inputClass =
  "mt-2 w-full rounded-xl border bg-[var(--surface-muted)] px-3 py-3 text-base text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--focus)] focus:ring-2 focus:ring-[color:var(--focus)]/30";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const params = useSearchParams() ?? new URLSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(plexaAuthApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      window.location.replace(safeNextPath(params.get("next")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <label className="block text-sm font-semibold text-[color:var(--text-secondary)]">
        Email
        <input className={inputClass} name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block text-sm font-semibold text-[color:var(--text-secondary)]">
        Password
        <input className={inputClass} name="password" type="password" autoComplete="current-password" required />
      </label>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[color:var(--text-muted)]">Private access only</span>
        <Link href="/forgot-password" className="text-[color:var(--accent)] hover:underline">
          Forgot password?
        </Link>
      </div>
      <R365Button type="submit" disabled={busy} className="w-full py-3">
        {busy ? "Signing in..." : "Sign in"}
      </R365Button>
    </form>
  );
}
