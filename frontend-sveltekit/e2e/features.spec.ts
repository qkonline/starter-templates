// The optional parts against a real backend (PRD sections 4 to 7): contact, feedback, display
// preferences, teams with an emailed invite, the bell, and the admin area with a support
// session. Skips when the backend (or its /features) isn't there yet.
import { expect, test } from '@playwright/test';
import {
  API_URL,
  confirmEmail,
  features,
  latestInviteToken,
  passGate,
  signIn,
  signUp,
  uniqueEmail,
} from './helpers';

let on: Awaited<ReturnType<typeof features>> = null;

test.beforeAll(async () => {
  on = await features();
  test.skip(!on, `No /features at ${API_URL}: start a backend that has it, then run again.`);
});

const password = 'correct horse battery';

test('contact, signed out', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Email').fill(uniqueEmail('contact'));
  await page.getByLabel('Message').fill('Hello from the e2e tests.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Thank you. Your message is on its way')).toBeVisible();
});

test('the signed-in app opens with no connection, from what the device kept', async ({ context, page }) => {
  await signUp(page, uniqueEmail('offline'), password);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByRole('heading', { name: /^Hello/ })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Hello/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Can’t reach the app' })).toHaveCount(0);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('a copy of the app the backend no longer serves is asked to update', async ({ page }) => {
  await signUp(page, uniqueEmail('outdated'), password);
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 426,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'client_outdated', message: 'This version of the app is out of date.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Update needed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update now' })).toBeVisible();
});

test('feedback from inside the app, and display preferences', async ({ page }) => {
  await signUp(page, uniqueEmail('feedback'), password);
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await page.getByLabel('What’s on your mind?').fill('The e2e tests like this page.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto('/account');
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByText('Larger', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text', 'xl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fusion');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('a team, an emailed invite accepted after signing up, and the last admin', async ({ browser }) => {
  test.skip(!on?.teams, 'Teams are off in this backend.');
  const adminEmail = uniqueEmail('team-admin');
  const memberEmail = uniqueEmail('team-member');

  const a = await (await browser.newContext()).newPage();
  await signUp(a, adminEmail, password);
  await confirmEmail(a, adminEmail);
  await a.getByRole('link', { name: 'Teams' }).click();
  // The account page (where confirmEmail left us) has a Name field too: wait for Teams first.
  await expect(a.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  await a.getByLabel('Name').fill('E2E team');
  await a.getByRole('button', { name: 'Make the team' }).click();
  await expect(a.getByRole('heading', { name: 'E2E team', level: 1 })).toBeVisible();
  await expect(a).toHaveURL(/\/team\?id=/);

  await a.getByLabel('Email').fill(memberEmail);
  await a.getByRole('button', { name: 'Send invite' }).click();
  await expect(a.getByText('Invite sent.')).toBeVisible();
  await expect(a.getByText(memberEmail)).toBeVisible();

  // The only admin can't leave: the page says what to do instead.
  await expect(a.getByText('Make someone else an admin first, or delete the team.')).toBeVisible();

  // The invitee opens the link signed out, signs up, and comes back to join.
  const token = await latestInviteToken(memberEmail);
  const b = await (await browser.newContext()).newPage();
  await b.goto(`/invite?token=${encodeURIComponent(token)}`);
  await expect(b.getByRole('heading', { name: 'You’re invited to a team' })).toBeVisible();
  await b.getByRole('link', { name: 'Create an account' }).click();
  await b.getByLabel('Email').fill(memberEmail);
  await b.getByLabel('Password', { exact: true }).fill(password);
  await b.getByRole('button', { name: 'Create account' }).click();
  await expect(b).toHaveURL(/\/invite\?token=/);
  await b.getByRole('button', { name: 'Join the team' }).click();
  await expect(b.getByRole('heading', { name: 'E2E team', level: 1 })).toBeVisible();

  // The member can leave; the admin sees them go.
  await b.getByRole('button', { name: 'Leave', exact: true }).click();
  await b.getByRole('button', { name: 'Leave E2E team' }).click();
  await expect(b).toHaveURL(/\/teams$/);

  await a.reload();
  await expect(a.getByText(memberEmail)).toHaveCount(0);
  await a.context().close();
  await b.context().close();
});

test('the bell shows a notification for an invite to an existing account', async ({ browser }) => {
  test.skip(!on?.teams, 'Teams are off in this backend.');
  const inviter = uniqueEmail('bell-a');
  const invitee = uniqueEmail('bell-b');
  const b = await (await browser.newContext()).newPage();
  await signUp(b, invitee, password);

  const a = await (await browser.newContext()).newPage();
  await signUp(a, inviter, password);
  await confirmEmail(a, inviter);
  await a.goto('/teams');
  await a.getByLabel('Name').fill('Bell team');
  await a.getByRole('button', { name: 'Make the team' }).click();
  await a.getByLabel('Email').fill(invitee);
  await a.getByRole('button', { name: 'Send invite' }).click();
  await expect(a.getByText('Invite sent.')).toBeVisible();

  await b.reload();
  const bell = b.getByRole('button', { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(b.getByRole('region', { name: 'Notifications' }).getByRole('listitem')).not.toHaveCount(0);
  await b.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(b.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await a.context().close();
  await b.context().close();
});

test('admin: find someone, open a support session in its own tab, end it', async ({ browser }) => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  test.skip(
    !on?.admin || !adminEmail || !adminPassword,
    'Needs the admin area on, and E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD of a confirmed admin.',
  );

  const personEmail = uniqueEmail('supported');
  const p = await (await browser.newContext()).newPage();
  await signUp(p, personEmail, password);
  await p.context().close();

  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto('/signin');
  await signIn(admin, adminEmail!, adminPassword!);
  await passGate(admin, adminEmail!);
  await admin.getByRole('link', { name: 'Admin' }).click();
  await expect(admin.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await admin.getByRole('link', { name: 'People' }).click();
  await admin.getByLabel('Find by email or name').fill(personEmail);
  // The search runs a moment after typing, and the person is also on the unfiltered first
  // page (newest first), so wait for the list to narrow to them alone.
  const row = admin.locator('li.person');
  await expect(row).toHaveCount(1);
  await expect(row.getByText(personEmail)).toBeVisible();
  const adminToken = await admin.evaluate(() => localStorage.getItem('starter:token'));

  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    row.getByRole('button', { name: 'Support sign-in' }).click(),
  ]);
  await expect(tab.getByText(`Support session as ${personEmail}`)).toBeVisible();
  // The session is this tab's alone; the admin's own is as it was.
  expect(await tab.evaluate(() => sessionStorage.getItem('starter:support'))).toContain(personEmail);
  expect(await tab.evaluate(() => localStorage.getItem('starter:token'))).toBe(adminToken);
  await tab.goto('/account');
  await expect(tab.getByText('This is a support session.')).toBeVisible();
  await tab.getByRole('button', { name: 'End support session' }).first().click();
  await expect(tab.getByRole('heading', { name: 'Support session ended' })).toBeVisible();

  await admin.reload();
  await expect(admin.getByRole('heading', { name: 'People' })).toBeVisible();
  await context.close();
});
