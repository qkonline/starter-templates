import { expect, type Page } from '@playwright/test';

export const API_URL = (
  process.env.API_URL ??
  process.env.PUBLIC_API_URL ??
  'http://localhost:8787/api'
).replace(/\/$/, '');

export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export async function backendUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`)).ok;
  } catch {
    return false;
  }
}

/** The newest six-digit code mailed to `to`, from the backend's dev outbox. */
export async function latestCode(to: string, after = 0): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${API_URL}/dev/mail`);
    const { mail } = (await res.json()) as { mail: { to: string; text: string }[] };
    const mine = mail.filter((m) => m.to.toLowerCase() === to.toLowerCase());
    if (mine.length > after) {
      const code = mine.at(-1)!.text.match(/\b(\d{3}\s?\d{3})\b/)?.[1];
      if (code) return code.replace(/\s/g, '');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No code mailed to ${to}`);
}

export async function mailCount(to: string): Promise<number> {
  const res = await fetch(`${API_URL}/dev/mail`);
  const { mail } = (await res.json()) as { mail: { to: string }[] };
  return mail.filter((m) => m.to.toLowerCase() === to.toLowerCase()).length;
}

/** Sign up through the UI, confirming the email if the app requires it. Ends on the home page. */
export async function signUp(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await passGate(page, email);
}

/** If the app holds unconfirmed accounts back, confirm with the mailed code. */
export async function passGate(page: Page, email: string): Promise<void> {
  const gate = page.getByRole('heading', { name: 'Confirm your email' });
  const home = page.getByRole('heading', { name: /^Hello/ });
  await expect(gate.or(home)).toBeVisible();
  if (await gate.isVisible()) {
    await page.getByLabel('Code').fill(await latestCode(email));
    await page.getByRole('button', { name: 'Confirm email' }).click();
    await expect(home).toBeVisible();
  }
}

/**
 * Confirm the email from the account page, unless it already is: adding a passkey and sending
 * team invites need a confirmed email whatever `requireVerifiedEmail` says. Ends on /account.
 */
export async function confirmEmail(page: Page, email: string): Promise<void> {
  await page.goto('/account');
  const section = page.locator('#email');
  await expect(section.getByRole('heading', { name: 'Email', exact: true })).toBeVisible();
  const confirmed = section.getByText('Confirmed', { exact: true });
  if (await confirmed.isVisible()) return;
  const send = section.getByRole('button', { name: 'Send code' });
  let after = 0;
  if (await send.isVisible()) {
    after = await mailCount(email);
    await send.click();
  }
  await section.getByLabel('Code').fill(await latestCode(email, after));
  await section.getByRole('button', { name: 'Confirm email' }).click();
  await expect(confirmed).toBeVisible();
}

/** Whether the backend has the optional parts' paths (`/features`), and which are on. */
export async function features(): Promise<{
  teams: boolean;
  admin: boolean;
  push: { vapidPublicKey: string } | null;
} | null> {
  try {
    const res = await fetch(`${API_URL}/features`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The newest invite link mailed to `to`, from the backend's dev outbox. */
export async function latestInviteToken(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${API_URL}/dev/mail`);
    const { mail } = (await res.json()) as { mail: { to: string; text: string }[] };
    const mine = mail.filter((m) => m.to.toLowerCase() === to.toLowerCase());
    const token = mine.at(-1)?.text.match(/\/invite\?token=([^\s&"'<>]+)/)?.[1];
    if (token) return decodeURIComponent(token);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No invite mailed to ${to}`);
}

/** Sign in through the UI. Ends wherever `next` (or the home page) leads. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
