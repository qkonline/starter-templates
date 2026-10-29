// Teams (optional): admins and members, invites by email, and never a team without an admin.
// With teams off, `features.test.ts` checks they answer `not_found`.

import { describe, expect, test } from 'vitest';
import { call, confirm, expectError, expectReply, features, freshEmail, mailed, type Reply, signUp } from './lib';

type Person = Awaited<ReturnType<typeof signUp>>;

const makeTeam = async (token: string, name = 'Team') => {
  const r = await call('post', '/teams', { token, json: { name } });
  expectReply(r, 'post', '/teams', 200);
  return r.body.team as { id: string; name: string; role: string; memberCount: number };
};
const getTeam = (token: string, id: string) => call('get', `/teams/${id}`, { token });

/** Invite `email`; the invite and the token from the emailed link. */
async function invite(admin: Person, teamId: string, email: string, role = 'member') {
  const { reply, found } = await mailed(email, /[?&]token=([A-Za-z0-9_-]+)/, () =>
    call('post', `/teams/${teamId}/invites`, { token: admin.token, json: { email, role } }),
  );
  expectReply(reply, 'post', '/teams/{teamId}/invites', 200);
  return { invite: reply.body.invite as { id: string }, token: found };
}

/** An account that may invite: only a confirmed email can. */
async function admin(): Promise<Person> {
  const p = await signUp();
  await confirm(p);
  return p;
}

const accept = (token: string, json: unknown) => call('post', '/invites/accept', { token, json });

/** Bring `person` into the team by the emailed link. */
async function join(admin: Person, teamId: string, person: Person, role = 'member') {
  const { token } = await invite(admin, teamId, person.email, role);
  expectReply(await accept(person.token, { token }), 'post', '/invites/accept', 200);
}

const setRole = (token: string, teamId: string, userId: string, role: string) =>
  call('patch', `/teams/${teamId}/members/${userId}`, { token, json: { role } });
const remove = (token: string, teamId: string, userId: string) => call('delete', `/teams/${teamId}/members/${userId}`, { token });

async function members(token: string, teamId: string) {
  const r = await getTeam(token, teamId);
  expectReply(r, 'get', '/teams/{teamId}', 200);
  return r.body.members as { userId: string; role: string }[];
}
const admins = async (token: string, teamId: string) => (await members(token, teamId)).filter((m) => m.role === 'admin');

