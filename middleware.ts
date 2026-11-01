import { NextResponse, type NextRequest } from "next/server";
import { stripAppPathPrefix, withAppPathPrefix } from "@/app/lib/app-base-path";

const SESSION_COOKIE = "plexa_session";
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/verify-email",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/player",
  "/embed/video",
  "/player",
  "/api/client-api",
  "/api/client-feeds",
  /** RSS Import Builder export URLs; auth is `?token=` matching export_token (no session). */
  "/api/rss-builder/public",
  "/api/cron",
  "/api/health",
  "/api/webhooks",
  "/api/integrations/mux/webhook",
  "/privacy-policy",
  "/terms",
  "/use-policy",
  "/_next",
  "/favicon.ico",
  "/brand",
];

function sessionSecret(): string {
  return process.env.PLEXA_SESSION_SECRET?.trim() || process.env.ADMIN_TOKEN?.trim() || "plexa-local-dev-session-secret-change-before-hosting";
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const bytes = Array.from(new Uint8Array(signature));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type SessionPayload = { exp?: number; userId?: string; role?: string };

async function validSession(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if ((await hmac(body)) !== signature) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionPayload;
    return payload.userId && payload.exp && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

function roleCanAccess(pathname: string, searchParams: URLSearchParams, role: string | undefined): boolean {
  if (!role || role === "admin" || role === "editor" || role === "viewer") return true;
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") return true;
  if (role === "meeting_guest") {
    return pathname.startsWith("/audio-studio/guests/")
      || pathname.startsWith("/api/audio/guests/sessions/")
      || pathname.startsWith("/api/auth/");
  }
  if (role === "meeting_host") {
    return pathname.startsWith("/audio-studio/guests/")
      || (pathname === "/audio-studio" && searchParams.get("tool") === "guests")
      || pathname.startsWith("/api/audio/guests/")
      || pathname.startsWith("/api/auth/");
  }
  if (role === "audio_user") {
    const tool = searchParams.get("tool");
    return (pathname === "/audio-studio" && (!tool || ["notes", "language", "text-to-speech"].includes(tool)))
      || pathname.startsWith("/api/audio/")
      || pathname.startsWith("/api/auth/");
  }
  if (role === "audio_editor") {
    const tool = searchParams.get("tool");
    return (pathname === "/audio-studio" && (!tool || ["voice-creator", "elevenlabs-editing"].includes(tool)))
      || pathname.startsWith("/api/audio/")
      || pathname.startsWith("/api/voice-options/")
      || pathname.startsWith("/api/auth/");
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const rawPath = request.nextUrl.pathname;
  const pathname = stripAppPathPrefix(rawPath);

  // Netlify background/serverless functions must not redirect to login (POST would become 405).
  if (pathname.startsWith("/.netlify/functions/")) return NextResponse.next();

  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (isPublicPath(pathname) || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
  const session = await validSession(request);
  if (session) {
    if (roleCanAccess(pathname, request.nextUrl.searchParams, session.role)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "This Plexa account does not have access to that area." }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = withAppPathPrefix(session.role === "meeting_guest" ? "/login" : "/audio-studio");
    if (session.role === "meeting_guest") url.searchParams.set("access", "meeting-only");
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = withAppPathPrefix("/login");
  url.search = "";
  url.searchParams.set("next", `${rawPath}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|\\.netlify/functions/).*)"],
};
