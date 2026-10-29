// Before `npm run deploy` builds anything: refuse without an https PUBLIC_API_URL, read the
// way the build reads it (the shell first, then .env.production, .env). `npm run build` alone
// doesn't check, so local builds and the e2e tests keep using localhost.

import { loadEnv } from 'vite';
import { apiUrlProblem } from './api-url.ts';

const env = { ...loadEnv('production', process.cwd(), 'PUBLIC_'), ...process.env };
const problem = apiUrlProblem(env.PUBLIC_API_URL);
if (problem) {
  console.error(
    `deploy: ${problem}\nSet it to the backend's https address, e.g.\n  PUBLIC_API_URL=https://api.example.com/api npm run deploy`,
  );
  process.exit(1);
}
