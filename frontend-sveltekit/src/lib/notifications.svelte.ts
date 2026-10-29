// The in-app notifications behind the bell (PRD R4.1): newest first, 50 a page, an unread count,
// mark one or all read. Read again when the tab comes back into view and when a push arrives.

import { api, type AppNotification } from '#lib/api/index.ts';
import { Pager } from '#lib/pager.svelte.ts';

/** `list` with the given ones read at `at` (those already read keep their time). */
export function markedRead(list: readonly AppNotification[], ids: ReadonlySet<string> | 'all', at: string) {
  return list.map((n) => (n.readAt === null && (ids === 'all' || ids.has(n.id)) ? { ...n, readAt: at } : n));
}

class Notifications {
  unread = $state(0);
  readonly list = new Pager<AppNotification>(
    async (cursor) => {
      const page = await api.notifications(cursor);
      // The count is the backend's, whichever page carried it.
      this.unread = page.unread;
      return { items: page.notifications, next: page.next };
    },
    (n) => n.id,
  );

  refresh(): Promise<void> {
    return this.list.reload();
  }

  async markRead(n: AppNotification): Promise<void> {
    if (n.readAt) return;
    this.list.items = markedRead(this.list.items, new Set([n.id]), new Date().toISOString());
    this.unread = Math.max(0, this.unread - 1);
    try {
      this.unread = await api.readNotifications([n.id]);
    } catch {
      /* The next refresh puts it right. */
    }
  }

  async markAll(): Promise<void> {
    const before = this.list.items;
    const count = this.unread;
    this.list.items = markedRead(before, 'all', new Date().toISOString());
    this.unread = 0;
    try {
      this.unread = await api.readAllNotifications();
    } catch (e) {
      this.list.items = before;
      this.unread = count;
      throw e;
    }
  }

  /** Forget everything (signing out happens with a reload anyway). */
  clear(): void {
    this.list.items = [];
    this.unread = 0;
  }
}

export const notifications = new Notifications();
