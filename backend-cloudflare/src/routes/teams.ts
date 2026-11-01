// Teams (PRD section 5), as boardo's boards: the maker is the first admin; admins rename and
// delete, invite, remove and change roles; members use the team. Invites go by email with a link
// that proves the address, and show in the app only to a confirmed email. A team is never left
// without an admin (db/teams.ts).

import { Hono } from 'hono';
import { photoUrl } from '../account';
import { cleanEmail, cleanName, isId, readBody } from '../checks';
import { randomToken, sha256 } from '../crypto';
import type { InviteRow, MemberRow, ReceivedInviteRow, Role, TeamRow } from '../db';
import type { Ctx } from '../env';
import { forbidden, invalid, lastAdmin, notFound, Refusal, tooMany } from '../errors';
import { DAY, limit } from '../limits';
import { sendMail, trHtml } from '../mail';
import { tr } from '../i18n';
import { needsConfirmedEmail, requireFeature, requireUser, type AppEnv } from '../middleware';
import { notify } from '../notify';
import { deleteTeam } from '../deletion';

const INVITE_MS = 7 * DAY;
const MAX_TEAMS = 50;
/** Invite emails a day from one team, and from one account (resends count). */
const INVITES_PER_TEAM_DAY = 50;
const INVITES_PER_ACCOUNT_DAY = 50;
/**
 * Invite emails a day from the whole app. Resend's free plan sends 100 a day for everything, and
 * the codes people need to sign in, reset and confirm come out of the same 100; stopping invites
 * at 80 leaves them at least 20. Raise it with the mail plan. Not counted with dev mail, where
 * nothing is sent.
 */
export const INVITE_MAILS_PER_DAY = 80;

/**
 * Counts one invite email against the team's, the inviter's and the app's daily limits, before
 * it's sent; `rate_limited` past any of them.
 */
export async function countInviteMail(ctx: Ctx, teamId: string, userId: string): Promise<void> {
  await limit(ctx, `invites:${teamId}`, INVITES_PER_TEAM_DAY, DAY, 'This team has sent as many invites as it can today. Try again tomorrow.');
  await limit(ctx, `invites:user:${userId}`, INVITES_PER_ACCOUNT_DAY, DAY, "You've sent as many invites as you can today. Try again tomorrow.");
  if (!ctx.cfg.devMail)
    await limit(ctx, 'invites:app', INVITE_MAILS_PER_DAY, DAY, "We've sent as many invites as we can today. Try again tomorrow.");
}

const iso = (ms: number) => new Date(ms).toISOString();
const isRole = (v: unknown): v is Role => v === 'admin' || v === 'member' || v === 'viewer';

const teamView = (t: TeamRow) => ({ id: t.id, name: t.name, role: t.role, memberCount: t.member_count, createdAt: iso(t.created) });
const memberView = (ctx: Ctx, m: MemberRow) => ({
  userId: m.user_id,
  name: m.name,
  email: m.email,
  photoUrl: photoUrl(ctx, m.user_id, m.photo),
  role: m.role,
  joinedAt: iso(m.joined),
});
const sentView = (i: InviteRow) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  invitedBy: { name: i.by_name, email: i.by_email },
  createdAt: iso(i.created),
  expiresAt: iso(i.expires),
});
export const receivedView = (i: ReceivedInviteRow) => ({
  id: i.id,
  team: { id: i.team_id, name: i.team_name },
  role: i.role,
  invitedBy: { name: i.by_name, email: i.by_email },
  expiresAt: iso(i.expires),
});

/** The team as this person sees it; one they aren't in is not there at all. */
async function teamFor(ctx: Ctx, teamId: string, userId: string): Promise<TeamRow> {
  const team = isId(teamId) ? await ctx.db.teamOf(teamId, userId) : null;
  if (!team) throw notFound();
  return team;
}

