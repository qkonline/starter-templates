// The bell (each person's notifications) and the browsers that want push.

import type { Before } from '.';

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string | null;
  created: number;
  read_at: number | null;
}

export interface PushSubRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  created: number;
}

/** Browsers kept per person; saving one more forgets the oldest. */
const MAX_SUBS = 20;

export interface NotificationsDb {
  addNotifications(list: { id: string; userId: string; title: string; body: string; url: string | null; now: number }[]): Promise<void>;
  /** Newest first, made since `since`, older than `before` when given. */
  notifications(userId: string, since: number, before: Before | null, limit: number): Promise<NotificationRow[]>;
  unreadCount(userId: string, since: number): Promise<number>;
  /** Marks these (or all) read; ids that aren't this person's are left alone. */
  readNotifications(userId: string, ids: string[] | 'all', now: number): Promise<void>;

  /** Saves a browser's subscription for this person; the same endpoint again replaces it. */
  /** The subscription belongs to the session (device) that turned push on, and ends with it. */
  savePushSub(s: { endpoint: string; userId: string; sessionId: string | null; p256dh: string; auth: string; now: number }): Promise<void>;
  removePushSub(userId: string, endpoint: string): Promise<void>;
  pushSubs(userId: string): Promise<PushSubRow[]>;
  /** The push service says this browser is gone. */
  dropPushSub(endpoint: string): Promise<void>;
}

export function notificationsD1(DB: D1Database): NotificationsDb {
  return {
    async addNotifications(list) {
      // D1 takes at most 100 bound values a statement and a batch of statements is one transaction.
      for (let i = 0; i < list.length; i += 50)
        await DB.batch(
          list
            .slice(i, i + 50)
            .map((n) =>
              DB.prepare('INSERT INTO core_notifications (id, user_id, title, body, url, created) VALUES (?, ?, ?, ?, ?, ?)').bind(
                n.id,
                n.userId,
                n.title,
                n.body,
                n.url,
                n.now,
              ),
            ),
        );
    },
    async notifications(userId, since, before, limit) {
      const r = before
        ? await DB.prepare(
            `SELECT * FROM core_notifications WHERE user_id = ?1 AND created >= ?2 AND (created < ?3 OR (created = ?3 AND id < ?4))
             ORDER BY created DESC, id DESC LIMIT ?5`,
          )
            .bind(userId, since, before.at, before.id, limit)
            .all<NotificationRow>()
        : await DB.prepare('SELECT * FROM core_notifications WHERE user_id = ? AND created >= ? ORDER BY created DESC, id DESC LIMIT ?')
            .bind(userId, since, limit)
            .all<NotificationRow>();
      return r.results;
    },
    async unreadCount(userId, since) {
      const r = await DB.prepare('SELECT COUNT(*) AS n FROM core_notifications WHERE user_id = ? AND created >= ? AND read_at IS NULL')
        .bind(userId, since)
        .first<{ n: number }>();
      return r?.n ?? 0;
    },
    async readNotifications(userId, ids, now) {
      if (ids === 'all') {
        await DB.prepare('UPDATE core_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, userId).run();
        return;
      }
      for (let i = 0; i < ids.length; i += 90) {
        const part = ids.slice(i, i + 90);
        await DB.prepare(
          `UPDATE core_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${part.map(() => '?').join(',')})`,
        )
          .bind(now, userId, ...part)
          .run();
      }
    },

    async savePushSub(s) {
      await DB.batch([
        DB.prepare(
          `INSERT INTO core_push_subs (endpoint, user_id, session_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth, created = excluded.created`,
        ).bind(s.endpoint, s.userId, s.sessionId, s.p256dh, s.auth, s.now),
        DB.prepare(
          'DELETE FROM core_push_subs WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM core_push_subs WHERE user_id = ?1 ORDER BY created DESC LIMIT ?2)',
        ).bind(s.userId, MAX_SUBS),
      ]);
    },
    removePushSub: async (userId, endpoint) =>
      void (await DB.prepare('DELETE FROM core_push_subs WHERE endpoint = ? AND user_id = ?').bind(endpoint, userId).run()),
    async pushSubs(userId) {
      // Only those whose session is still signed in: a device signed out, or ended from another
      // device, gets nothing more (the sweep deletes the rest). One saved before subscriptions
      // had a session has none, and stays until its device turns push off or on again.
      return (
        await DB.prepare(
          `SELECT * FROM core_push_subs p WHERE p.user_id = ?
           AND (p.session_id IS NULL OR EXISTS (SELECT 1 FROM core_sessions s WHERE s.id = p.session_id))
           ORDER BY p.created`,
        )
          .bind(userId)
          .all<PushSubRow>()
      ).results;
    },
    dropPushSub: async (endpoint) => void (await DB.prepare('DELETE FROM core_push_subs WHERE endpoint = ?').bind(endpoint).run()),
  };
}
