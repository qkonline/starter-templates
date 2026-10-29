// Support sessions end within the hour; suspended accounts have no sessions; which paths a support
// session is barred from; who is an admin; and teams handed on when an account goes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from '../test/fake-d1';
import { isAdmin, sessionFor, signedIn, startSession } from './account';
import { supportBarred } from './middleware';

afterEach(() => vi.useRealTimers());

describe('sessions', () => {
  it('a support session ends after its hour, and is gone from the list', async () => {
    const { ctx } = fakeCtx();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now: Date.now() });
    const token = await startSession(ctx, 'ann', 'Mac', { support: { expires: Date.now() + 3600_000 } });
    expect((await sessionFor(ctx, token))?.session.support).toBe(1);
    vi.useFakeTimers({ now: Date.now() + 3600_000 + 1000 });
    expect(await sessionFor(ctx, token)).toBeNull();
    expect(await ctx.db.sessions('ann')).toEqual([]);
  });

  it('the daily sweep ends support sessions that ran out, and leaves the rest', async () => {
    const { ctx } = fakeCtx();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now: Date.now() });
    await startSession(ctx, 'ann', 'Mac', { support: { expires: Date.now() - 1 } });
    await startSession(ctx, 'ann', 'Mac');
    await ctx.db.sweep(Date.now());
    expect((await ctx.db.sessions('ann')).map((s) => s.support)).toEqual([0]);
  });

  it('suspending ends every session, and a token made in the same moment is refused', async () => {
    const { ctx } = fakeCtx();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now: Date.now() });
    const before = await startSession(ctx, 'ann', 'Mac');
    await ctx.db.setSuspended('ann', true);
    const during = await startSession(ctx, 'ann', 'Mac');
    expect(await sessionFor(ctx, before)).toBeNull();
    expect(await sessionFor(ctx, during)).toBeNull();
    await ctx.db.setSuspended('ann', false);
    expect(await sessionFor(ctx, during)).not.toBeNull();
  });
});

describe('support sessions are barred from', () => {
  it('the account and security paths, not the rest', () => {
    for (const [m, p] of [
      ['PATCH', '/api/me'],
      ['DELETE', '/api/me'],
      ['PUT', '/api/me/password'],
      ['POST', '/api/me/email/confirm/send'],
      ['PUT', '/api/me/photo'],
      ['GET', '/api/me/export'],
      ['DELETE', '/api/me/sessions/abc'],
      ['GET', '/api/me/passkeys'],
      ['POST', '/api/me/push/test'],
    ])
      expect(supportBarred(m!, p!), `${m} ${p}`).toBe(true);
    for (const [m, p] of [
      ['GET', '/api/me'],
      ['GET', '/api/me/notifications'],
      ['POST', '/api/me/notifications/read'],
      ['GET', '/api/teams'],
      ['GET', '/api/me/pushy'],
    ])
      expect(supportBarred(m!, p!), `${m} ${p}`).toBe(false);
  });
});

describe('admins', () => {
  it('are listed, confirmed, and only with the admin area on', () => {
    const user = (email: string, verified: boolean) => ({ email, email_verified: verified ? 1 : 0 }) as never;
    const on = fakeCtx({ ADMIN: 'true', ADMIN_EMAILS: ' Boss@Example.test , other@example.test' }).ctx;
    const off = fakeCtx({ ADMIN_EMAILS: 'boss@example.test' }).ctx;
    expect(isAdmin(on, user('boss@example.test', true))).toBe(true);
    expect(isAdmin(on, user('boss@example.test', false))).toBe(false);
    expect(isAdmin(on, user('someone@example.test', true))).toBe(false);
    expect(isAdmin(off, user('boss@example.test', true))).toBe(false);
  });
});

