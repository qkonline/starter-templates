// The only way this app talks to a backend: the paths in contract/openapi.yaml, typed from its
// generated types.ts, sent with openapi-fetch. Made by a factory so tests can hand in their own
// fetch and token; the app's one instance is in ./index.ts.
//
// Every signed-in request carries `Authorization: Bearer <token>`. Any reply with `signed_out`
// or `email_unverified` is reported to the hooks given here, whichever path it came from,
// including an app's own paths called through `client`.

import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from '@starter/contract/types';
import { ApiError, errorFrom, networkError } from './errors';

export type Schemas = components['schemas'];
export type User = Schemas['User'];
export type Methods = Schemas['Methods'];
export type SignIn = Schemas['SignIn'];
export type Session = Schemas['Session'];
export type Passkey = Schemas['Passkey'];
export type PasskeyChallenge = Schemas['PasskeyChallenge'];
export type Export = Schemas['Export'];
export type Provider = Schemas['Provider'];
export type Features = Schemas['Features'];
/** `Notification` is the browser's; this is the contract's. */
export type AppNotification = Schemas['Notification'];
export type PushSubscriptionBody = Schemas['PushSubscription'];
export type Role = Schemas['Role'];
export type TeamSummary = Schemas['TeamSummary'];
export type Member = Schemas['Member'];
export type SentInvite = Schemas['SentInvite'];
export type ReceivedInvite = Schemas['ReceivedInvite'];
export type AdminUser = Schemas['AdminUser'];
export type Message = Schemas['Message'];
export type ErrorReport = Schemas['ErrorReport'];
export type AuditEntry = Schemas['AuditEntry'];
export type AdminStats = paths['/admin/stats']['get']['responses'][200]['content']['application/json'];
export type ContactBody = NonNullable<
  paths['/contact']['post']['requestBody']
>['content']['application/json'];

export interface ApiOptions {
  /** The server URL, ending in /api. */
  baseUrl: string;
  /** The session token to send, if any. */
  getToken: () => string | null;
  /** A reply said the token no longer works. */
  onSignedOut?: () => void;
  /** A reply said the app holds this person back until they confirm their email. */
  onUnverified?: () => void;
  fetch?: typeof fetch;
}

type Reply<T> = { data?: T; error?: unknown; response: Response };

