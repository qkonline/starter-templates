// The app's one connection to the backend. Import `api` from here; nothing else calls fetch.

import { PUBLIC_API_URL } from '$app/env/public';
import { readToken } from '#lib/device.ts';
import { i18n } from '#lib/i18n/index.svelte.ts';
import { createApi } from './client';

const hooks: { signedOut?: () => void; unverified?: () => void; outdated?: () => void } = {};

/** Set what happens when any reply says the session ended or the email needs confirming. */
export function setApiHooks(h: typeof hooks): void {
  Object.assign(hooks, h);
}

export const api = createApi({
  baseUrl: PUBLIC_API_URL,
  getToken: readToken,
  onSignedOut: () => hooks.signedOut?.(),
  onUnverified: () => hooks.unverified?.(),
  clientVersion: __BUILT_AT__,
  getLocale: () => i18n.locale,
  onOutdated: () => hooks.outdated?.(),
});

export { ApiError, messageOf } from './errors';
export type {
  User,
  Methods,
  SignIn,
  Session,
  Passkey,
  Export,
  Provider,
  Features,
  AppNotification,
  Role,
  TeamSummary,
  Member,
  SentInvite,
  ReceivedInvite,
  AdminUser,
  AdminStats,
  Message,
  ErrorReport,
  AuditEntry,
} from './client';