async function adminOf(ctx: Ctx, teamId: string, userId: string): Promise<TeamRow> {
  const team = await teamFor(ctx, teamId, userId);
  if (team.role !== 'admin') throw forbidden("Only the team's admins can do that.");
  return team;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The invite email, with the link to the frontend's /invite page. */
async function mailInvite(ctx: Ctx, i: { email: string; role: Role; by_name: string | null; by_email: string }, teamName: string, token: string) {
  const { lang } = ctx;
  const who = i.by_name ?? i.by_email;
  const link = `${ctx.cfg.appUrl}/invite?token=${token}`;
  const role = tr(lang, i.role === 'admin' ? 'an admin' : i.role === 'viewer' ? 'a viewer (who sees but changes nothing)' : 'a member');
  const vars = { who, team: teamName, app: ctx.cfg.title, role };
  const after = tr(lang, 'Sign in with this email address ({email}) to join. The invite works for 7 days.', { email: i.email });
  const join = tr(lang, 'Join the team');
  await sendMail(ctx, {
    to: i.email,
    subject: tr(lang, '{who} invited you to {team} on {app}', vars),
    text: `${tr(lang, '{who} invited you to join {team} on {app} as {role}.', vars)}\n\n${join}: ${link}\n\n${after}`,
    html:
      `<p style="font:16px/1.5 system-ui,sans-serif">${trHtml(lang, '{who} invited you to join {team} on {app} as {role}.', vars, ['team'])}</p>` +
      `<p><a href="${esc(link)}" style="display:inline-block;font:600 15px system-ui,sans-serif;background:#16181d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">${esc(join)}</a></p>` +
      `<p style="font:14px/1.5 system-ui,sans-serif;color:#5b6170">${esc(after)}</p>`,
  });
}

export const teams = new Hono<AppEnv>();

// Scoped to these paths: a sub-app's '*' would apply to every route once mounted.
for (const path of ['/teams', '/teams/*', '/invites', '/invites/*']) teams.use(path, requireFeature((cfg) => cfg.teams), requireUser);

teams.get('/teams', async (c) => {
  const { ctx, user } = c.var;
  return c.json({ teams: (await ctx.db.teamsOf(user.id)).map(teamView) });
});

teams.post('/teams', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['name']);
  const name = cleanName(b.name);
  if (!name) throw invalid('Give the team a name of 1 to 60 characters.');
  if ((await ctx.db.teamsOf(user.id)).length >= MAX_TEAMS) throw invalid("You're in {max} teams, as many as one person can be. Leave one first.", { max: MAX_TEAMS });
  const id = randomToken(12);
  await ctx.db.createTeam({ id, name, userId: user.id, now: Date.now() });
  return c.json({ team: teamView((await ctx.db.teamOf(id, user.id))!) });
});

teams.get('/teams/:teamId', async (c) => {
  const { ctx, user } = c.var;
  const team = await teamFor(ctx, c.req.param('teamId'), user.id);
  const [members, invites] = await Promise.all([
    ctx.db.members(team.id),
    team.role === 'admin' ? ctx.db.invites(team.id, Date.now()) : Promise.resolve([]),
  ]);
  return c.json({ team: teamView(team), members: members.map((m) => memberView(ctx, m)), invites: invites.map(sentView) });
});

teams.patch('/teams/:teamId', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  const b = await readBody(c.req.raw, ['name']);
  const name = cleanName(b.name);
  if (!name) throw invalid('Give the team a name of 1 to 60 characters.');
  await ctx.db.renameTeam(team.id, name);
  return c.json({ team: teamView({ ...team, name }) });
});

teams.delete('/teams/:teamId', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  await deleteTeam(ctx, team.id);
  return c.body(null, 204);
});

teams.patch('/teams/:teamId/members/:userId', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  const b = await readBody(c.req.raw, ['role']);
  if (!isRole(b.role)) throw invalid('Pick admin, member or viewer.');
  const target = c.req.param('userId');
  if (!isId(target)) throw notFound();
  const done = await ctx.db.setRole(team.id, target, b.role);
  if (done === 'gone') throw notFound();
  if (done === 'last_admin')
    throw lastAdmin(target === user.id ? "You're the team's only admin. Make someone else an admin first." : undefined);
  const member = await ctx.db.member(team.id, target);
  if (!member) throw notFound();
  return c.json({ member: memberView(ctx, member) });
});

teams.delete('/teams/:teamId/members/:userId', async (c) => {
  const { ctx, user } = c.var;
  const target = c.req.param('userId');
  // Anyone may leave; only admins remove others.
  const team = target === user.id ? await teamFor(ctx, c.req.param('teamId'), user.id) : await adminOf(ctx, c.req.param('teamId'), user.id);
  if (!isId(target)) throw notFound();
  const done = await ctx.db.removeMember(team.id, target);
  if (done === 'gone') throw notFound();
  if (done === 'last_admin')
    throw lastAdmin(target === user.id ? "You're the team's only admin. Make someone else an admin, or delete the team." : undefined);
  return c.body(null, 204);
});

