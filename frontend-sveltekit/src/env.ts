import { defineEnvVars } from '@sveltejs/kit/env';

// Every variable is read at build time and written into the files: a static build has nowhere
// to read it later. `scripts/postbuild.mjs` reads the same names to build `_headers` (scripts/csp.ts).
const optional = (value: string | undefined) => (value ?? '').trim();

export const variables = defineEnvVars({
  PUBLIC_API_URL: {
    public: true,
    static: true,
    description: 'The backend: the server URL from contract/openapi.yaml, ending in /api.',
    schema: (value) => (value || 'http://localhost:8787/api').replace(/\/+$/, ''),
  },
  PUBLIC_POSTHOG_KEY: {
    public: true,
    static: true,
    description: 'PostHog project key. Empty: PostHog is never loaded.',
    schema: optional,
  },
  PUBLIC_POSTHOG_HOST: {
    public: true,
    static: true,
    description: 'PostHog host, e.g. https://eu.i.posthog.com. Default https://us.i.posthog.com.',
    schema: (value) => (value || 'https://us.i.posthog.com').trim().replace(/\/+$/, ''),
  },
  PUBLIC_GA_ID: {
    public: true,
    static: true,
    description: 'Google Analytics 4 measurement id (G-…). Empty: Google Analytics is never loaded.',
    schema: optional,
  },
});
