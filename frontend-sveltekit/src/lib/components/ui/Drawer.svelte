<!--
  A panel that slides in from the side over the page (DaisyUI's drawer): a menu on a phone,
  filters, details of a row. Escape, the ✕ and a click on the page behind close it.

    <Drawer title="Filters" bind:open side="end">…</Drawer>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.svelte.ts';

  const uid = $props.id();

  let {
    title,
    open = $bindable(false),
    side = 'start',
    children,
  }: {
    title: string;
    open?: boolean;
    side?: 'start' | 'end';
    children: Snippet;
  } = $props();

  let panel: HTMLElement;
  let before: Element | null = null;

  // Focus goes into the panel when it opens and back where it was when it closes.
  $effect(() => {
    if (!open) return;
    before = document.activeElement;
    // DaisyUI shows the panel with a transition, and it can't take focus until it's shown:
    // try each frame, for at most half a second.
    let frame = 0;
    let tries = 30;
    const focus = () => {
      panel.focus();
      if (document.activeElement !== panel && --tries > 0) frame = requestAnimationFrame(focus);
    };
    frame = requestAnimationFrame(focus);
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', escape);
      (before as HTMLElement | null)?.focus?.();
    };
  });
</script>

<div class={['drawer', { 'drawer-end': side === 'end' }]}>
  <input
    id="{uid}-toggle"
    type="checkbox"
    class="drawer-toggle"
    bind:checked={open}
    tabindex="-1"
    aria-hidden="true"
  />
  <div class="drawer-content"></div>
  <div class="drawer-side">
    <label for="{uid}-toggle" class="drawer-overlay" aria-hidden="true"></label>
    <div
      bind:this={panel}
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="{uid}-title"
      tabindex="-1"
      inert={!open}
    >
      <header>
        <h2 id="{uid}-title">{title}</h2>
        <button type="button" class="btn btn-ghost btn-sm btn-square" onclick={() => (open = false)}
          ><span aria-hidden="true">✕</span><span class="visually-hidden">{t('Close')}</span></button
        >
      </header>
      {@render children()}
    </div>
  </div>
</div>

<style>
  .drawer {
    position: fixed;
    inset: 0;
    z-index: var(--z-pop);
    pointer-events: none;
  }

  .drawer-toggle:checked ~ .drawer-side {
    pointer-events: auto;
  }

  .panel {
    min-height: 100%;
    width: min(20rem, 85vw);
    padding: var(--space-4);
    background: var(--color-base-100);
    outline: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
</style>
