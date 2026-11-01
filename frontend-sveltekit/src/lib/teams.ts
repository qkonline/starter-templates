// Teams (PRD section 5): the rules the screens follow before the backend has to refuse, and the
// links an invite needs. The backend still decides; these only keep buttons honest.

import type { Member, Role } from '#lib/api/index.ts';

export const roles: readonly { value: Role; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer (sees, changes nothing)' },
  { value: 'admin', label: 'Admin' },
];

export const roleLabel = (role: Role): string =>
  role === 'admin' ? 'Admin' : role === 'viewer' ? 'Viewer' : 'Member';

/** "an admin", "a member", "a viewer". */
export const asRole = (role: Role): string =>
  role === 'admin' ? 'an admin' : role === 'viewer' ? 'a viewer' : 'a member';

/** Said with every `last_admin` refusal: what to do instead. */
export const lastAdminHint = 'Make someone else an admin first, or delete the team.';

/** The team's admins. */
export const admins = (members: readonly Member[]): Member[] => members.filter((m) => m.role === 'admin');

/** Whether this member is the team's only admin (who can't leave, be removed or step down). */
export function isLastAdmin(members: readonly Member[], userId: string): boolean {
  const list = admins(members);
  return list.length === 1 && list[0]!.userId === userId;
}

/** The token in an invite link (`/invite?token=…`), or null. */
export function inviteToken(url: { searchParams: { get(name: string): string | null } }): string | null {
  const token = url.searchParams.get('token')?.trim();
  return token && token.length <= 100 ? token : null;
}

/** The invite page's own path, to come back to after signing in or up. */
export const invitePath = (token: string): string => `/invite?token=${encodeURIComponent(token)}`;

/** `/signin?next=…` (or `/signup`) that returns to the invite. */
export function authPathFor(page: 'signin' | 'signup', token: string, base = ''): string {
  return `${base}/${page}?next=${encodeURIComponent(base + invitePath(token))}`;
}

/** The page of one team. Teams use a query parameter, so every page is a prerendered file. */
export const teamPath = (teamId: string, base = ''): string =>
  `${base}/team?id=${encodeURIComponent(teamId)}`;

/** Words for an invite that can't be used, which the backend answers `not_found` for. */
export function inviteGone(email: string | undefined): string {
  return (
    'This invite can’t be used. It may have expired, been withdrawn, or already been used' +
    (email ? `, or it was sent to an address other than ${email}.` : '.')
  );
}

/** Days until an invite runs out, for "Expires in 3 days". */
export function expiresIn(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Expired';
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? 'Expires within a day' : `Expires in ${days} days`;
}
