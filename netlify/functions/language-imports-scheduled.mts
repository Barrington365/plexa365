// Netlify does not read vercel.json. This schedule calls the existing importer.
// CRON_SECRET must already be set on the site. This function does not print it.
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return new Response(JSON.stringify({ error: "Site URL is not configured." }), { status: 500 });
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(new URL("/api/cron/language-imports", base), { method: "POST", headers });
  const body = await response.text();
  return new Response(body, { status: response.status, headers: { "content-type": "application/json" } });
};
