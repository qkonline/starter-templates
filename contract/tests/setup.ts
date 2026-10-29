// Before any test: a backend must be up at API_URL, with dev mail on, or nothing below means
// anything. Says which, rather than letting every test fail on its own.

import { API } from './api';

export async function setup() {
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`No backend answering at ${API}/health. Start one, or set API_URL.`);
  const mail = await fetch(`${API}/dev/mail`);
  if (!mail.ok)
    throw new Error(
      `${API}/dev/mail answered ${mail.status}. Run the backend with dev mail on and no mail provider, so the tests can read codes.`,
    );
}