describe.skipIf(!features.teams)('teams', () => {
  describe('making and naming', () => {
    test('the maker is its admin; the name is tidied', async () => {
      const a = await admin();
      const team = await makeTeam(a.token, '  The   Team ');
      expect(team).toMatchObject({ name: 'The Team', role: 'admin', memberCount: 1 });
      const r = await call('get', '/teams', { token: a.token });
      expectReply(r, 'get', '/teams', 200);
      expect(r.body.teams).toEqual([team]);
      const one = await getTeam(a.token, team.id);
      expectReply(one, 'get', '/teams/{teamId}', 200);
      expect(one.body.team).toEqual(team);
      expect(one.body.members).toEqual([expect.objectContaining({ userId: a.user.id, email: a.email, role: 'admin' })]);
      expect(one.body.invites).toEqual([]);

      const renamed = await call('patch', `/teams/${team.id}`, { token: a.token, json: { name: 'Renamed' } });
      expectReply(renamed, 'patch', '/teams/{teamId}', 200);
      expect(renamed.body.team.name).toBe('Renamed');
    });

    test('a name that is empty, too long, or not text', async () => {
      const a = await admin();
      for (const name of ['', '   ', 'x'.repeat(61), 7, null])
        expectError(await call('post', '/teams', { token: a.token, json: { name } }), 'post', '/teams', 400, 'invalid_input');
      const team = await makeTeam(a.token);
      expectError(await call('patch', `/teams/${team.id}`, { token: a.token, json: { name: '' } }), 'patch', '/teams/{teamId}', 400, 'invalid_input');
    });

    test('at most 50 teams per person', async () => {
      const a = await admin();
      for (let i = 0; i < 50; i++) await makeTeam(a.token, `Team ${i}`);
      expectError(await call('post', '/teams', { token: a.token, json: { name: 'One too many' } }), 'post', '/teams', 400, 'invalid_input');
    }, 30_000);

    test("a team one isn't in is not there, the same as one that never was", async () => {
      const a = await admin();
      const b = await signUp();
      const team = await makeTeam(a.token);
      for (const id of [team.id, 'no-such-team']) {
        expectError(await getTeam(b.token, id), 'get', '/teams/{teamId}', 404, 'not_found');
        expectError(await call('patch', `/teams/${id}`, { token: b.token, json: { name: 'Mine' } }), 'patch', '/teams/{teamId}', 404, 'not_found');
        expectError(await call('delete', `/teams/${id}`, { token: b.token }), 'delete', '/teams/{teamId}', 404, 'not_found');
        expectError(
          await call('post', `/teams/${id}/invites`, { token: b.token, json: { email: freshEmail(), role: 'member' } }),
          'post',
          '/teams/{teamId}/invites',
          404,
          'not_found',
        );
      }
    });

    test('signed out', async () => {
      expectError(await call('get', '/teams'), 'get', '/teams', 401, 'signed_out');
      expectError(await call('post', '/teams', { json: { name: 'x' } }), 'post', '/teams', 401, 'signed_out');
      expectError(await call('get', '/invites'), 'get', '/invites', 401, 'signed_out');
    });
  });

  describe('admins and members', () => {
    test("members use the team; only admins change it, and they don't see its invites", async () => {
      const a = await admin();
      const m = await signUp();
      const team = await makeTeam(a.token);
      await join(a, team.id, m);
      await invite(a, team.id, freshEmail());

      const seen = await getTeam(m.token, team.id);
      expectReply(seen, 'get', '/teams/{teamId}', 200);
      expect(seen.body.team).toMatchObject({ role: 'member', memberCount: 2 });
      expect(seen.body.invites).toEqual([]);
      expect((await getTeam(a.token, team.id)).body.invites).toHaveLength(1);

      expectError(await call('patch', `/teams/${team.id}`, { token: m.token, json: { name: 'Mine' } }), 'patch', '/teams/{teamId}', 403, 'forbidden');
      expectError(await call('delete', `/teams/${team.id}`, { token: m.token }), 'delete', '/teams/{teamId}', 403, 'forbidden');
      expectError(
        await call('post', `/teams/${team.id}/invites`, { token: m.token, json: { email: freshEmail(), role: 'member' } }),
        'post',
        '/teams/{teamId}/invites',
        403,
        'forbidden',
      );
      expectError(await setRole(m.token, team.id, m.user.id, 'admin'), 'patch', '/teams/{teamId}/members/{userId}', 403, 'forbidden');
      expectError(await remove(m.token, team.id, a.user.id), 'delete', '/teams/{teamId}/members/{userId}', 403, 'forbidden');
    });

    test('roles change; a member is removed, or leaves', async () => {
      const a = await admin();
      const b = await signUp();
      const c = await signUp();
      const team = await makeTeam(a.token);
      await join(a, team.id, b);
      await join(a, team.id, c);

      const up = await setRole(a.token, team.id, b.user.id, 'admin');
      expectReply(up, 'patch', '/teams/{teamId}/members/{userId}', 200);
      expect(up.body.member).toMatchObject({ userId: b.user.id, role: 'admin', email: b.email });
      expectError(await setRole(a.token, team.id, b.user.id, 'owner'), 'patch', '/teams/{teamId}/members/{userId}', 400, 'invalid_input');
      expectError(await setRole(a.token, team.id, 'no-such-person', 'admin'), 'patch', '/teams/{teamId}/members/{userId}', 404, 'not_found');

      expectReply(await remove(b.token, team.id, c.user.id), 'delete', '/teams/{teamId}/members/{userId}', 204);
      expectError(await getTeam(c.token, team.id), 'get', '/teams/{teamId}', 404, 'not_found');
      expectError(await remove(a.token, team.id, c.user.id), 'delete', '/teams/{teamId}/members/{userId}', 404, 'not_found');

      expectReply(await remove(b.token, team.id, b.user.id), 'delete', '/teams/{teamId}/members/{userId}', 204);
      expect((await call('get', '/teams', { token: b.token })).body.teams).toEqual([]);
      expect((await getTeam(a.token, team.id)).body.team.memberCount).toBe(1);
    });

    test('deleting the team takes its members and invites with it', async () => {
      const a = await admin();
      const m = await signUp();
      const team = await makeTeam(a.token);
      await join(a, team.id, m);
      const pending = await invite(a, team.id, freshEmail());
      expectReply(await call('delete', `/teams/${team.id}`, { token: a.token }), 'delete', '/teams/{teamId}', 204);
      expectError(await getTeam(m.token, team.id), 'get', '/teams/{teamId}', 404, 'not_found');
      expect((await call('get', '/teams', { token: m.token })).body.teams).toEqual([]);
      const late = await signUp();
      expectError(await accept(late.token, { token: pending.token }), 'post', '/invites/accept', 404, 'not_found');
    });
  });

  describe('never without an admin', () => {
    test('the only admin can neither step down nor leave', async () => {
      const a = await admin();
      const m = await signUp();
      const team = await makeTeam(a.token);
      await join(a, team.id, m);
      expectError(await setRole(a.token, team.id, a.user.id, 'member'), 'patch', '/teams/{teamId}/members/{userId}', 409, 'last_admin');
      expectError(await remove(a.token, team.id, a.user.id), 'delete', '/teams/{teamId}/members/{userId}', 409, 'last_admin');
      expect(await admins(a.token, team.id)).toHaveLength(1);
    });

    test('five admins stepping down at once leave exactly one', async () => {
      const a = await admin();
      const team = await makeTeam(a.token);
      const others = await Promise.all(Array.from({ length: 4 }, () => signUp()));
      for (const o of others) await join(a, team.id, o, 'admin');
      const all = [a, ...others];
      const replies = await Promise.all(all.map((p) => setRole(p.token, team.id, p.user.id, 'member')));
      expect(replies.filter((r) => r.status === 200)).toHaveLength(4);
      const refused = replies.filter((r) => r.status !== 200);
      expect(refused).toHaveLength(1);
      expectError(refused[0]!, 'patch', '/teams/{teamId}/members/{userId}', 409, 'last_admin');
      const left = all[replies.findIndex((r) => r.status !== 200)]!;
      expect(await admins(left.token, team.id)).toEqual([expect.objectContaining({ userId: left.user.id })]);
    });

    test('two admins demoting each other at once leave one', async () => {
      for (let round = 0; round < 3; round++) {
        const a = await admin();
        const b = await signUp();
        const team = await makeTeam(a.token);
        await join(a, team.id, b, 'admin');
        const [ra, rb] = await Promise.all([setRole(a.token, team.id, b.user.id, 'member'), setRole(b.token, team.id, a.user.id, 'member')]);
        const ok = [ra, rb].filter((r) => r.status === 200);
        expect(ok).toHaveLength(1);
        const other = [ra, rb].find((r) => r.status !== 200)!;
        // The loser is refused as the last admin, or, if the winner got there first, as no longer one.
        expect([409, 403]).toContain(other.status);
        expectError(other, 'patch', '/teams/{teamId}/members/{userId}', other.status, other.status === 409 ? 'last_admin' : 'forbidden');
        expect(await admins(a.token, team.id)).toHaveLength(1);
      }
    });

    test('four admins leaving at once leave one', async () => {
      const a = await admin();
      const team = await makeTeam(a.token);
      const others = await Promise.all(Array.from({ length: 3 }, () => signUp()));
      for (const o of others) await join(a, team.id, o, 'admin');
      const m = await signUp();
      await join(a, team.id, m);
      const all = [a, ...others];
      const replies: Reply[] = await Promise.all(all.map((p) => remove(p.token, team.id, p.user.id)));
      expect(replies.filter((r) => r.status === 204)).toHaveLength(3);
      const refused = replies.filter((r) => r.status !== 204);
      expect(refused).toHaveLength(1);
      expectError(refused[0]!, 'delete', '/teams/{teamId}/members/{userId}', 409, 'last_admin');
      expect(await admins(m.token, team.id)).toHaveLength(1);
      expect((await getTeam(m.token, team.id)).body.team.memberCount).toBe(2);
    });

    test('deleting an account hands its teams on: alone, the team goes; else the longest-standing member leads', async () => {
      const a = await admin();
      const b = await signUp();
      const c = await signUp();
      const x = await signUp();
      await confirm(x);
      const alone = await makeTeam(a.token, 'Alone');
      const pending = await invite(a, alone.id, x.email);
      const shared = await makeTeam(a.token, 'Shared');
      await join(a, shared.id, b);
      await join(a, shared.id, c);

      expectReply(await call('delete', '/me', { token: a.token }), 'delete', '/me', 204);

      const after = await members(b.token, shared.id);
      expect(after).toHaveLength(2);
      expect(after.find((m) => m.userId === b.user.id)?.role).toBe('admin');
      expect(after.find((m) => m.userId === c.user.id)?.role).toBe('member');
      expect((await getTeam(b.token, shared.id)).body.team).toMatchObject({ role: 'admin', memberCount: 2 });

      // The team they were alone in went, with its invites.
      expect((await call('get', '/invites', { token: x.token })).body.invites).toEqual([]);
      expectError(await accept(x.token, { token: pending.token }), 'post', '/invites/accept', 404, 'not_found');
    });
  });

  describe('invites', () => {
    test('the emailed link proves the address: an unconfirmed account joins, and is confirmed', async () => {
      const a = await admin();
      const team = await makeTeam(a.token, 'Linked');
      const p = await signUp();
      expect(p.user.emailVerified).toBe(false);
      const { invite: sent, token } = await invite(a, team.id, p.email, 'admin');
      expect(sent).toMatchObject({ email: p.email, role: 'admin', invitedBy: { email: a.email, name: null } });
      const listed = await getTeam(a.token, team.id);
      expect(listed.body.invites).toEqual([sent]);

      const r = await accept(p.token, { token });
      expectReply(r, 'post', '/invites/accept', 200);
      expect(r.body.team).toMatchObject({ id: team.id, name: 'Linked', role: 'admin', memberCount: 2 });
      expect((await call('get', '/me', { token: p.token })).body.user.emailVerified).toBe(true);
      expect((await getTeam(a.token, team.id)).body.invites).toEqual([]);
      // It works once.
      expectError(await accept(p.token, { token }), 'post', '/invites/accept', 404, 'not_found');
    });

    test('in the app, invites show only to a confirmed email, and only it can accept by id', async () => {
      const a = await admin();
      const team = await makeTeam(a.token, 'Listed');
      const p = await signUp();
      const { invite: sent } = await invite(a, team.id, p.email);

      const hidden = await call('get', '/invites', { token: p.token });
      expectReply(hidden, 'get', '/invites', 200);
      expect(hidden.body.invites).toEqual([]);
      expectError(await accept(p.token, { inviteId: sent.id }), 'post', '/invites/accept', 404, 'not_found');
      expectError(await call('post', `/invites/${sent.id}/decline`, { token: p.token }), 'post', '/invites/{inviteId}/decline', 404, 'not_found');

      await confirm(p);
      const shown = await call('get', '/invites', { token: p.token });
      expectReply(shown, 'get', '/invites', 200);
      expect(shown.body.invites).toEqual([
        expect.objectContaining({ id: sent.id, team: { id: team.id, name: 'Listed' }, role: 'member', invitedBy: { name: null, email: a.email } }),
      ]);
      const r = await accept(p.token, { inviteId: sent.id });
      expectReply(r, 'post', '/invites/accept', 200);
      expect(r.body.team).toMatchObject({ id: team.id, role: 'member' });
      expectError(await accept(p.token, { inviteId: sent.id }), 'post', '/invites/accept', 404, 'not_found');
      expect((await call('get', '/invites', { token: p.token })).body.invites).toEqual([]);
    });

    test('the wrong account gets not_found, by link or by id', async () => {
      const a = await admin();
      const team = await makeTeam(a.token);
      const p = await signUp();
      const other = await signUp();
      await confirm(other);
      const { invite: sent, token } = await invite(a, team.id, p.email);
      expectError(await accept(other.token, { token }), 'post', '/invites/accept', 404, 'not_found');
      expectError(await accept(other.token, { inviteId: sent.id }), 'post', '/invites/accept', 404, 'not_found');
      expectError(await call('post', `/invites/${sent.id}/decline`, { token: other.token }), 'post', '/invites/{inviteId}/decline', 404, 'not_found');
      expectError(await accept(a.token, { token }), 'post', '/invites/accept', 404, 'not_found');
      // Still there for the right one.
      expectReply(await accept(p.token, { token }), 'post', '/invites/accept', 200);
    });

    test('declined and withdrawn invites are gone', async () => {
      const a = await admin();
      const team = await makeTeam(a.token);
      const p = await signUp();
      await confirm(p);
      const first = await invite(a, team.id, p.email);
      expectReply(await call('post', `/invites/${first.invite.id}/decline`, { token: p.token }), 'post', '/invites/{inviteId}/decline', 204);
      expect((await call('get', '/invites', { token: p.token })).body.invites).toEqual([]);
      expectError(await accept(p.token, { token: first.token }), 'post', '/invites/accept', 404, 'not_found');

      const second = await invite(a, team.id, p.email);
      expectReply(await call('delete', `/teams/${team.id}/invites/${second.invite.id}`, { token: a.token }), 'delete', '/teams/{teamId}/invites/{inviteId}', 204);
      expectError(await accept(p.token, { token: second.token }), 'post', '/invites/accept', 404, 'not_found');
      expectError(await call('delete', `/teams/${team.id}/invites/${second.invite.id}`, { token: a.token }), 'delete', '/teams/{teamId}/invites/{inviteId}', 404, 'not_found');
    });

    test('someone already in, or already invited, and addresses that are not', async () => {
      const a = await admin();
      const team = await makeTeam(a.token);
      const send = (email: unknown, role: unknown = 'member') => call('post', `/teams/${team.id}/invites`, { token: a.token, json: { email, role } });
      expectError(await send(a.email), 'post', '/teams/{teamId}/invites', 409, 'conflict');
      const email = freshEmail();
      expectReply(await send(email), 'post', '/teams/{teamId}/invites', 200);
      expectError(await send(email.toUpperCase()), 'post', '/teams/{teamId}/invites', 409, 'conflict');
      expectError(await send('nobody'), 'post', '/teams/{teamId}/invites', 400, 'invalid_input');
      expectError(await send(freshEmail(), 'owner'), 'post', '/teams/{teamId}/invites', 400, 'invalid_input');
    });

    test('only a confirmed email may invite', async () => {
      const u = await signUp();
      const team = await makeTeam(u.token);
      const r = await call('post', `/teams/${team.id}/invites`, { token: u.token, json: { email: freshEmail(), role: 'member' } });
      expectError(r, 'post', '/teams/{teamId}/invites', 403, 'email_unverified');
      await confirm(u);
      await invite(u, team.id, freshEmail());
    });

    test("an invite to an account's address also notifies it", async () => {
      const a = await admin();
      const p = await signUp();
      const team = await makeTeam(a.token, 'Noticed');
      await invite(a, team.id, p.email);
      const r = await call('get', '/me/notifications', { token: p.token });
      expectReply(r, 'get', '/me/notifications', 200);
      expect(r.body.notifications).toHaveLength(1);
      expect(r.body.unread).toBe(1);
    });

    test('accepting needs a link or an id, nothing else', async () => {
      const p = await signUp();
      for (const json of [{}, { token: 'x', inviteId: 'y' }, { token: 7 }, { inviteId: 'a b' }])
        expectError(await accept(p.token, json), 'post', '/invites/accept', 400, 'invalid_input');
      expectError(await accept(p.token, { token: 'never-given' }), 'post', '/invites/accept', 404, 'not_found');
    });

    test(
      'resending: not within a minute; after it, a fresh link and the old one stops working',
      async () => {
        const a = await admin();
        const team = await makeTeam(a.token);
        const p = await signUp();
        const first = await invite(a, team.id, p.email);
        const resend = () => call('post', `/teams/${team.id}/invites/${first.invite.id}/resend`, { token: a.token });
        const early = await resend();
        expectError(early, 'post', '/teams/{teamId}/invites/{inviteId}/resend', 429, 'rate_limited');
        // A minute, or less where a local backend shortens the gap; Retry-After says.
        const wait = Number(early.headers.get('retry-after'));
        expect(wait).toBeGreaterThan(0);
        await new Promise((ok) => setTimeout(ok, wait * 1000 + 500));
        const { reply, found } = await mailed(p.email, /[?&]token=([A-Za-z0-9_-]+)/, resend);
        expectReply(reply, 'post', '/teams/{teamId}/invites/{inviteId}/resend', 204);
        expect(found).not.toBe(first.token);
        expectError(await accept(p.token, { token: first.token }), 'post', '/invites/accept', 404, 'not_found');
        expectReply(await accept(p.token, { token: found }), 'post', '/invites/accept', 200);
        expectError(
          await call('post', `/teams/${team.id}/invites/${first.invite.id}/resend`, { token: a.token }),
          'post',
          '/teams/{teamId}/invites/{inviteId}/resend',
          404,
          'not_found',
        );
      },
      80_000,
    );
  });
});
