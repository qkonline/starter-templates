import { describe, expect, it } from 'vitest';
import type { Member } from '#lib/api/index.ts';
import { authPathFor, expiresIn, inviteGone, invitePath, inviteToken, isLastAdmin, teamPath } from './teams';
import { safeNext } from './format';

const m = (userId: string, role: 'admin' | 'member'): Member => ({
  userId,
  role,
  name: null,
  email: `${userId}@x.test`,
  photoUrl: null,
  joinedAt: '2026-10-28T12:00:00.000Z',
});

describe('invite links', () => {
  it('reads the token from the link', () => {
    expect(inviteToken(new URL('https://a.test/invite?token=abc'))).toBe('abc');
    expect(inviteToken(new URL('https://a.test/invite'))).toBeNull();
    expect(inviteToken(new URL(`https://a.test/invite?token=${'x'.repeat(101)}`))).toBeNull();
  });

  it('sends people to sign in or up and back to the invite', () => {
    const signin = authPathFor('signin', 'a b&c');
    expect(signin).toBe('/signin?next=%2Finvite%3Ftoken%3Da%2520b%2526c');
    const next = new URL(signin, 'https://a.test').searchParams.get('next');
    expect(next).toBe(invitePath('a b&c'));
    // The sign-in page accepts it as somewhere to go next.
    expect(safeNext(next)).toBe(next);
    expect(new URL(next!, 'https://a.test').searchParams.get('token')).toBe('a b&c');
    expect(authPathFor('signup', 't', '/base')).toBe('/base/signup?next=%2Fbase%2Finvite%3Ftoken%3Dt');
  });

  it('builds team pages with a query parameter', () => {
    expect(teamPath('t/1')).toBe('/team?id=t%2F1');
  });

  it('says why an invite can’t be used, in plain words', () => {
    expect(inviteGone('a@x.test')).toContain('a@x.test');
    expect(inviteGone(undefined)).toMatch(/expired/);
  });

  it('counts the days left', () => {
    const now = Date.parse('2026-10-28T00:00:00Z');
    expect(expiresIn('2026-11-02T00:00:00Z', now)).toBe('Expires in 5 days');
    expect(expiresIn('2026-10-28T10:00:00Z', now)).toBe('Expires within a day');
    expect(expiresIn('2026-10-27T00:00:00Z', now)).toBe('Expired');
  });
});

describe('the last admin', () => {
  it('is the only admin', () => {
    expect(isLastAdmin([m('a', 'admin'), m('b', 'member')], 'a')).toBe(true);
    expect(isLastAdmin([m('a', 'admin'), m('b', 'admin')], 'a')).toBe(false);
    expect(isLastAdmin([m('a', 'admin'), m('b', 'member')], 'b')).toBe(false);
  });
});