describe('deleting an account with teams', () => {
  it('hands each team on: alone, it goes with its invites; else its longest-standing member leads', async () => {
    const { ctx } = fakeCtx({ TEAMS: 'true' });
    const now = 1_800_000_000_000;
    for (const id of ['ann', 'bob', 'cat']) await ctx.db.createUser({ id, email: `${id}@b.test`, verified: true, password: null, now });
    await ctx.db.createTeam({ id: 'alone', name: 'Alone', userId: 'ann', now });
    await ctx.db.createInvite({
      id: 'inv',
      team_id: 'alone',
      email: 'x@b.test',
      role: 'member',
      by_name: null,
      by_email: 'ann@b.test',
      created: now,
      sent: now,
      expires: now + 1e9,
      tokenHash: 'h',
    });
    await ctx.db.createTeam({ id: 'shared', name: 'Shared', userId: 'ann', now });
    await ctx.db.createInvite({ id: 'i2', team_id: 'shared', email: 'cat@b.test', role: 'member', by_name: null, by_email: 'ann@b.test', created: now, sent: now, expires: now + 1e9, tokenHash: 'h2' });
    await ctx.db.createInvite({ id: 'i3', team_id: 'shared', email: 'bob@b.test', role: 'member', by_name: null, by_email: 'ann@b.test', created: now, sent: now, expires: now + 1e9, tokenHash: 'h3' });
    // Bob joins first, Cat later.
    expect(await ctx.db.acceptInvite('i3', 'bob', 'bob@b.test', now + 1)).not.toBeNull();
    expect(await ctx.db.acceptInvite('i2', 'cat', 'cat@b.test', now + 2)).not.toBeNull();
    expect(await ctx.db.acceptInvite('i2', 'cat', 'cat@b.test', now + 3)).toBeNull();

    await ctx.db.deleteUser('ann');
    expect((await ctx.db.members('shared')).map((m) => [m.user_id, m.role])).toEqual([
      ['bob', 'admin'],
      ['cat', 'member'],
    ]);
    expect(await ctx.db.teamOf('alone', 'ann')).toBeNull();
    expect(await ctx.db.invite('inv')).toBeNull();
    expect((await ctx.db.teamsOf('bob')).map((t) => t.id)).toEqual(['shared']);
  });

  it('the last admin can neither step down nor leave', async () => {
    const { ctx } = fakeCtx();
    const now = Date.now();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    await ctx.db.createTeam({ id: 't', name: 'T', userId: 'ann', now });
    expect(await ctx.db.setRole('t', 'ann', 'member')).toBe('last_admin');
    expect(await ctx.db.removeMember('t', 'ann')).toBe('last_admin');
    expect(await ctx.db.setRole('t', 'nobody', 'member')).toBe('gone');
  });
});

