// What every contract test uses: calling the backend, checking each reply against openapi.yaml,
// and signing in through the dev outbox.

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { expect } from 'vitest';
import { cleanEmail, passwordKey, type PasswordSettings } from '../password';

import { API } from './api';
export { API };

const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
const SPEC_ID = 'https://starter.local/openapi.json';
// The whole spec as one schema document, so the refs inside it resolve. Its non-schema keywords
// (paths, responses…) are ignored rather than refused.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema({ ...spec, $id: SPEC_ID });

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface Reply {
  status: number;
  headers: Headers;
  body: any;
}

export async function call(
  method: Method,
  path: string,
  opts: { token?: string; json?: unknown; bytes?: Uint8Array<ArrayBuffer>; type?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.bytes) {
    headers['content-type'] = opts.type ?? 'application/octet-stream';
    body = opts.bytes;
  }
  const res = await fetch(API + path, { method: method.toUpperCase(), headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

function at(pointer: string): any {
  return pointer
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
}

/**
 * The reply has this status, the contract lists that status for this operation, and the body has
 * exactly the shape the contract gives it (`specPath` is the path as written in openapi.yaml).
 */
export function expectReply(r: Reply, method: Method, specPath: string, status: number) {
  const where = `${method.toUpperCase()} ${specPath}`;
  expect(r.status, `${where}: ${JSON.stringify(r.body)}`).toBe(status);
  let pointer = `#/paths/${esc(specPath)}/${method}/responses/${status}`;
  let declared = at(pointer);
  if (!declared) throw new Error(`The contract doesn't list ${status} for ${where}.`);
  if (declared.$ref) {
    pointer = declared.$ref;
    declared = at(pointer);
  }
  if (!declared.content) {
    expect(r.body, `${where} ${status} has no body in the contract`).toBeNull();
    return;
  }
  const validate = ajv.getSchema(`${SPEC_ID}${pointer}/content/${esc('application/json')}/schema`);
  if (!validate) throw new Error(`No JSON schema for ${where} ${status}.`);
  if (!validate(r.body)) {
    throw new Error(`${where} ${status} doesn't match the contract:\n${ajv.errorsText(validate.errors, { separator: '\n' })}\n${JSON.stringify(r.body, null, 2)}`);
  }
}

/** The reply is this contract error. */
export function expectError(r: Reply, method: Method, specPath: string, status: number, code: string) {
  expectReply(r, method, specPath, status);
  expect(r.body.code).toBe(code);
  expect(r.body.message.length).toBeGreaterThan(0);
}

/** An address no test has used. */
export const freshEmail = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** This backend's sign-in settings, read once. */
export const methods = (await call('get', '/auth/methods')).body as {
  password: PasswordSettings & { minLength: number };
  emailCode: boolean;
  oauth: string[];
  captcha: { provider: string; siteKey: string } | null;
  requireVerifiedEmail: boolean;
};

/**
 * What a CAPTCHA-protected request carries. Backends in local development use Turnstile's test
 * secret, which accepts this dummy token.
 */
export const captcha = () => (methods.captcha ? { captcha: 'XXXX.DUMMY.TOKEN.XXXX' } : {});

/** Which optional parts this backend has on, read once like `methods`. */
export const features = (await call('get', '/features')).body as {
  teams: boolean;
  admin: boolean;
  push: { vapidPublicKey: string } | null;
};

/** The password key for this backend's settings. */
export const keyFor = (password: string, email: string) => passwordKey(password, email, methods.password);

const mailTo = async (to: string) =>
  ((await call('get', '/dev/mail')).body?.mail ?? []).filter((m: { to: string }) => m.to === cleanEmail(to)) as { text: string }[];

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Do `send`, then find the new email to `to` whose text matches `pattern`; its first group. New
 * means a text not there before: the outbox keeps only the last 500, so other tests' mail can push
 * older mail out while this waits, and counting would miss it.
 */
export async function mailed<T>(to: string, pattern: RegExp, send: () => Promise<T>): Promise<{ reply: T; found: string }> {
  const before = new Set((await mailTo(to)).map((m) => m.text));
  const reply = await send();
  for (let i = 0; i < 30; i++) {
    const found = (await mailTo(to))
      .filter((m) => !before.has(m.text))
      .map((m) => m.text.match(pattern)?.[1])
      .findLast(Boolean);
    if (found) return { reply, found };
    await wait(100);
  }
  throw new Error(`No new email to ${to} matching ${pattern}.`);
}

/** Do `send`, then read the six-digit code from the email it made to `to`. */
export async function codeFrom(to: string, send: () => Promise<unknown>): Promise<string> {
  return (await mailed(to, /\b(\d{6})\b/, send)).found;
}

export interface Signed {
  token: string;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    hasPassword: boolean;
    name: string | null;
    photoUrl: string | null;
    createdAt: string;
    isAdmin: boolean;
  };
  isNew: boolean;
}

/** The password most tests use. */
export const PASSWORD = 'correct horse battery staple';

/** Make an account with a password, signed in. No email is sent unless the app requires confirming. */
export async function signUp(email = freshEmail(), password = PASSWORD): Promise<Signed & { email: string; key: string }> {
  const key = await keyFor(password, email);
  const r = await call('post', '/auth/password/signup', { json: { email, passwordKey: key, ...captcha() } });
  expectReply(r, 'post', '/auth/password/signup', 200);
  return { ...r.body, email, key };
}

/** Sign in to an existing account with its password: another device. */
export async function signIn(email: string, password = PASSWORD): Promise<Signed> {
  const r = await call('post', '/auth/password/signin', { json: { email, passwordKey: await keyFor(password, email), ...captcha() } });
  expectReply(r, 'post', '/auth/password/signin', 200);
  return r.body;
}

/** Confirm a signed-in account's address with the code emailed to it. Its user as now. */
export async function confirm(s: { token: string; email?: string; user: { email: string } }): Promise<Signed['user']> {
  const email = s.email ?? s.user.email;
  const code = await codeFrom(email, () => call('post', '/me/email/confirm/send', { token: s.token }));
  const r = await call('post', '/me/email/confirm', { token: s.token, json: { code } });
  expectReply(r, 'post', '/me/email/confirm', 200);
  return r.body.user;
}

/** An account the backend lists as an admin (ADMIN_EMAILS); the tests sign in as it. */
export const ADMIN_EMAIL = cleanEmail(process.env.ADMIN_EMAIL ?? 'admin@example.test');

/**
 * Signed in as the admin, its email confirmed (admins are only confirmed accounts). The account
 * persists across runs: signed up the first time, signed in after. Files run side by side, so
 * another may be making or confirming it at the same moment; this waits for that rather than
 * failing.
 */
export async function asAdmin(): Promise<Signed> {
  const json = async () => ({ email: ADMIN_EMAIL, passwordKey: await keyFor(PASSWORD, ADMIN_EMAIL), ...captcha() });
  for (let i = 0; i < 100; i++) {
    let r = await call('post', '/auth/password/signin', { json: await json() });
    if (r.status === 400 && r.body?.code === 'invalid_credentials') r = await call('post', '/auth/password/signup', { json: await json() });
    if (r.status !== 200) {
      // Someone else is making it right now (email_taken), or a try was refused: again.
      await wait(200);
      continue;
    }
    const s = r.body as Signed;
    if (s.user.emailVerified) return s;
    const before = new Set((await mailTo(ADMIN_EMAIL)).map((m) => m.text));
    const sent = await call('post', '/me/email/confirm/send', { token: s.token });
    if (sent.status === 204) {
      for (let j = 0; j < 30; j++) {
        const code = (await mailTo(ADMIN_EMAIL))
          .filter((m) => !before.has(m.text))
          .map((m) => m.text.match(/\b(\d{6})\b/)?.[1])
          .findLast(Boolean);
        if (code) {
          const done = await call('post', '/me/email/confirm', { token: s.token, json: { code } });
          if (done.status === 200) return { ...s, user: done.body.user };
          break;
        }
        await wait(100);
      }
    }
    // Another file's code is on its way (the 60-second gap), or theirs replaced ours: look again.
    await wait(300);
  }
  throw new Error(`Couldn't sign in as the admin ${ADMIN_EMAIL}.`);
}
