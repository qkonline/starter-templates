// The backend address a deployed build may use. Every PUBLIC_* value is written into the files
// at build time, so a deploy without PUBLIC_API_URL would ship a site that calls
// http://localhost:8787 from people's browsers. Pure, so vitest checks it; predeploy.mjs and
// postbuild.mjs run it.

/** What's wrong with `value` as a deployed build's PUBLIC_API_URL, or null when it's fine. */
export function apiUrlProblem(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return 'PUBLIC_API_URL is not set; the build would call http://localhost:8787/api.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return `PUBLIC_API_URL is not an address: ${text}`;
  }
  if (url.protocol !== 'https:') return `PUBLIC_API_URL must be https:, not ${url.protocol} (${text}).`;
  return null;
}
