// Everything kept about a person, as one download (PRD R2.5): the account, its devices and
// passkeys, and what the optional parts hold of theirs, whether or not those parts are on now
// (what was stored while one was on is still theirs).

import { sessionView, userView } from '../account';
import type { UserRow } from '../db';
import type { Ctx } from '../env';
import { messageView } from './admin';
import { notificationView } from './notifications';
import { passkeyView } from './passkeys';
import { receivedView } from './teams';

const iso = (ms: number) => new Date(ms).toISOString();

/** The push service's host, not the endpoint: the endpoint is a credential for pushing to them. */
const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
};

export async function exportOf(ctx: Ctx, user: UserRow, sessionId: string) {
  const { db } = ctx;
  const now = Date.now();
  const [sessions, keys, teams, notes, subs, messages, sent, received] = await Promise.all([
    db.sessions(user.id),
    db.passkeys(user.id),
    db.memberships(user.id),
    db.notifications(user.id, 0, null, 10_000),
    db.pushSubs(user.id),
    db.messagesBy(user.id),
    db.invitesBy(user.email, now),
    // As /invites: only a confirmed address shows what's sent to it.
    user.email_verified ? db.invitesTo(user.email, now) : Promise.resolve([]),
  ]);
  return {
    exportedAt: iso(now),
    user: userView(ctx, user),
    sessions: sessions.map((s) => sessionView(s, sessionId)),
    passkeys: keys.map(passkeyView),
    teams: teams.map((t) => ({ id: t.id, name: t.name, role: t.role, joinedAt: iso(t.joined) })),
    notifications: notes.map(notificationView),
    pushSubscriptions: subs.map((s) => ({ host: hostOf(s.endpoint), createdAt: iso(s.created) })),
    messages: messages.map(messageView),
    invitesSent: sent.map((i) => ({
      id: i.id,
      team: { id: i.team_id, name: i.team_name },
      email: i.email,
      role: i.role,
      createdAt: iso(i.created),
      expiresAt: iso(i.expires),
    })),
    invitesReceived: received.map(receivedView),
    // An app adds its own records here.
    data: {},
  };
}
