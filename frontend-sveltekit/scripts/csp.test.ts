import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  buildHeaders,
  inlineScripts,
  pagePolicy,
  posthogHosts,
  posthogScriptHosts,
  scriptHash,
  withPagePolicy,
} from './csp';

const off = {
  apiUrl: 'https://api.example.com/api',
  posthogKey: '',
  posthogHost: 'https://us.i.posthog.com',
  gaId: '',
};

describe('inline scripts', () => {
  it('finds executable inline scripts only', () => {
    const html = `<script>a()</script><script src="/x.js"></script><script type="application/json">{}</script><script type="module">b()</script>`;
    expect(inlineScripts(html)).toEqual(['a()', 'b()']);
  });

  it('hashes them as a CSP source', async () => {
    // echo -n "alert(1)" | openssl dgst -sha256 -binary | base64
    expect(await scriptHash('alert(1)')).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });
});

describe('the policy', () => {
  it('allows the API and the CAPTCHA, enforces, and reports to the backend', () => {
    const csp = buildCsp(off, {});
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;");
    expect(csp).toContain("connect-src 'self' https://api.example.com;");
    expect(csp).toContain('frame-src https://challenges.cloudflare.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('report-uri https://api.example.com/api/telemetry/csp');
    expect(csp).not.toMatch(/posthog|google|sha256/);
  });

  it("each page's own policy lists its inline scripts by hash, and nothing inline else", () => {
    const policy = pagePolicy(off, ["'sha256-abc'"], {});
    expect(policy).toBe(
      "script-src 'self' 'sha256-abc' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'",
    );
    expect(policy).not.toContain('unsafe-inline');
    const html =
      '<!doctype html><html><head lang="en"><meta charset="utf-8"><script>x()</script></head></html>';
    const out = withPagePolicy(html, policy);
    // First in <head>, before any script; written again (not twice) on a second build step.
    expect(out).toMatch(
      /<head lang="en"><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-abc'/,
    );
    expect(withPagePolicy(out, policy).match(/http-equiv/g)).toHaveLength(1);
  });

  it('adds PostHog and Google Analytics only when their keys are set', () => {
    const csp = buildCsp(
      { ...off, posthogKey: 'phc', posthogHost: 'https://eu.i.posthog.com', gaId: 'G-1' },
      {},
    );
    expect(csp).toMatch(/script-src[^;]*https:\/\/eu-assets\.i\.posthog\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/eu\.i\.posthog\.com/);
    expect(csp).toMatch(/script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.google-analytics\.com/);
    expect(posthogHosts('https://ph.example.com/')).toEqual(['https://ph.example.com']);
  });

  it('loads PostHog scripts from its assets host only, or from a proxy', () => {
    const csp = buildCsp({ ...off, posthogKey: 'phc', posthogHost: 'https://eu.i.posthog.com' }, {});
    expect(csp).not.toMatch(/script-src[^;]*https:\/\/eu\.i\.posthog\.com/);
    expect(posthogScriptHosts('https://us.i.posthog.com')).toEqual(['https://us-assets.i.posthog.com']);
    expect(posthogScriptHosts('https://ph.example.com')).toEqual(['https://ph.example.com']);
  });

  it("adds the app's own hosts (src/lib/app/csp.ts) to the header and each page's policy", () => {
    const app = { connect: ['https://maps.example.com'], script: ['https://js.example.com'] };
    expect(buildCsp(off, app)).toMatch(/connect-src[^;]*https:\/\/maps\.example\.com/);
    expect(pagePolicy(off, [], app)).toContain('https://js.example.com');
  });

  it('writes a _headers file Cloudflare Pages accepts', () => {
    const file = buildHeaders(off, {});
    expect(file).toMatch(/^\/\*$/m);
    expect(file).toContain('  Content-Security-Policy: ');
    expect(file).not.toContain('Report-Only');
    expect(file).toContain('  X-Content-Type-Options: nosniff');
    expect(file).toContain('  Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('  X-Frame-Options: DENY');
    expect(file).toContain('  Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(file).toContain('  Permissions-Policy: camera=()');
  });

  it('refuses a policy longer than Pages takes', () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `https://host-${String(i).padStart(20, 'x')}.example.com`,
    );
    expect(() => buildHeaders(off, { connect: many })).toThrow(/at most 2000/);
  });
});
