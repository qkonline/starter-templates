<!--
  The bell (PRD R4.1): unread count, and the list below it, newest first, 50 at a time. Tapping a
  notification marks it read and opens its page. Read again when the tab comes back into view
  and when a push arrives (adapted from boardo's bell).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import type { AppNotification } from '#lib/api/index.ts';
  import { formatWhen, safeNext } from '#lib/format.ts';
  import { notifications } from '#lib/notifications.svelte.ts';
  import { onPush } from '#lib/pwa.svelte.ts';
  import { Task } from '#lib/task.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import FormError from './FormError.svelte';
  import Button from './ui/Button.svelte';

  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  let panel = $state<HTMLElement>();
  const all = new Task();
  const list = notifications.list;

  onMount(() => {
    notifications.refresh();
    let last = Date.now();
    const visible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
      last = Date.now();
      notifications.refresh();
    };
    document.addEventListener('visibilitychange', visible);
    const stop = onPush(() => notifications.refresh());
    return () => {
      document.removeEventListener('visibilitychange', visible);
      stop();
    };
  });

  async function toggle() {
    if (open) return close();
    open = true;
    notifications.refresh();
    await tick();
    panel?.focus();
  }

  function close() {
    open = false;
    button?.focus();
  }

  async function pick(n: AppNotification) {
    notifications.markRead(n);
    const to = safeNext(n.url);
    if (to) {
      open = false;
      await goto(to);
    }
  }

  const count = $derived(notifications.unread);
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }}
/>

<span class="bell">
  <button
    bind:this={button}
    type="button"
    class="icon"
    aria-label={count ? t('Notifications, {count} unread', { count }) : t('Notifications')}
    aria-expanded={open}
    aria-controls="bell-list"
    onclick={toggle}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6.5 2.5 7.5h-17C4.5 15.5 6 13.5 6 9Z M10 19.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    {#if count}<span class="count" aria-hidden="true">{count > 99 ? '99+' : count}</span>{/if}
  </button>

  {#if open}
    <button type="button" class="catch" aria-label={t('Close notifications')} tabindex="-1" onclick={close}
    ></button>
    <!-- ph-no-capture: what a notification says stays out of PostHog's autocapture. -->
    <section
      bind:this={panel}
      id="bell-list"
      class="panel pop ph-no-capture"
      aria-label={t('Notifications')}
      tabindex="-1"
    >
      <header>
        <h2>{t('Notifications')}</h2>
        {#if count}
          <Button
            type="button"
            variant="link"
            size="small"
            disabled={all.busy}
            onclick={() => all.run(() => notifications.markAll())}>{t('Mark all as read')}</Button
          >
        {/if}
      </header>
      <FormError message={all.error || list.error} />
      {#if list.loaded && list.items.length === 0}
        <p class="empty muted">{t('Nothing yet. Notifications show here.')}</p>
      {:else if !list.loaded && list.loading}
        <p class="empty muted">{t('Loading…')}</p>
      {/if}
      <ul>
        {#each list.items as n (n.id)}
          <li>
            <button type="button" class="item" class:unread={!n.readAt} onclick={() => pick(n)}>
              <span class="title">{n.title}</span>
              {#if n.body}<span class="body">{n.body}</span>{/if}
              <span class="when">{formatWhen(n.createdAt)}</span>
              {#if !n.readAt}<span class="dot"><span class="visually-hidden">{t('Unread')}</span></span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if list.more}
        <div class="more">
          <Button type="button" size="small" disabled={list.loading} onclick={() => list.loadMore()}>
            {list.loading ? t('Loading…') : t('Show older')}
          </Button>
        </div>
      {/if}
    </section>
  {/if}
</span>

<style>
  .bell {
    position: relative;
    display: inline-flex;
  }

  .icon {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--control-height);
    height: var(--control-height);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-muted);
    cursor: pointer;
  }

  .icon:hover,
  .icon[aria-expanded='true'] {
    color: var(--color-text);
    background: var(--color-sunken);
  }

  .count {
    position: absolute;
    top: 4px;
    right: 2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: var(--color-danger);
    color: var(--color-on-danger);
    font-size: var(--text-xs);
    font-weight: var(--weight-heading);
    line-height: 18px;
    text-align: center;
    box-shadow: 0 0 0 2px var(--color-bg);
  }

  .catch {
    position: fixed;
    inset: 0;
    z-index: var(--z-pop);
    border: 0;
    background: transparent;
    cursor: default;
  }

  .panel {
    position: absolute;
    z-index: calc(var(--z-pop) + 1);
    top: calc(100% + 6px);
    right: 0;
    width: 24rem;
    max-height: min(32rem, calc(100dvh - 6rem));
    overflow-y: auto;
    overscroll-behavior: contain;
    outline: none;
  }

  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  h2 {
    font-size: var(--text-md);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .item {
    position: relative;
    display: grid;
    gap: 2px;
    width: 100%;
    padding: var(--space-3) var(--space-6) var(--space-3) var(--space-4);
    border: 0;
    border-bottom: 1px solid var(--color-border);
    background: none;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item:hover {
    background: var(--color-sunken);
  }

  .title {
    font-size: var(--text-sm);
  }

  .unread .title {
    font-weight: var(--weight-heading);
  }

  .body {
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  .when {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .dot {
    position: absolute;
    top: 50%;
    right: var(--space-4);
    width: 8px;
    height: 8px;
    margin-top: -4px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .empty {
    padding: var(--space-5) var(--space-4);
    font-size: var(--text-sm);
  }

  .more {
    padding: var(--space-3) var(--space-4);
  }

  /* On a phone the list takes the width of the screen, below the bar. */
  @media (max-width: 30rem) {
    .panel {
      position: fixed;
      top: 4rem;
      left: var(--space-2);
      right: var(--space-2);
      width: auto;
    }
  }
</style>
