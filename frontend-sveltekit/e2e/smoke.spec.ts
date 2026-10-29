// Sign up → account → change name → sign out → sign in, against a real backend.
import { expect, test } from '@playwright/test';
import { backendUp, confirmEmail, passGate, signUp, uniqueEmail } from './helpers';

test.beforeAll(async () => {
  test.skip(!(await backendUp()), 'No backend at API_URL: start one, then run again.');
});

test('sign up, rename, sign out, sign in again', async ({ page }) => {
  const email = uniqueEmail('smoke');
  const password = 'correct horse battery';

  await signUp(page, email, password);

  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();

  await page.getByLabel('Name').fill('  Ada   Lovelace ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Ada Lovelace');

  // This device is listed under Devices.
  await expect(page.getByText('This device', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signin$/);
  expect(await page.evaluate(() => localStorage.getItem('starter:token'))).toBeNull();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await passGate(page, email);
  await expect(page.getByRole('heading', { name: 'Hello, Ada Lovelace.' })).toBeVisible();
});

test('a wrong password shows the backend’s message', async ({ page }) => {
  const email = uniqueEmail('wrong');
  await signUp(page, email, 'right password 1');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong password 1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/signin$/);
});

test('a passkey added on the account signs in', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Virtual authenticators need Chromium.');
  // A virtual authenticator answers passkey autofill at once, which would sign in before the
  // button is pressed; switch autofill off so the test takes the button path.
  await page.addInitScript(() => {
    Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', { value: undefined });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = uniqueEmail('passkey');
  await signUp(page, email, 'passkey test pw');
  await confirmEmail(page, email);
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /^Hello/ })).toBeVisible();
});