teams.post('/teams/:teamId/invites', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  needsConfirmedEmail(user);
  const b = await readBody(c.req.raw, ['email', 'role']);
  const email = cleanEmail(b.email);
  if (!email) throw invalid("That doesn't look like an email address.");
  if (!isRole(b.role)) throw invalid('Pick admin, member or viewer.');
  const now = Date.now();
  const already = await ctx.db.alreadyIn(team.id, email, now);
  const taken = () => new Refusal(409, 'conflict', already === 'member' ? "They're already in this team." : "They're already invited.");
  if (already) throw taken();
  await countInviteMail(ctx, team.id, user.id);
  const token = randomToken(24);
  const row: InviteRow = {
    id: randomToken(12),
    team_id: team.id,
    email,
    role: b.role,
    by_name: user.name,
    by_email: user.email,
    created: now,
    sent: now,
    expires: now + INVITE_MS,
  };
  if (!(await ctx.db.createInvite({ ...row, tokenHash: await sha256(token) }))) throw new Refusal(409, 'conflict', "They're already invited.");
  try {
    await mailInvite(ctx, row, team.name, token);
  } catch (e) {
    // Unsent, it would only be in the way of trying again.
    await ctx.db.deleteInvite(row.id, { teamId: team.id });
    throw e;
  }
  const invitee = await ctx.db.userByEmail(email);
  if (invitee)
    await notify(ctx, [invitee.id], {
      title: tr(ctx.lang, '{who} invited you to {team}', { who: user.name ?? user.email, team: team.name }),
      body: tr(ctx.lang, 'Open your invites to join the team.'),
      url: '/invites',
    });
  return c.json({ invite: sentView(row) });
});

teams.delete('/teams/:teamId/invites/:inviteId', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  const id = c.req.param('inviteId');
  if (!isId(id) || !(await ctx.db.deleteInvite(id, { teamId: team.id }))) throw notFound();
  return c.body(null, 204);
});

teams.post('/teams/:teamId/invites/:inviteId/resend', async (c) => {
  const { ctx, user } = c.var;
  const team = await adminOf(ctx, c.req.param('teamId'), user.id);
  needsConfirmedEmail(user);
  const id = c.req.param('inviteId');
  const invite = isId(id) ? await ctx.db.invite(id) : null;
  if (!invite || invite.team_id !== team.id) throw notFound();
  // A minute; shorter in local development (INVITE_RESEND_GAP_S), so tests needn't wait.
  const gap = ctx.cfg.inviteResendGapMs;
  const now = Date.now();
  if (invite.sent > now - gap) throw tooMany(Math.max(1, Math.ceil((invite.sent + gap - now) / 1000)), 'The invite was just sent. Wait a minute before sending it again.');
  await countInviteMail(ctx, team.id, user.id);
  const token = randomToken(24);
  const done = await ctx.db.renewInvite(id, team.id, await sha256(token), now, now + INVITE_MS, gap);
  if (done === 'gone') throw notFound();
  if (done === 'wait') throw tooMany(Math.max(1, Math.ceil((invite.sent + gap - now) / 1000)), 'The invite was just sent. Wait a minute before sending it again.');
  await mailInvite(ctx, invite, team.name, token);
  return c.body(null, 204);
});

teams.get('/invites', async (c) => {
  const { ctx, user } = c.var;
  // Anyone can sign up with any address, so only a confirmed one sees what's sent to it.
  if (!user.email_verified) return c.json({ invites: [] });
  return c.json({ invites: (await ctx.db.invitesTo(user.email, Date.now())).map(receivedView) });
});

teams.post('/invites/accept', async (c) => {
  const { ctx, user } = c.var;
  const b = await readBody(c.req.raw, ['token', 'inviteId']);
  const now = Date.now();
  let invite: InviteRow | null;
  if (b.token !== undefined && b.inviteId === undefined) {
    if (typeof b.token !== 'string' || !b.token || b.token.length > 100) throw invalid("That invite link isn't complete. Open it from the email again.");
    invite = await ctx.db.inviteByToken(await sha256(b.token));
  } else if (b.inviteId !== undefined && b.token === undefined) {
    if (!isId(b.inviteId)) throw invalid('Pick an invite.');
    // Without the link, only a confirmed address shows the invite is theirs.
    invite = user.email_verified ? await ctx.db.invite(b.inviteId) : null;
  } else {
    throw invalid('Open the invite from its email, or from your invites.');
  }
  // Another account's invite is not there, the same as one that never was.
  if (!invite || invite.email !== user.email || invite.expires < now) throw notFound();
  // The same cap as making a team: joining one is how else someone's list of teams grows.
  if ((await ctx.db.teamsOf(user.id)).length >= MAX_TEAMS && !(await ctx.db.teamOf(invite.team_id, user.id)))
    throw invalid("You're in {max} teams, as many as one person can be. Leave one first.", { max: MAX_TEAMS });
  const used = await ctx.db.acceptInvite(invite.id, user.id, user.email, now);
  if (!used) throw notFound();
  // The emailed link proves the address.
  if (!user.email_verified) await ctx.db.setVerified(user.id);
  const team = await ctx.db.teamOf(used.team_id, user.id);
  if (!team) throw notFound();
  return c.json({ team: teamView(team) });
});

teams.post('/invites/:inviteId/decline', async (c) => {
  const { ctx, user } = c.var;
  const id = c.req.param('inviteId');
  if (!user.email_verified || !isId(id) || !(await ctx.db.deleteInvite(id, { email: user.email }))) throw notFound();
  return c.body(null, 204);
});
