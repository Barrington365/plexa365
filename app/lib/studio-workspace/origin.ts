/** Netlify may reconstruct Request.url with its internal host/protocol. Only
 * configured deployment origins are trusted; never use Origin as a fetch target. */
export function workspaceOrigin(request: Request): string {
  for (const value of [process.env.URL, process.env.DEPLOY_PRIME_URL]) {
    if (!value) continue;
    try { const url = new URL(value); if (url.protocol === 'https:') return url.origin; } catch { /* ignore invalid configuration */ }
  }
  return new URL(request.url).origin;
}
export function isWorkspaceSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  const allowed = new Set([workspaceOrigin(request)]);
  for (const value of [process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    if (!value) continue;
    try { const url = new URL(value); if (url.protocol === 'https:') allowed.add(url.origin); } catch { /* ignore invalid configuration */ }
  }
  return allowed.has(origin);
}