describe('taking an address back (PRD R1.8)', () => {
  const now = 1_800_000_000_000;
  async function squatted(verified: boolean) {
    const { ctx, db } = fakeCtx({ VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' });
    await ctx.db.createUser({ id: 'sq', email: 'owner@b.test', verified, password: 'pbkdf2-sha256$10$x$y', now });
    await ctx.db.addPasskey({ id: 'pk', user_id: 'sq', public_key: 'k', counter: 0, transports: null, device: 'Mac', created: now });
    await ctx.db.savePushSub({ endpoint: 'https://fcm.googleapis.com/fcm/send/sq', userId: 'sq', p256dh: 'p', auth: 'a', now });
    await ctx.db.saveChallenge({ id: 'ch', challenge: 'c', userId: 'sq', purpose: 'add', expires: now + 1e9, now });
    await ctx.db.saveOAuthCode({ hash: 'oc', userId: 'sq', isNew: false, expires: now + 1e9, now });
    await ctx.db.putCode({ key: 'change|sq|elsewhere@b.test', hash: 'h', sent: now, expires: now + 1e9 });
    await ctx.db.putCode({ key: 'confirm|sq', hash: 'h', sent: now, expires: now + 1e9 });
    await ctx.db.putCode({ key: 'change|sqz|other@b.test', hash: 'h', sent: now, expires: now + 1e9 });
    await startSession(ctx, 'sq', 'Mac');
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    return { ctx, db, count };
  }

  it('from an unconfirmed account clears its passkeys, push, challenges, codes and sessions', async () => {
    const { ctx, db, count } = await squatted(false);
    await ctx.db.claimAccount('sq', null);
    for (const table of ['passkeys', 'push_subs', 'challenges', 'oauth_codes', 'sessions']) expect(count(table), table).toBe(0);
    // Another account's code, whose id merely starts the same, stays.
    expect(db.prepare('SELECT key FROM codes').all()).toEqual([{ key: 'change|sqz|other@b.test' }]);
    expect(await ctx.db.userById('sq')).toMatchObject({ email_verified: 1, password: null, auth_epoch: 1 });
  });

  it('on a confirmed account (a plain reset) keeps its passkeys and push, and ends its sessions', async () => {
    const { ctx, count } = await squatted(true);
    await ctx.db.claimAccount('sq', 'new');
    expect(count('passkeys')).toBe(1);
    expect(count('push_subs')).toBe(1);
    expect(count('sessions')).toBe(0);
  });
});

describe('a sign-in racing a change of who may sign in', () => {
  it("can't make a session once the address is taken back or the password changed", async () => {
    const { ctx } = fakeCtx();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: false, password: 'old', now: Date.now() });
    // The sign-in read the account (and checked its password) here…
    const read = (await ctx.db.userById('ann'))!;
    // …then the owner reset it before the session was made.
    await ctx.db.claimAccount('ann', 'new');
    expect(await startSession(ctx, 'ann', 'Mac', { epoch: read.auth_epoch })).toBeNull();
    await expect(signedIn(ctx, read, 'Mac', false, { epoch: read.auth_epoch })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(await ctx.db.sessions('ann')).toEqual([]);

    const now = (await ctx.db.userById('ann'))!;
    const keep = (await startSession(ctx, 'ann', 'Mac', { epoch: now.auth_epoch }))!;
    const kept = (await sessionFor(ctx, keep))!.session;
    await ctx.db.changePassword('ann', 'newer', kept.id);
    expect(await startSession(ctx, 'ann', 'Mac', { epoch: now.auth_epoch })).toBeNull();
    // The device that changed it stays signed in.
    expect(await sessionFor(ctx, keep)).not.toBeNull();
  });

  it('a rehash at sign-in changes nothing', async () => {
    const { ctx } = fakeCtx();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: 'old', now: Date.now() });
    const read = (await ctx.db.userById('ann'))!;
    await ctx.db.setPassword('ann', 'rehashed');
    expect(await startSession(ctx, 'ann', 'Mac', { epoch: read.auth_epoch })).not.toBeNull();
  });
});

describe('a session unused for a year (PRD R1.11)', () => {
  const YEAR = 365 * 24 * 3600_000;

  it('stops working on use', async () => {
    const { ctx } = fakeCtx();
    const now = Date.now();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    const token = (await startSession(ctx, 'ann', 'Mac'))!;
    vi.useFakeTimers({ now: now + YEAR - 60_000 });
    expect(await sessionFor(ctx, token)).not.toBeNull();
    // Used just now, so it has another year from here.
    vi.useFakeTimers({ now: now + 2 * YEAR - 120_000 });
    expect(await sessionFor(ctx, token)).not.toBeNull();
    vi.useFakeTimers({ now: now + 3 * YEAR });
    expect(await sessionFor(ctx, token)).toBeNull();
  });

  it('is removed by the daily sweep without anyone using it', async () => {
    const { ctx } = fakeCtx();
    const now = Date.now();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    await startSession(ctx, 'ann', 'Mac');
    await ctx.db.sweep(now + YEAR - 1000);
    expect(await ctx.db.sessions('ann')).toHaveLength(1);
    await ctx.db.sweep(now + YEAR + 1000);
    expect(await ctx.db.sessions('ann')).toEqual([]);
  });
});

describe('deleting an account', () => {
  it('takes its contact messages, and keeps its error reports without it', async () => {
    const { ctx, db } = fakeCtx();
    const now = Date.now();
    await ctx.db.createUser({ id: 'ann', email: 'ann@b.test', verified: true, password: null, now });
    await ctx.db.addMessage({ id: 'm', kind: 'contact', name: null, email: 'ann@b.test', user_id: 'ann', message: 'Hi', page: null, status: 'open', created: now });
    await ctx.db.recordReport({ id: 'r', signature: 's', kind: 'client', message: 'Boom', detail: null, url: null, release: null, userId: 'ann' }, now);
    await ctx.db.putCode({ key: 'change|ann|new@b.test', hash: 'h', sent: now, expires: now + 1e9 });
    await ctx.db.deleteUser('ann');
    expect(db.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT user_id FROM reports').all()).toEqual([{ user_id: null }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM codes').get()).toEqual({ n: 0 });
  });
});