export function createApi(options: ApiOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchFn = options.fetch ?? ((input: Request) => globalThis.fetch(input));

  const auth: Middleware = {
    onRequest({ request }) {
      const token = options.getToken();
      if (token && !request.headers.has('authorization'))
        request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status !== 401 && response.status !== 403) return;
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null;
      // Only a request that sent a token can have been signed out.
      if (
        (code === 'signed_out' || (response.status === 401 && code == null)) &&
        request.headers.has('authorization')
      )
        options.onSignedOut?.();
      if (code === 'email_unverified') options.onUnverified?.();
    },
  };

  /** The typed client, for an app's own paths once they're in its contract. */
  const client = createClient<paths>({ baseUrl, fetch: fetchFn });
  client.use(auth);

  /** Await a call: its data, or an ApiError. */
  async function call<T>(request: Promise<Reply<T>>): Promise<T> {
    let reply: Reply<T>;
    try {
      reply = await request;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw networkError();
    }
    if (!reply.response.ok) throw errorFrom(reply.response.status, reply.error, reply.response.headers);
    return reply.data as T;
  }

  /** Optional fields stay out of the body rather than going as `undefined`. */
  const withCaptcha = <T extends object>(body: T, captcha?: string | null) =>
    captcha ? { ...body, captcha } : body;

  return {
    baseUrl,
    client,

    health: () => call(client.GET('/health')),
    methods: () => call(client.GET('/auth/methods')),

    // Email and password. `passwordKey` comes from #lib/password, never the password itself.
    signUp: (email: string, passwordKey: string, captcha?: string | null) =>
      call(client.POST('/auth/password/signup', { body: withCaptcha({ email, passwordKey }, captcha) })),
    signIn: (email: string, passwordKey: string, captcha?: string | null) =>
      call(client.POST('/auth/password/signin', { body: withCaptcha({ email, passwordKey }, captcha) })),
    forgotPassword: (email: string, captcha?: string | null) =>
      call(client.POST('/auth/password/forgot', { body: withCaptcha({ email }, captcha) })),
    resetPassword: (email: string, code: string, passwordKey: string) =>
      call(client.POST('/auth/password/reset', { body: { email, code, passwordKey } })),

    // Email code (when `methods.emailCode`).
    sendCode: (email: string, captcha?: string | null) =>
      call(client.POST('/auth/code/send', { body: withCaptcha({ email }, captcha) })),
    verifyCode: (email: string, code: string) =>
      call(client.POST('/auth/code/verify', { body: { email, code } })),

    // Passkey sign-in.
    passkeySignInStart: () => call(client.POST('/auth/passkey/start')),
    passkeySignInFinish: (challengeId: string, response: object) =>
      call(client.POST('/auth/passkey/finish', { body: { challengeId, response } })),

    // Social sign-in: the browser goes to this address (a link, not a fetch).
    oauthStartUrl: (provider: Provider, returnTo: string) =>
      `${baseUrl}/auth/oauth/${encodeURIComponent(provider)}/start?return=${encodeURIComponent(returnTo)}`,
    oauthExchange: (code: string) => call(client.POST('/auth/oauth/exchange', { body: { code } })),

    signOut: () => call(client.POST('/auth/signout')),

    // The account.
    me: () => call(client.GET('/me')).then((r) => r.user),
    setName: (name: string) => call(client.PATCH('/me', { body: { name } })).then((r) => r.user),
    deleteAccount: () => call(client.DELETE('/me')),
    changePassword: (currentPasswordKey: string, passwordKey: string) =>
      call(client.PUT('/me/password', { body: { currentPasswordKey, passwordKey } })),
    sendEmailConfirm: () => call(client.POST('/me/email/confirm/send')),
    confirmEmail: (code: string) =>
      call(client.POST('/me/email/confirm', { body: { code } })).then((r) => r.user),
    sendEmailChange: (email: string, captcha?: string | null) =>
      call(client.POST('/me/email/send', { body: withCaptcha({ email }, captcha) })),
    verifyEmailChange: (body: {
      email: string;
      code: string;
      currentPasswordKey?: string;
      passwordKey?: string;
    }) => call(client.POST('/me/email/verify', { body })).then((r) => r.user),
    setPhoto: (image: Blob) =>
      call(
        client.PUT('/me/photo', {
          // The body is the image itself, not JSON.
          body: image as unknown as string,
          bodySerializer: (b: unknown) => b as BodyInit,
          headers: { 'Content-Type': image.type },
        }),
      ).then((r) => r.user),
    removePhoto: () => call(client.DELETE('/me/photo')).then((r) => r.user),
    exportData: () => call(client.GET('/me/export')),

    // Devices.
    sessions: () => call(client.GET('/me/sessions')).then((r) => r.sessions),
    signOutOthers: () => call(client.DELETE('/me/sessions')),
    endSession: (id: string) => call(client.DELETE('/me/sessions/{id}', { params: { path: { id } } })),

    // Passkeys on the account.
    passkeys: () => call(client.GET('/me/passkeys')).then((r) => r.passkeys),
    addPasskeyStart: () => call(client.POST('/me/passkeys/start')),
    addPasskeyFinish: (challengeId: string, response: object) =>
      call(client.POST('/me/passkeys/finish', { body: { challengeId, response } })).then((r) => r.passkey),
    removePasskey: (id: string) => call(client.DELETE('/me/passkeys/{id}', { params: { path: { id } } })),

    // Which optional parts are on (PRD sections 4 to 6).
    features: () => call(client.GET('/features')),

    // Contact and feedback, signed in or out (PRD R7.1).
    contact: (body: ContactBody) => call(client.POST('/contact', { body })),

    // Push on this device, and the in-app list (PRD section 4).
    pushSubscribe: (subscription: PushSubscriptionBody) =>
      call(client.PUT('/me/push', { body: { subscription } })),
    pushUnsubscribe: (endpoint: string) => call(client.DELETE('/me/push', { body: { endpoint } })),
    pushTest: () => call(client.POST('/me/push/test')),
    notifications: (cursor?: string | null) =>
      call(client.GET('/me/notifications', { params: { query: cursor ? { cursor } : {} } })),
    readNotifications: (ids: string[]) =>
      call(client.POST('/me/notifications/read', { body: { ids } })).then((r) => r.unread),
    readAllNotifications: () =>
      call(client.POST('/me/notifications/read', { body: { all: true } })).then((r) => r.unread),

    // Teams (PRD section 5).
    teams: () => call(client.GET('/teams')).then((r) => r.teams),
    createTeam: (name: string) => call(client.POST('/teams', { body: { name } })).then((r) => r.team),
    team: (teamId: string) => call(client.GET('/teams/{teamId}', { params: { path: { teamId } } })),
    renameTeam: (teamId: string, name: string) =>
      call(client.PATCH('/teams/{teamId}', { params: { path: { teamId } }, body: { name } })).then(
        (r) => r.team,
      ),
    deleteTeam: (teamId: string) => call(client.DELETE('/teams/{teamId}', { params: { path: { teamId } } })),
    setRole: (teamId: string, userId: string, role: Role) =>
      call(
        client.PATCH('/teams/{teamId}/members/{userId}', {
          params: { path: { teamId, userId } },
          body: { role },
        }),
      ).then((r) => r.member),
    /** Remove a member, or leave with your own id. */
    removeMember: (teamId: string, userId: string) =>
      call(client.DELETE('/teams/{teamId}/members/{userId}', { params: { path: { teamId, userId } } })),
    invite: (teamId: string, email: string, role: Role) =>
      call(
        client.POST('/teams/{teamId}/invites', { params: { path: { teamId } }, body: { email, role } }),
      ).then((r) => r.invite),
    revokeInvite: (teamId: string, inviteId: string) =>
      call(client.DELETE('/teams/{teamId}/invites/{inviteId}', { params: { path: { teamId, inviteId } } })),
    resendInvite: (teamId: string, inviteId: string) =>
      call(
        client.POST('/teams/{teamId}/invites/{inviteId}/resend', { params: { path: { teamId, inviteId } } }),
      ),
    myInvites: () => call(client.GET('/invites')).then((r) => r.invites),
    acceptInvite: (by: { token: string } | { inviteId: string }) =>
      call(client.POST('/invites/accept', { body: by })).then((r) => r.team),
    declineInvite: (inviteId: string) =>
      call(client.POST('/invites/{inviteId}/decline', { params: { path: { inviteId } } })),

    // Admin area (PRD section 6).
    supportExchange: (code: string) => call(client.POST('/auth/support/exchange', { body: { code } })),
    adminStats: () => call(client.GET('/admin/stats')),
    adminUsers: (q: string, cursor?: string | null) =>
      call(
        client.GET('/admin/users', {
          params: { query: { ...(q.trim() ? { q: q.trim() } : {}), ...(cursor ? { cursor } : {}) } },
        }),
      ),
    adminUser: (userId: string) =>
      call(client.GET('/admin/users/{userId}', { params: { path: { userId } } })).then((r) => r.user),
    adminSuspend: (userId: string, reason?: string) =>
      call(
        client.POST('/admin/users/{userId}/suspend', {
          params: { path: { userId } },
          body: reason?.trim() ? { reason: reason.trim() } : {},
        }),
      ).then((r) => r.user),
    adminUnsuspend: (userId: string) =>
      call(client.POST('/admin/users/{userId}/unsuspend', { params: { path: { userId } } })).then(
        (r) => r.user,
      ),
    adminDeleteUser: (userId: string) =>
      call(client.DELETE('/admin/users/{userId}', { params: { path: { userId } } })),
    adminSupport: (userId: string) =>
      call(client.POST('/admin/users/{userId}/support', { params: { path: { userId } } })).then(
        (r) => r.code,
      ),
    adminMessages: (status: 'open' | 'done', cursor?: string | null) =>
      call(client.GET('/admin/messages', { params: { query: { status, ...(cursor ? { cursor } : {}) } } })),
    adminMessageStatus: (messageId: string, status: 'open' | 'done') =>
      call(
        client.PATCH('/admin/messages/{messageId}', { params: { path: { messageId } }, body: { status } }),
      ).then((r) => r.message),
    adminErrors: (cursor?: string | null) =>
      call(client.GET('/admin/errors', { params: { query: cursor ? { cursor } : {} } })),
    adminClearErrors: () => call(client.DELETE('/admin/errors')),
    adminAudit: (cursor?: string | null) =>
      call(client.GET('/admin/audit', { params: { query: cursor ? { cursor } : {} } })),
  };
}

export type Api = ReturnType<typeof createApi>;
