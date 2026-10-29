// A paged list for a page or panel: the first page, "Show more", and reloading from the top.

import { messageOf } from '#lib/api/errors.ts';
import { appendPage, type Page } from '#lib/paging.ts';

export class Pager<T> {
  items = $state<T[]>([]);
  next = $state<string | null>(null);
  loading = $state(false);
  loaded = $state(false);
  error = $state('');
  /** Bumped by `reload`, so a page that arrives after it is dropped. */
  private generation = 0;

  constructor(
    private readonly fetchPage: (cursor: string | null) => Promise<Page<T>>,
    private readonly key: (item: T) => string,
  ) {}

  get more(): boolean {
    return this.next !== null;
  }

  /** Start again from the first page. */
  async reload(): Promise<void> {
    const generation = ++this.generation;
    this.loading = true;
    this.error = '';
    try {
      const page = await this.fetchPage(null);
      if (generation !== this.generation) return;
      this.items = page.items;
      this.next = page.next;
      this.loaded = true;
    } catch (e) {
      if (generation === this.generation) this.error = messageOf(e);
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  /** The next page, below what's shown. */
  async loadMore(): Promise<void> {
    if (this.loading || this.next === null) return;
    const generation = this.generation;
    this.loading = true;
    this.error = '';
    try {
      const page = await this.fetchPage(this.next);
      if (generation !== this.generation) return;
      this.items = appendPage(this.items, page.items, this.key);
      this.next = page.next;
    } catch (e) {
      if (generation === this.generation) this.error = messageOf(e);
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  /** Change one item in place (after marking it read, suspending someone…). */
  update(id: string, change: (item: T) => T): void {
    this.items = this.items.map((item) => (this.key(item) === id ? change(item) : item));
  }

  remove(id: string): void {
    this.items = this.items.filter((item) => this.key(item) !== id);
  }
}
